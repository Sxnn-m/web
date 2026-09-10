// ─── Capa Firestore del ecosistema inventario + pedidos ───────────────
// Solo se usa desde el backoffice (rol admin). El catálogo público nunca
// importa este módulo: lee el booleano "disponible" del propio producto.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  runTransaction, serverTimestamp, deleteField,
} from 'firebase/firestore';
import {
  buscarFilamento, specsDesdeReceta, lineasDeInsumo, claveFilamento,
} from './disponibilidad.js';
import { COL_INSUMOS } from './insumos.js';
import {
  agruparConsumo, validarStock, StockInsuficienteError, claveConsumoFilamento,
} from './consumoPedido.js';
import { tiempoDeProducto, specsDeTiempo } from './tiempoImpresion.js';
import { calcularPrecioSugerido } from './costos.js';
import { guardarPrivado } from './productosPrivados.js';
import {
  calcularDisponibilidad, consumoDeVariante, variantesPublicas,
  normalizarVariantesPublicas, migrarAVariante,
} from './variantes.js';
import {
  insumosDeSeleccion, gruposPublicos, normalizarGruposPublicos, opcionPedida,
} from './variantesInsumo.js';
import {
  tiposDe, tipoIdEfectivo, etiquetaDeReferencia, ID_TIPO_BASE,
} from './tiposInsumo.js';

export const COL_FILAMENTOS = "filamentos";
export const COL_PEDIDOS = "pedidos";
export const COL_PRODUCTS = "products";

// ─── Filamentos ──────────────────────────────────────────────────────

export async function cargarFilamentos() {
  const snap = await getDocs(collection(db, COL_FILAMENTOS));
  return snap.docs
    .map(d => ({ _id: d.id, ...d.data() }))
    .sort((a, b) =>
      (a.material || "").localeCompare(b.material || "") ||
      (a.color || "").localeCompare(b.color || "")
    );
}

