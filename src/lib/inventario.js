// ─── Capa Firestore del ecosistema inventario + pedidos ───────────────
// Solo se usa desde el backoffice (rol admin). El catálogo público nunca
// importa este módulo: lee el booleano "disponible" del propio producto.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  runTransaction, serverTimestamp, deleteField,
} from 'firebase/firestore';
import {
  calcularDisponibilidad, buscarFilamento, specsDesdeReceta, lineasDeInsumo,
  claveFilamento,
} from './disponibilidad.js';
import { COL_INSUMOS } from './insumos.js';
import {
  agruparConsumo, validarStock, StockInsuficienteError,
} from './consumoPedido.js';
import { tiempoDeProducto, specsDeTiempo } from './tiempoImpresion.js';

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

export async function crearFilamento({ material, color, cantidadGramos = 0 }) {
  const ref = await addDoc(collection(db, COL_FILAMENTOS), {
    material: String(material).trim(),
    color: String(color).trim(),
    cantidadGramos: Number(cantidadGramos) || 0,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarFilamento(id, { material, color, cantidadGramos }) {
  const data = { updatedAt: serverTimestamp() };
  if (material !== undefined) data.material = String(material).trim();
  if (color !== undefined) data.color = String(color).trim();
  if (cantidadGramos !== undefined) data.cantidadGramos = Number(cantidadGramos) || 0;
  await updateDoc(doc(db, COL_FILAMENTOS, id), data);
}

export async function eliminarFilamento(id) {
  await deleteDoc(doc(db, COL_FILAMENTOS, id));
}

// Los historiales (gastos y restocks) viven en src/lib/historial.js,
// parametrizados por colección: los comparten filamentos e insumos.

// ─── Recálculo del booleano público "disponible" ─────────────────────

/**
 * Recalcula, para cada producto, todo lo que se deriva de su receta:
 *   - "disponible": el único dato de stock que ve el catálogo público.
 *   - specs.material y specs.peso: derivados de la receta, no editables a mano.
 *
 * Escribe una sola vez por producto y solo si algo cambió. Recibe productos
 * ya enriquecidos con su receta privada.
 *
 * @returns {{actualizados, disponibilidadActualizada, specsActualizadas, total}}
 */
export async function recalcularDisponibilidad(productos = [], filamentos = [], insumos = []) {
  let actualizados = 0;
  let disponibilidadActualizada = 0;
  let specsActualizadas = 0;
  let tiemposMigrados = 0;
  const tiemposIlegibles = [];   // productos cuyo texto viejo no se pudo parsear

  for (const p of productos) {
    if (!p?._id) continue;

    const { disponible } = calcularDisponibilidad(p, filamentos, insumos);
    const specs = specsDesdeReceta(p.receta || []);
    const patch = {};

    if (p.disponible !== disponible) patch.disponible = disponible;
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

    if (Object.keys(patch).length === 0) continue;

    await updateDoc(doc(db, COL_PRODUCTS, p._id), patch);
    actualizados++;
    if ("disponible" in patch) disponibilidadActualizada++;
    if ("specs.material" in patch || "specs.peso" in patch) specsActualizadas++;
  }

  return {
    actualizados, disponibilidadActualizada, specsActualizadas,
    tiemposMigrados, tiemposIlegibles, total: productos.length,
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

export async function crearPedido({ numeroOrden, clienteNombre, items }) {
  const lineas = items.map(i => ({
    productoId: i.productoId,
    // Código visible (TKPx) al momento del pedido: se guarda como snapshot
    // para que la línea siga siendo identificable aunque el producto se
    // renumere o se borre del catálogo.
    productoCodigo: i.productoCodigo || "",
    productoNombre: i.productoNombre,
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
    estadoImpresion: "pendiente",
    entregado: false,
    createdAt: serverTimestamp(),
    impresoAt: null,
    entregadoAt: null,
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
 * Devuelve, para un pedido, las líneas de consumo que habrá que descontar:
 * una por cada material/color de la receta de cada producto del pedido.
 * Es lo que alimenta el modal de "gramos desperdiciados".
 *
 * El match es SOLO por _id (el ID del documento de Firestore, que es lo que
 * guarda pedidos.items[].productoId y nunca cambia). No se compara contra el
 * campo "id" visible (TKPx): ese se puede renumerar, y un match por ahí
 * descontaría el filamento de otro producto sin avisar.
 */
export function planDeConsumo(pedido, productos = []) {
  const plan = [];
  for (const item of pedido.items || []) {
    const producto = productos.find(p => p._id === item.productoId);
    const receta = producto?.receta || [];
    for (const linea of receta) {
      const gramos = Number(linea.gramos) || 0;
      if (gramos <= 0) continue;
      plan.push({
        clave: `${item.productoId}|${linea.material}|${linea.color}`,
        productoId: item.productoId,
        productoNombre: item.productoNombre,
        material: linea.material,
        color: linea.color,
        gramosPorUnidad: gramos,
        cantidad: Number(item.cantidad) || 0,
        cantidadConsumida: gramos * (Number(item.cantidad) || 0),
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
export function planDeInsumos(pedido, productos = []) {
  const plan = [];
  for (const item of pedido.items || []) {
    const producto = productos.find(p => p._id === item.productoId);
    if (!producto) continue;
    const cantidadPedido = Number(item.cantidad) || 0;
    for (const linea of lineasDeInsumo(producto)) {
      plan.push({
        clave: `${item.productoId}|${linea.insumoId}`,
        productoId: item.productoId,
        productoNombre: item.productoNombre,
        insumoId: linea.insumoId,
        nombre: linea.nombre,
        cantidadPorUnidad: linea.cantidad,
        cantidad: cantidadPedido,
        unidadesConsumidas: linea.cantidad * cantidadPedido,
      });
    }
  }
  return plan;
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
 * @throws {StockInsuficienteError} cuando algún recurso no alcanza
 * @returns {{advertencias: string[]}}
 */
export async function marcarPedidoImpreso(
  pedido, plan, desperdicios = {}, filamentos = [], planInsumos = [], insumos = []
) {
  const consumo = agruparConsumo(plan, desperdicios, planInsumos);

  // IDs de documento a partir de los catálogos ya cargados.
  const idFilamento = (item) => {
    const f = buscarFilamento(filamentos, item.material, item.color);
    return f ? { id: f._id } : null;
  };
  const idInsumo = (item) => {
    const i = insumos.find(x => x._id === item.insumoId);
    return i ? { id: i._id } : null;
  };

  return runTransaction(db, async (tx) => {
    // ── 1. Lecturas (todas antes de cualquier escritura) ──
    const refsFilamento = new Map();
    const refsInsumo = new Map();
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
      const encontrado = idInsumo(i);
      if (!encontrado) continue;
      const ref = doc(db, COL_INSUMOS, encontrado.id);
      refsInsumo.set(i.insumoId, ref);
      const snap = await tx.get(ref);
      stockLeido.set(`i:${i.insumoId}`, snap.exists() ? Number(snap.data().cantidadDisponible) || 0 : null);
    }

    // ── 2. Validación contra lo recién leído ──
    const resultado = validarStock(
      consumo,
      (f) => {
        const v = stockLeido.get(`f:${f.clave}`);
        return v === undefined || v === null ? null : { id: f.clave, disponible: v };
      },
      (i) => {
        const v = stockLeido.get(`i:${i.insumoId}`);
        return v === undefined || v === null ? null : { id: i.insumoId, disponible: v };
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
    for (const i of resultado.insumos) {
      tx.update(refsInsumo.get(i.insumoId), {
        cantidadDisponible: i.disponible - i.total,
        updatedAt: serverTimestamp(),
      });
    }

    // Los gastos van por línea de pedido, para no perder qué producto consumió qué.
    for (const linea of plan) {
      const ref = refsFilamento.get(claveFilamento(linea.material, linea.color));
      if (!ref) continue;
      tx.set(doc(collection(ref, "gastos")), {
        producto: linea.productoNombre,
        cantidadConsumida: linea.cantidadConsumida,
        cantidadDesperdiciada: Number(desperdicios[linea.clave]) || 0,
        numeroOrden: pedido.numeroOrden,
        fecha: serverTimestamp(),
      });
    }
    for (const linea of planInsumos) {
      const ref = refsInsumo.get(linea.insumoId);
      if (!ref) continue;
      tx.set(doc(collection(ref, "gastos")), {
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

