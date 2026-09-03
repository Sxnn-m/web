// ─── Capa Firestore del ecosistema inventario + pedidos ───────────────
// Solo se usa desde el backoffice (rol admin). El catálogo público nunca
// importa este módulo: lee el booleano "disponible" del propio producto.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, deleteField,
} from 'firebase/firestore';
import {
  calcularDisponibilidad, buscarFilamento, specsDesdeReceta, lineasDeInsumo,
} from './disponibilidad.js';
import { registrarGastoEn } from './historial.js';
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
 * Marca un pedido como impreso: por cada línea del plan de consumo descuenta
 * del filamento (consumo de receta × cantidad + desperdicio informado) y
 * escribe el gasto en el historial del filamento. Además descuenta del
 * catálogo las unidades de insumo que consumió el pedido.
 *
 * @param {object} pedido
 * @param {Array}  plan        salida de planDeConsumo()
 * @param {object} desperdicios mapa clave-del-plan → gramos desperdiciados
 * @param {Array}  filamentos  inventario actual
 * @param {Array}  planInsumos salida de planDeInsumos()
 * @param {Array}  insumos     catálogo actual
 * @returns {{advertencias: string[]}} filamentos/insumos que no se pudieron descontar
 */
export async function marcarPedidoImpreso(
  pedido, plan, desperdicios = {}, filamentos = [], planInsumos = [], insumos = []
) {
  const advertencias = [];

  for (const linea of plan) {
    const filamento = buscarFilamento(filamentos, linea.material, linea.color);
    const desperdiciada = Number(desperdicios[linea.clave]) || 0;
    const total = linea.cantidadConsumida + desperdiciada;

    if (!filamento) {
      advertencias.push(
        `${linea.material} ${linea.color} (${linea.productoNombre}): no está en inventario, ` +
        `no se descontaron ${total} g.`
      );
      continue;
    }

    await registrarGastoEn(COL_FILAMENTOS, filamento._id, {
      producto: linea.productoNombre,
      cantidadConsumida: linea.cantidadConsumida,
      cantidadDesperdiciada: desperdiciada,
      numeroOrden: pedido.numeroOrden,
    }, total);
  }

  // Insumos: descuento directo de unidades, sin desperdicio ni historial.
  for (const linea of planInsumos) {
    const insumo = insumos.find(i => i._id === linea.insumoId);
    if (!insumo) {
      advertencias.push(
        `${linea.nombre} (${linea.productoNombre}): ya no está en el catálogo de insumos, ` +
        `no se descontaron ${linea.unidadesConsumidas} u.`
      );
      continue;
    }
    try {
      await registrarGastoEn("insumos", linea.insumoId, {
        producto: linea.productoNombre,
        cantidadConsumida: linea.unidadesConsumidas,
        numeroOrden: pedido.numeroOrden,
      }, linea.unidadesConsumidas);
    } catch (err) {
      advertencias.push(`${linea.nombre}: no se pudo descontar (${err.message}).`);
    }
  }

  await updateDoc(doc(db, COL_PEDIDOS, pedido._id), {
    estadoImpresion: "impreso",
    impresoAt: serverTimestamp(),
  });

  return { advertencias };
}