// "marca" y "owner" son descriptivos: identifican el rollo y de quién es, pero
// NO entran en el matcheo de recetas, que empareja por material + color (ver
// src/lib/opcionesFilamento.js). Los dos son opcionales.
export async function crearFilamento({ material, color, marca = "", owner = "", cantidadGramos = 0 }) {
  const ref = await addDoc(collection(db, COL_FILAMENTOS), {
    material: String(material).trim(),
    color: String(color).trim(),
    marca: String(marca).trim(),
    owner: String(owner).trim(),
    cantidadGramos: Number(cantidadGramos) || 0,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarFilamento(id, { material, color, marca, owner, cantidadGramos }) {
  const data = { updatedAt: serverTimestamp() };
  if (material !== undefined) data.material = String(material).trim();
  if (color !== undefined) data.color = String(color).trim();
  if (marca !== undefined) data.marca = String(marca).trim();
  if (owner !== undefined) data.owner = String(owner).trim();
  if (cantidadGramos !== undefined) data.cantidadGramos = Number(cantidadGramos) || 0;
  await updateDoc(doc(db, COL_FILAMENTOS, id), data);
}

export async function eliminarFilamento(id) {
  await deleteDoc(doc(db, COL_FILAMENTOS, id));
}

/**
 * Crea en el inventario los material+color de una receta que todavía no
 * existan, con cantidadGramos: 0.
 *
 * Así, cargar una receta con un filamento que no tenés no obliga a ir antes
 * al tab Inventario: el rollo aparece solo, y como 0 < UMBRAL_RESTOCK queda
 * marcado con "Hacer restock" sin necesidad de un estado "pendiente" aparte.
 *
 * Consecuencia buscada: hasta que le cargues gramos, el producto queda NO
 * disponible en el catálogo público, porque la disponibilidad exige
 * FACTOR_DISPONIBILIDAD× los gramos de cada línea.
 *
 * Deduplica dentro de la misma receta y contra lo que va creando, así dos
 * líneas del mismo material+color no generan dos documentos.
 *
 * @returns {Promise<{creados: Array<{material, color}>}>}
 */
export async function asegurarFilamentosDeReceta(receta = [], filamentos = []) {
  const existentes = new Set(filamentos.map(f => claveFilamento(f.material, f.color)));
  const creados = [];

  for (const linea of receta) {
    const material = String(linea?.material || "").trim();
    const color = String(linea?.color || "").trim();
    if (!material || !color) continue;

    const clave = claveFilamento(material, color);
    if (existentes.has(clave)) continue;

    await crearFilamento({ material, color, cantidadGramos: 0 });
    existentes.add(clave);
    creados.push({ material, color });
  }

  return { creados };
}

/**
 * Migración a variantes: por cada producto que todavía tenga los colores
 * fijos en la receta, arma UNA variante con esos mismos colores.
 *
 * Es la traducción exacta del modelo viejo: el producto queda ofreciendo lo
 * que ya ofrecía, ni más ni menos. No inventa combinaciones ni pisa nada
 * cargado a mano.
 *
 * @param {boolean} soloSimular  true = no escribe, solo devuelve el detalle.
 *   El botón lo usa para mostrar qué va a pasar ANTES de tocar datos reales.
 * @returns {{migrados, revisados, saltados: Array<{nombre, motivo}>,
 *            detalle: Array<{nombre, variante, colores}>}}
 */
export async function migrarProductosAVariantes(productos = [], soloSimular = true) {
  const detalle = [];
  const saltados = [];

  for (const p of productos) {
    if (!p?._id) continue;
    const plan = migrarAVariante(p);
    if (!plan) {
      const motivo = (p.variantes || []).length > 0
        ? "ya tiene variantes"
        : (p.receta || []).length === 0
          ? "sin receta"
          : "la receta no tiene colores cargados";
      saltados.push({ nombre: p.name || p._id, motivo });
      continue;
    }

    detalle.push({
      nombre: p.name || p._id,
      variante: plan.variantePublica.nombre,
      colores: Object.values(plan.variantePrivada.colores),
    });

    if (soloSimular) continue;

    // Las dos mitades. El privado se reescribe entero (guardarPrivado no hace
    // merge), así que se le pasa todo lo que ya tenía.
    await guardarPrivado(p._id, {
      receta: plan.receta,
      origenUrl: p.origenUrl || "",
      notas: p.notas || "",
      insumos: p.insumos || [],
      archivos: p.archivos || [],
      variantes: [plan.variantePrivada],
    });
    await updateDoc(doc(db, COL_PRODUCTS, p._id), {
      variantes: [plan.variantePublica],
    });
  }

  return {
    migrados: soloSimular ? 0 : detalle.length,
    aMigrar: detalle.length,
    revisados: productos.length,
    saltados,
    detalle,
  };
}

// Los historiales (gastos y restocks) viven en src/lib/historial.js,
// parametrizados por colección: los comparten filamentos e insumos.

// ─── Recálculo del booleano público "disponible" ─────────────────────

/**
 * Recalcula, para cada producto, todo lo que se deriva de su receta:
 *   - "disponible": el único dato de stock que ve el catálogo público.
 *   - specs.material y specs.peso: derivados de la receta, no editables a mano.
 *   - "price", cuando se pasa `costs`: el precio de fórmula con la
 *     configuración vigente (multiplicador de margen incluido).
 *
 * El precio va acá y no en un barrido aparte porque necesita exactamente los
 * mismos datos que ya se cargaron para lo demás: el producto con su receta
 * privada. Un segundo botón repetiría toda esa lectura y dejaría abierta la
 * posibilidad de recalcular una cosa y olvidarse de la otra.
 *
 * Los productos con "Editar precio manualmente" NO se tocan: su precio es una
 * decisión tomada a mano, no un derivado de la receta.
 *
 * Escribe una sola vez por producto y solo si algo cambió. Recibe productos
 * ya enriquecidos con su receta privada.
 *
 * @param {object} [costs] configuración de costos. Sin ella no se toca ningún
 *   precio: así el recálculo automático por cambio de inventario sigue siendo
 *   solo de disponibilidad.
 * @returns {{actualizados, disponibilidadActualizada, specsActualizadas,
 *            preciosActualizados, total}}
 */
export async function recalcularDisponibilidad(productos = [], filamentos = [], insumos = [], costs = null) {
  let actualizados = 0;
  let disponibilidadActualizada = 0;
  let specsActualizadas = 0;
  let preciosActualizados = 0;
  let variantesActualizadas = 0;
  let tiemposMigrados = 0;
  const tiemposIlegibles = [];   // productos cuyo texto viejo no se pudo parsear

  for (const p of productos) {
    if (!p?._id) continue;

    const { disponible } = calcularDisponibilidad(p, filamentos, insumos);
    const specs = specsDesdeReceta(p.receta || []);
    const patch = {};

    if (p.disponible !== disponible) patch.disponible = disponible;

    // La mitad pública de las variantes: nombre, aclaración y si hay stock.
    // Nunca los colores — eso se queda en el subdocumento privado.
    const publicas = variantesPublicas(p, filamentos, insumos);
    if (JSON.stringify(normalizarVariantesPublicas(p.variantes)) !== JSON.stringify(publicas)) {
      patch.variantes = publicas;
    }

    // Ídem los grupos de insumo: nombre, precio de cada opción y si hay stock.
    // El insumo al que apuntan se queda en el doc privado.
    const gruposPub = gruposPublicos(p.variantesInsumo || [], insumos);
    if (JSON.stringify(normalizarGruposPublicos(p.variantesInsumo)) !== JSON.stringify(gruposPub)) {
      patch.variantesInsumo = gruposPub;
    }

    // Notación de punto: actualiza solo estas claves del mapa specs.
    if ((p.specs?.material || "") !== specs.material) patch["specs.material"] = specs.material;
    if ((p.specs?.peso || "") !== specs.peso) patch["specs.peso"] = specs.peso;

    // Migración del tiempo: del texto libre viejo a los tres campos nuevos.
    const tiempo = tiempoDeProducto(p);
    if (tiempo.origen !== "campos") {
      const nuevos = specsDeTiempo(tiempo.horas, tiempo.minutos);
      patch["specs.tiempoHoras"] = nuevos.tiempoHoras;
      patch["specs.tiempoMinutos"] = nuevos.tiempoMinutos;
      patch["specs.tiempoImpresionHorasDecimal"] = nuevos.tiempoImpresionHorasDecimal;
      if (tiempo.origen === "texto") tiemposMigrados++;
      if (tiempo.origen === "ilegible") {
        // Queda en 0/0 y se reporta para cargarlo a mano.
        tiemposIlegibles.push({ nombre: p.name || p._id, texto: p.specs?.tiempo });
      }
    }
    // El string libre deja de ser fuente de verdad.
    if (p.specs?.tiempo !== undefined) patch["specs.tiempo"] = deleteField();

    // Precio: solo con costs, solo en automático, y solo si la fórmula da un
    // número. Si la receta quedó sin costo calculable se deja el precio que
    // tenía: bajarlo a 0 lo publicaría gratis en el catálogo.
    if (costs && p.precioManual !== true) {
      const { calculable, precio } = calcularPrecioSugerido(p, costs);
      const actual = Number(p.price) || 0;
      // Los precios son pesos: diferencias por debajo del centavo son ruido
      // de punto flotante, no un cambio que valga una escritura.
      if (calculable && Math.abs(precio - actual) >= 0.01) patch.price = precio;
    }

    if (Object.keys(patch).length === 0) continue;

    await updateDoc(doc(db, COL_PRODUCTS, p._id), patch);
    actualizados++;
    if ("disponible" in patch) disponibilidadActualizada++;
    if ("specs.material" in patch || "specs.peso" in patch) specsActualizadas++;
    if ("price" in patch) preciosActualizados++;
    if ("variantes" in patch) variantesActualizadas++;
  }

  return {
    actualizados, disponibilidadActualizada, specsActualizadas,
    preciosActualizados, variantesActualizadas, tiemposMigrados, tiemposIlegibles,
    total: productos.length,
  };
}

// ─── Pedidos ─────────────────────────────────────────────────────────

export async function cargarPedidos() {
  const snap = await getDocs(collection(db, COL_PEDIDOS));
  return snap.docs
    .map(d => ({ _id: d.id, ...d.data() }))
    .sort((a, b) => (b.numeroOrden || "").localeCompare(a.numeroOrden || ""));
}

/** Correlativo ORD-0001 calculado sobre los pedidos ya existentes. */
export function siguienteNumeroOrden(pedidos = []) {
  const maximo = pedidos.reduce((max, p) => {
    const n = parseInt(String(p.numeroOrden || "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `ORD-${String(maximo + 1).padStart(4, "0")}`;
}

/**
 * El mapa grupoId → opcionId de una línea, saneado: solo pares de strings.
 * Firestore rechaza undefined, y un valor raro acá dejaría la línea sin poder
 * resolver qué insumo se vendió.
 */
export function normalizarOpcionesInsumo(opciones) {
  if (!opciones || typeof opciones !== "object") return {};
  const salida = {};
  for (const [grupoId, opcionId] of Object.entries(opciones)) {
    const g = String(grupoId || "").trim();
    const o = String(opcionId || "").trim();
    if (g && o) salida[g] = o;
  }
  return salida;
}

export async function crearPedido({ numeroOrden, clienteNombre, items }) {
  const lineas = items.map(i => ({
    productoId: i.productoId,
    // De qué colección salió la línea. Sin esto, al marcar el pedido como
    // impreso no se sabría dónde buscar la receta.
    tipo: i.tipo === "personalizado" ? "personalizado" : "catalogo",
    // Código visible (TKPx) al momento del pedido: se guarda como snapshot
    // para que la línea siga siendo identificable aunque el producto se
    // renumere o se borre del catálogo.
    productoCodigo: i.productoCodigo || "",
    productoNombre: i.productoNombre,
    // Qué se vendió en cada eje. Sin esto la línea queda igual que un pedido
    // anterior a las variantes: al marcarlo impreso no hay forma de saber de
    // qué rollo descontar el filamento ni qué insumo lleva cada grupo, y solo
    // se descuentan los insumos fijos.
    varianteId: i.varianteId || "",
    varianteNombre: i.varianteNombre || "",
    opcionesInsumo: normalizarOpcionesInsumo(i.opcionesInsumo),
    opcionesTexto: i.opcionesTexto || "",
    cantidad: Number(i.cantidad) || 0,
    precioUnitario: Number(i.precioUnitario) || 0,
    subtotal: (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0),
  }));
  const precioTotal = lineas.reduce((s, l) => s + l.subtotal, 0);
  const ref = await addDoc(collection(db, COL_PEDIDOS), {
    numeroOrden,
    clienteNombre: String(clienteNombre).trim(),
    items: lineas,
    precioTotal,
    // Los tres estados son independientes entre sí: se puede cobrar antes de
    // imprimir, o entregar sin haber cobrado.
    estadoImpresion: "pendiente",
    entregado: false,
    estadoPago: "pendiente",
    createdAt: serverTimestamp(),
    impresoAt: null,
    entregadoAt: null,
    pagadoAt: null,
  });
  return ref.id;
}

export async function eliminarPedido(id) {
  await deleteDoc(doc(db, COL_PEDIDOS, id));
}

/** Toggle simple de entrega, independiente del estado de impresión. */
export async function marcarEntregado(pedido, entregado) {
  await updateDoc(doc(db, COL_PEDIDOS, pedido._id), {
    entregado,
    entregadoAt: entregado ? serverTimestamp() : null,
  });
}

/**
 * Toggle simple de pago. Sin validación ni efectos: no toca inventario ni
 * depende de impresión ni de entrega. Se puede cobrar una seña antes de
 * imprimir, o entregar sin haber cobrado.
 */
export async function marcarPagado(pedido, pagado) {
  await updateDoc(doc(db, COL_PEDIDOS, pedido._id), {
    estadoPago: pagado ? "pagado" : "pendiente",
    pagadoAt: pagado ? serverTimestamp() : null,
  });
}

/** Los pedidos anteriores a este campo se leen como pendientes. */
export const estaPagado = (pedido) => pedido?.estadoPago === "pagado";

/**
 * Resuelve el producto de una línea de pedido en la colección que corresponda.
 * Las líneas sin "tipo" son de pedidos anteriores a Personalizados, cuando
 * todo salía de "products".
 */
export function buscarProductoDeLinea(item, productos = [], personalizados = []) {
  const lista = item?.tipo === "personalizado" ? personalizados : productos;
  return lista.find(p => p._id === item.productoId) || null;
}

/**
 * La variante de color que corresponde a una línea de pedido.
 *
 * El caso normal es directo: la línea guarda el varianteId elegido. Los otros
 * dos son pedidos anteriores a las variantes, que no guardaron ninguno:
 *
 *   - si el producto tiene UNA sola variante, es esa y no hay ambigüedad;
 *   - si tiene varias, no se adivina: se devuelve null y consumoDeVariante cae
 *     al color de la propia receta, que es lo que ese pedido usaba cuando se
 *     cargó. Recién si tampoco hay color ahí la línea queda incompleta.
 */
export function varianteDeLinea(item, producto) {
  const variantes = producto?.variantes || [];
  const pedida = variantes.find(v => v.id === item?.varianteId);
  if (pedida) return pedida;
  if (!item?.varianteId && variantes.length === 1) return variantes[0];
  return null;
}

/**
 * Devuelve, para un pedido, las líneas de consumo que habrá que descontar:
 * una por cada material/color de la receta de cada producto del pedido.
 * Es lo que alimenta el modal de "gramos desperdiciados".
 *
 * El match es SOLO por _id (el ID del documento de Firestore, que es lo que
 * guarda pedidos.items[].productoId y nunca cambia). No se compara contra el
 * campo "id" visible (TKPx): ese se puede renumerar, y un match por ahí
 * descontaría el filamento de otro producto sin avisar.
 *
 * La línea puede venir de "products" o de "personalizados": lo dice su campo
 * "tipo". Los pedidos viejos no lo tienen y son todos de catálogo.
 */
export function planDeConsumo(pedido, productos = [], personalizados = []) {
  const plan = [];
  for (const item of pedido.items || []) {
    const producto = buscarProductoDeLinea(item, productos, personalizados);
    const variante = varianteDeLinea(item, producto);
    for (const linea of consumoDeVariante(producto?.receta || [], variante)) {
      plan.push({
        clave: `${item.productoId}|${variante?.id || ""}|${linea.material}|${linea.color}`,
        productoId: item.productoId,
        productoNombre: item.productoNombre,
        varianteId: variante?.id || item.varianteId || null,
        // El nombre guardado en el pedido manda; los pedidos viejos no lo
        // tienen y se resuelve contra el producto.
        varianteNombre: item.varianteNombre || variante?.nombre || "",
        material: linea.material,
        color: linea.color,
        // Sin variante resuelta la línea queda sin color: se marca para que
        // el modal lo muestre como faltante en vez de descontar a ciegas.
        sinVariante: linea.incompleta,
        gramosPorUnidad: linea.gramos,
        cantidad: Number(item.cantidad) || 0,
        cantidadConsumida: linea.gramos * (Number(item.cantidad) || 0),
      });
    }
  }
  return plan;
}

/**
 * Insumos que consume un pedido: una línea por cada insumo de cada producto,
 * con el total de unidades a descontar del catálogo.
 *
 * A diferencia del filamento no hay desperdicio: un imán entra o no entra.
 */
export function planDeInsumos(pedido, productos = [], personalizados = [], catalogoInsumos = []) {
  const plan = [];
  for (const [indice, item] of (pedido.items || []).entries()) {
    const producto = buscarProductoDeLinea(item, productos, personalizados);
    if (!producto) continue;
    const cantidadPedido = Number(item.cantidad) || 0;
    // Los insumos FIJOS del producto, más el de la opción elegida en cada
    // grupo de variante de insumo. Un producto puede llevar los dos: el imán
    // siempre, y el LED según la luz que se haya pedido.
    const lineas = [
      // Los fijos resuelven acá su tipo contra el catálogo: las líneas
      // guardadas antes de los tipos no traen tipoId, y sin resolverlo ahora
      // la agrupación por tipo del pedido no podría emparejarlas con las de
      // variante, que sí lo traen.
      ...lineasDeInsumo(producto).map(l => ({
        ...l,
        tipoId: tipoIdEfectivo(catalogoInsumos, l.insumoId, l.tipoId),
        nombre: etiquetaDeReferencia(catalogoInsumos, l.insumoId, l.tipoId, l.nombre),
      })),
      ...insumosDeSeleccion(
        producto.variantesInsumo || [], item.opcionesInsumo || {}, catalogoInsumos),
    ];
    for (const linea of lineas) {
      plan.push({
        // El índice de la línea del pedido entra en la clave: el mismo
        // producto puede pedirse dos veces con opciones distintas, y sin él
        // los insumos fijos de las dos colisionaban (se usa como key de React
        // en el modal de impresión). El agrupado por insumo lo hace después
        // agruparConsumo, que suma por insumoId.
        clave: `${indice}|${item.productoId}|${linea.opcionId || ""}|${linea.insumoId}|${linea.tipoId || ""}`,
        productoId: item.productoId,
        productoNombre: item.productoNombre,
        insumoId: linea.insumoId,
        tipoId: linea.tipoId || "",
        nombre: linea.nombre,
        tipoNombre: linea.tipoNombre || "",
        grupoNombre: linea.grupoNombre || "",
        opcionNombre: linea.opcionNombre || "",
        cantidadPorUnidad: linea.cantidad,
        cantidad: cantidadPedido,
        unidadesConsumidas: linea.cantidad * cantidadPedido,
      });
    }
  }
  return plan;
}

/**
 * Grupos de variante de insumo que el pedido NO resolvió: el producto los
 * tiene, pero la línea no dice qué opción se vendió.
 *
 * Pasa con los pedidos anteriores a las variantes de insumo. No se puede
 * adivinar cuál era —cada opción consume un insumo distinto— así que esas
 * unidades no se descuentan. Antes eso ocurría en silencio; ahora el modal de
 * impresión las nombra, para que se descuenten a mano si hace falta.
 */
export function opcionesFaltantes(pedido, productos = [], personalizados = []) {
  const faltantes = [];
  for (const item of pedido?.items || []) {
    const producto = buscarProductoDeLinea(item, productos, personalizados);
    for (const grupo of producto?.variantesInsumo || []) {
      // Misma regla que usa el descuento: la opción pedida, o la única del
      // grupo. Si eso resuelve algo, no falta nada.
      if (opcionPedida(grupo, item.opcionesInsumo || {})) continue;
      faltantes.push({
        productoId: item.productoId,
        productoNombre: item.productoNombre || producto?.name || "",
        grupoId: grupo.id,
        grupoNombre: grupo.nombre || "(sin nombre)",
      });
    }
  }
  return faltantes;
}

/**
 * Marca un pedido como impreso, en UNA transacción:
 *   1. lee el stock de cada filamento e insumo involucrado DENTRO de la
 *      transacción (no con una lectura previa, que podría estar vieja);
 *   2. valida que alcance para el consumo TOTAL del pedido;
 *   3. si falta algo, aborta sin escribir nada y tira StockInsuficienteError
 *      con la lista completa de faltantes;
 *   4. si alcanza, descuenta, escribe los gastos y marca el pedido.
 *
 * Al ir todo en una transacción, un doble clic o dos pedidos confirmados a la
 * vez no pueden descontar de más: la segunda corrida vuelve a leer el stock ya
 * descontado y, si no alcanza, falla en vez de dejarlo en negativo.
 *
 * Los arrays filamentos/insumos se usan SOLO para resolver los IDs de
 * documento (una transacción no puede hacer queries); las cantidades siempre
 * salen de la lectura transaccional.
 *
 * @param {object} asignaciones de qué rollo sale cada línea del plan, cuando
 *   hay más de un owner con el mismo material+color. Ver agruparConsumo().
 * @throws {StockInsuficienteError} cuando algún recurso no alcanza
 * @returns {{advertencias: string[]}}
 */
export async function marcarPedidoImpreso(
  pedido, plan, desperdicios = {}, filamentos = [], planInsumos = [],
  insumos = [], asignaciones = {}
) {
  const consumo = agruparConsumo(plan, desperdicios, planInsumos, asignaciones);

  // IDs de documento a partir de los catálogos ya cargados. El owner elegido
  // manda: solo cuando no hay ninguno (un único rollo sin asignar, o un pedido
  // procesado desde otro lado) se cae a la búsqueda por material+color.
  const idFilamento = (item) => {
    if (item.filamentoId) return { id: item.filamentoId };
    const f = buscarFilamento(filamentos, item.material, item.color);
    return f ? { id: f._id } : null;
  };
  return runTransaction(db, async (tx) => {
    // ── 1. Lecturas (todas antes de cualquier escritura) ──
    const refsFilamento = new Map();
    // Los tipos de un insumo son un ARRAY del mismo documento: se lee una vez
    // por insumo, no una por tipo, o la segunda lectura traería el array sin
    // el descuento de la primera.
    const refsInsumo = new Map();      // insumoId → DocumentReference
    const tiposLeidos = new Map();     // insumoId → array de tipos recién leído
    const stockLeido = new Map();

    for (const f of consumo.filamentos) {
      const encontrado = idFilamento(f);
      if (!encontrado) continue;
      const ref = doc(db, COL_FILAMENTOS, encontrado.id);
      refsFilamento.set(f.clave, ref);
      const snap = await tx.get(ref);
      stockLeido.set(`f:${f.clave}`, snap.exists() ? Number(snap.data().cantidadGramos) || 0 : null);
    }

    for (const i of consumo.insumos) {
      if (!insumos.some(x => x._id === i.insumoId)) continue;
      if (!refsInsumo.has(i.insumoId)) {
        const ref = doc(db, COL_INSUMOS, i.insumoId);
        refsInsumo.set(i.insumoId, ref);
        const snap = await tx.get(ref);
        tiposLeidos.set(i.insumoId, snap.exists()
          ? tiposDe({ _id: i.insumoId, ...snap.data() })
          : null);
      }
      const tipos = tiposLeidos.get(i.insumoId);
      // Exacto, sin caer al primer tipo: el tipoId ya viene resuelto desde
      // planDeInsumos, así que si no está es porque lo borraron en el medio, y
      // descontar de otro tipo sería vaciar el stock equivocado en silencio.
      const tipo = tipos ? tipos.find(t => t.tipoId === i.tipoId) : null;
      stockLeido.set(`i:${i.clave}`, tipo ? Number(tipo.cantidadDisponible) || 0 : null);
    }

    // ── 2. Validación contra lo recién leído ──
    const resultado = validarStock(
      consumo,
      (f) => {
        const v = stockLeido.get(`f:${f.clave}`);
        return v === undefined || v === null ? null : { id: f.clave, disponible: v };
      },
      (i) => {
        const v = stockLeido.get(`i:${i.clave}`);
        return v === undefined || v === null ? null : { id: i.clave, disponible: v };
      }
    );

    if (!resultado.ok) throw new StockInsuficienteError(resultado.faltantes);

    // ── 3. Escrituras ──
    // Un update por documento con el valor final: escribir dos veces el mismo
    // doc en una transacción haría que la última escritura pise a la anterior.
    for (const f of resultado.filamentos) {
      tx.update(refsFilamento.get(f.clave), {
        cantidadGramos: f.disponible - f.total,
        updatedAt: serverTimestamp(),
      });
    }
    // Un solo update por insumo con el array de tipos ya descontado: dos
    // updates al mismo documento se pisarían y el segundo tipo se llevaría
    // puesto el descuento del primero.
    const nuevosTipos = new Map(tiposLeidos);
    for (const i of resultado.insumos) {
      const tipos = nuevosTipos.get(i.insumoId);
      if (!tipos) continue;
      nuevosTipos.set(i.insumoId, tipos.map(t => t.tipoId === i.tipoId
        ? { ...t, cantidadDisponible: i.disponible - i.total }
        : t));
    }
    for (const [insumoId, tipos] of nuevosTipos) {
      if (!tipos) continue;
      tx.update(refsInsumo.get(insumoId), {
        tipos,
        // El insumo que todavía estuviera plano queda migrado acá también.
        precioUnidad: deleteField(),
        cantidadDisponible: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }

    // Los gastos van por línea de pedido, para no perder qué producto consumió
    // qué. La clave es la MISMA que usó el agrupado, owner incluido: el gasto
    // tiene que quedar en el historial del rollo del que se descontó.
    for (const linea of plan) {
      const ref = refsFilamento.get(claveConsumoFilamento(linea, asignaciones));
      if (!ref) continue;
      tx.set(doc(collection(ref, "gastos")), {
        producto: linea.productoNombre,
        cantidadConsumida: linea.cantidadConsumida,
        cantidadDesperdiciada: Number(desperdicios[linea.clave]) || 0,
        numeroOrden: pedido.numeroOrden,
        fecha: serverTimestamp(),
      });
    }
    // El gasto de un insumo va al historial de SU tipo:
    // insumos/{id}/tipos/{tipoId}/gastos.
    for (const linea of planInsumos) {
      const ref = refsInsumo.get(linea.insumoId);
      if (!ref) continue;
      const tipoId = linea.tipoId || ID_TIPO_BASE;
      tx.set(doc(collection(ref, "tipos", tipoId, "gastos")), {
        producto: linea.productoNombre,
        cantidadConsumida: linea.unidadesConsumidas,
        numeroOrden: pedido.numeroOrden,
        fecha: serverTimestamp(),
      });
    }

    tx.update(doc(db, COL_PEDIDOS, pedido._id), {
      estadoImpresion: "impreso",
      impresoAt: serverTimestamp(),
    });

    return { advertencias: [] };
  });
}

