// ─── Estadísticas de ventas ──────────────────────────────────────────
// Funciones puras: no tocan Firestore. Todo se deriva de los pedidos ya
// cargados, del catálogo (con su receta privada) y de la configuración de
// costos vigente. No hay colección de estadísticas: si mañana cambia el
// precio del PLA, los números históricos se recalculan con el precio nuevo.
// Es una decisión explícita, no hay costos históricos guardados.

import { calcularRentabilidad, costoPorGramo } from './costos.js';

/** Categoría fija bajo la que caen los personalizados en el reparto. */
export const CATEGORIA_PERSONALIZADOS = "Personalizados";

/** Etiqueta para las líneas de catálogo cuyo producto ya no existe. */
export const CATEGORIA_SIN_CATEGORIA = "Sin categoría";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Normaliza cualquier forma de fecha que pueda llegar de Firestore a un Date.
 * Los pedidos guardan Timestamp, pero un doc migrado a mano puede traer
 * {seconds, nanoseconds} o un string ISO.
 */
export function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === "object" && typeof valor.seconds === "number") {
    return new Date(valor.seconds * 1000);
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-09" — la clave con la que se agrupa todo. */
export function claveMes(valor) {
  const d = aFecha(valor);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" → "Septiembre 2026" */
export function etiquetaMes(clave) {
  const [anio, mes] = String(clave || "").split("-");
  const i = parseInt(mes, 10) - 1;
  return MESES[i] ? `${MESES[i]} ${anio}` : String(clave || "—");
}

/** "2026-09" → "sep 26" — para los ejes, donde no entra el nombre completo. */
export function etiquetaMesCorta(clave) {
  const [anio, mes] = String(clave || "").split("-");
  const i = parseInt(mes, 10) - 1;
  return MESES_CORTOS[i] ? `${MESES_CORTOS[i]} ${String(anio).slice(-2)}` : String(clave || "—");
}

// ─── Filtro base ─────────────────────────────────────────────────────

/**
 * Una venta computable es un pedido ENTREGADO y PAGADO. Un pedido impreso
 * pero no entregado, o entregado pero sin cobrar, no es plata en el bolsillo
 * y no entra en ninguna estadística.
 */
export const esVenta = (pedido) =>
  pedido?.entregado === true && pedido?.estadoPago === "pagado";

/** Ventas computables que además se pueden ubicar en un mes. */
export function ventas(pedidos = []) {
  return pedidos.filter(p => esVenta(p) && claveMes(p.entregadoAt) !== null);
}

/**
 * Ventas que cumplen el filtro pero no tienen fecha de entrega utilizable
 * (pedidos viejos marcados antes de que existiera entregadoAt). No se pueden
 * asignar a ningún mes: se cuentan aparte para avisar en la UI, en vez de
 * desaparecer sin dejar rastro.
 */
export function ventasSinFecha(pedidos = []) {
  return pedidos.filter(p => esVenta(p) && claveMes(p.entregadoAt) === null);
}

export const ventasDelMes = (pedidos = [], mes) =>
  ventas(pedidos).filter(p => claveMes(p.entregadoAt) === mes);

/**
 * Meses que ofrece el selector: todos los que tienen al menos una venta
 * computable, más el mes en curso (aunque esté vacío, para poder mirarlo).
 * Del más reciente al más viejo.
 */
export function mesesDisponibles(pedidos = [], hoy = new Date()) {
  const set = new Set(ventas(pedidos).map(p => claveMes(p.entregadoAt)));
  set.add(claveMes(hoy));
  return [...set].sort().reverse();
}

/** Las n claves de mes que terminan en el mes de "hoy", de la más vieja a la más nueva. */
export function clavesUltimosMeses(hoy = new Date(), n = 12) {
  const claves = [];
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    claves.push(claveMes(d));
  }
  return claves;
}

// ─── Resolución de productos ─────────────────────────────────────────

/**
 * Índice por _id para no recorrer el catálogo entero por cada línea.
 * Las líneas sin "tipo" son de pedidos anteriores a Personalizados, cuando
 * todo salía de "products" (mismo criterio que buscarProductoDeLinea).
 */
export function indiceDeProductos(productos = [], personalizados = []) {
  return {
    catalogo: new Map(productos.map(p => [p._id, p])),
    personalizados: new Map(personalizados.map(p => [p._id, p])),
  };
}

export function productoDeLinea(item, indice) {
  const mapa = item?.tipo === "personalizado" ? indice.personalizados : indice.catalogo;
  return mapa.get(item?.productoId) || null;
}

/** Lo que facturó una línea: precio unitario × cantidad. */
export const ingresoDeLinea = (item) =>
  (Number(item?.precioUnitario) || 0) * (Number(item?.cantidad) || 0);

/**
 * Costo de fabricación de una línea, con la configuración de costos VIGENTE:
 * (gramos × costo/g + insumos) × cantidad. Es el mismo costoFabricacion que
 * muestra la tabla de Rentabilidad, así que los dos tabs no pueden divergir.
 *
 * Devuelve costo: null cuando no se puede calcular (producto borrado, sin
 * receta, o un material sin costo configurado). En ese caso la línea NO suma
 * costo y se reporta en el detalle, para no inventar una ganancia inflada
 * sin avisar.
 */
export function costoDeLinea(item, indice, costs) {
  const cantidad = Number(item?.cantidad) || 0;
  const producto = productoDeLinea(item, indice);
  if (!producto) return { costo: null, motivo: "El producto ya no existe" };
  const rent = calcularRentabilidad(producto, costs);
  if (!rent.calculable) return { costo: null, motivo: rent.motivo };
  return { costo: rent.costoFabricacion * cantidad, motivo: null };
}

// ─── KPIs ────────────────────────────────────────────────────────────

/**
 * Ingresos, costo y ganancia de un conjunto de ventas.
 *
 *   ingresos = Σ (precioUnitario × cantidad)
 *   costo    = Σ (costoFabricacion del producto × cantidad)
 *   ganancia = ingresos − costo
 *
 * @returns {{cantidadVentas, unidades, ingresos, costo, ganancia,
 *            margen: number, sinCosto: Array<{numeroOrden, producto, motivo}>}}
 */
export function resumenVentas(lista = [], indice, costs) {
  let ingresos = 0, costo = 0, unidades = 0;
  const sinCosto = [];

  for (const pedido of lista) {
    for (const item of pedido.items || []) {
      ingresos += ingresoDeLinea(item);
      unidades += Number(item?.cantidad) || 0;
      const { costo: c, motivo } = costoDeLinea(item, indice, costs);
      if (c === null) {
        sinCosto.push({
          numeroOrden: pedido.numeroOrden,
          producto: item?.productoNombre || item?.productoId || "—",
          motivo,
        });
      } else {
        costo += c;
      }
    }
  }

  const ganancia = ingresos - costo;
  return {
    cantidadVentas: lista.length,
    unidades, ingresos, costo, ganancia,
    margen: ingresos > 0 ? (ganancia / ingresos) * 100 : 0,
    sinCosto,
  };
}

/**
 * Desperdicio de material atribuible a un conjunto de ventas.
 *
 * Los gastos vienen de filamentos/{id}/gastos ya enriquecidos con el
 * material y el color de SU filamento: cada gramo desperdiciado se valúa al
 * costo del material del que salió, no a un promedio.
 *
 * El vínculo gasto → pedido es numeroOrden, que es lo único que guarda el
 * gasto. Un gasto sin numeroOrden (o de un pedido que todavía no está
 * entregado y cobrado) no entra.
 *
 * @returns {{gramos, dinero, materialesSinCosto: string[]}}
 */
export function desperdicioDeVentas(gastos = [], lista = [], costs) {
  const ordenes = new Set(lista.map(p => p?.numeroOrden).filter(Boolean));
  const materialesSinCosto = new Set();
  let gramos = 0, dinero = 0;

  for (const gasto of gastos) {
    if (!gasto?.numeroOrden || !ordenes.has(gasto.numeroOrden)) continue;
    const desperdicio = Number(gasto.cantidadDesperdiciada) || 0;
    if (desperdicio <= 0) continue;
    gramos += desperdicio;
    const cpg = costoPorGramo(gasto.material, costs);
    if (cpg === null) materialesSinCosto.add(gasto.material || "—");
    else dinero += desperdicio * cpg;
  }

  return { gramos, dinero, materialesSinCosto: [...materialesSinCosto] };
}

/** Los 4 KPIs de un mes, en una sola pasada. */
export function kpisDelMes(pedidos, gastos, mes, indice, costs) {
  const lista = ventasDelMes(pedidos, mes);
  return {
    mes,
    ventas: lista,
    ...resumenVentas(lista, indice, costs),
    desperdicio: desperdicioDeVentas(gastos, lista, costs),
  };
}

// ─── Serie histórica ─────────────────────────────────────────────────

/**
 * Ventas por mes de los últimos n meses. NO depende del mes seleccionado:
 * es la vista histórica, siempre termina en el mes en curso.
 *
 * @returns {Array<{mes, etiqueta, cantidad, unidades, monto, ganancia}>}
 */
export function serieVentasPorMes(pedidos = [], indice, costs, hoy = new Date(), n = 12) {
  const porMes = new Map();
  for (const pedido of ventas(pedidos)) {
    const clave = claveMes(pedido.entregadoAt);
    if (!porMes.has(clave)) porMes.set(clave, []);
    porMes.get(clave).push(pedido);
  }
  return clavesUltimosMeses(hoy, n).map(mes => {
    const resumen = resumenVentas(porMes.get(mes) || [], indice, costs);
    return {
      mes,
      etiqueta: etiquetaMesCorta(mes),
      cantidad: resumen.cantidadVentas,
      unidades: resumen.unidades,
      monto: resumen.ingresos,
      ganancia: resumen.ganancia,
    };
  });
}

// ─── Reparto por categoría ───────────────────────────────────────────

/**
 * Ventas del mes repartidas por categoría, POR UNIDADES VENDIDAS: el
 * porcentaje responde "de cada 10 piezas que salieron, cuántas fueron de
 * esta categoría". El monto facturado se calcula igual y viaja en el
 * resultado, pero no es el que manda el reparto ni el orden.
 *
 * Los personalizados van todos a una categoría fija, no tienen "cat".
 * Las líneas de catálogo cuyo producto se borró caen en "Sin categoría".
 *
 * @returns {Array<{categoria, monto, unidades, porcentaje}>} de mayor a menor
 */
export function ventasPorCategoria(lista = [], indice, categorias = []) {
  const nombreDeCat = new Map(categorias.map(c => [c.id, c.name]));
  const mapa = new Map();

  for (const pedido of lista) {
    for (const item of pedido.items || []) {
      let categoria;
      if (item?.tipo === "personalizado") {
        categoria = CATEGORIA_PERSONALIZADOS;
      } else {
        const producto = productoDeLinea(item, indice);
        categoria = nombreDeCat.get(producto?.cat) || producto?.cat || CATEGORIA_SIN_CATEGORIA;
      }
      const previo = mapa.get(categoria) || { categoria, monto: 0, unidades: 0 };
      previo.monto += ingresoDeLinea(item);
      previo.unidades += Number(item?.cantidad) || 0;
      mapa.set(categoria, previo);
    }
  }

  const total = [...mapa.values()].reduce((s, c) => s + c.unidades, 0);
  return [...mapa.values()]
    .map(c => ({ ...c, porcentaje: total > 0 ? (c.unidades / total) * 100 : 0 }))
    .sort((a, b) => b.unidades - a.unidades || b.monto - a.monto);
}
