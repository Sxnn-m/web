// ─── Historiales de stock, parametrizados por colección ──────────────
// Filamentos e insumos comparten el mismo patrón: subcolecciones "gastos"
// (automáticas, al imprimir un pedido) y "restocks" (carga manual).
//
// Dónde cuelgan cambia según la colección, porque el stock cambió de lugar:
//
//   filamentos/{id}/gastos            el stock vive en el documento
//   insumos/{id}/tipos/{tipoId}/gastos  el stock vive en un tipo del insumo
//
// El documento insumos/{id}/tipos/{tipoId} NO existe: los tipos son un array
// del insumo. Esa ruta es solo el espacio de nombres bajo el que cuelga el
// historial de cada tipo, y Firestore admite subcolecciones de un documento
// inexistente. Como las reglas no se heredan, ese nivel tiene su propio match
// en firestore.rules.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, doc, runTransaction,
  query, orderBy, increment, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { ID_TIPO_BASE, tiposDe, sumarStockDeTipo } from './tiposInsumo.js';

/** Config de cada colección con historial. */
export const HISTORIALES = {
  filamentos: { campoCantidad: "cantidadGramos", unidad: "g", porTipo: false },
  insumos: { campoCantidad: "cantidadDisponible", unidad: "u.", porTipo: true },
};

const configDe = (coleccion) => {
  const cfg = HISTORIALES[coleccion];
  if (!cfg) throw new Error(`Colección sin historial configurado: ${coleccion}`);
  return cfg;
};

/** Segmentos de la ruta del documento cuyo historial se pide. */
export function rutaDe(coleccion, docId, tipoId = null) {
  const { porTipo } = configDe(coleccion);
  return porTipo && tipoId
    ? [coleccion, docId, "tipos", tipoId]
    : [coleccion, docId];
}

const enMilis = (v) =>
  typeof v?.toMillis === "function" ? v.toMillis()
    : v ? new Date(v).getTime() || 0 : 0;

/** Lee una subcolección de historial, de la más reciente a la más vieja. */
export async function cargarHistorial(coleccion, docId, sub, tipoId = null) {
  const ruta = rutaDe(coleccion, docId, tipoId);
  const propios = await getDocs(
    query(collection(db, ...ruta, sub), orderBy("fecha", "desc"))
  );
  const filas = propios.docs.map(d => ({ _id: d.id, ...d.data() }));

  // El tipo base hereda el historial que se escribió antes de los tipos, que
  // quedó colgando del insumo. No se copia —una migración de subcolecciones
  // desde el cliente sería leer y reescribir todo— se lee de los dos lados y
  // se muestra unido.
  if (configDe(coleccion).porTipo && tipoId === ID_TIPO_BASE) {
    const viejos = await getDocs(
      query(collection(db, coleccion, docId, sub), orderBy("fecha", "desc"))
    );
    for (const d of viejos.docs) filas.push({ _id: `viejo:${d.id}`, ...d.data() });
    filas.sort((a, b) => enMilis(b.fecha) - enMilis(a.fecha));
  }

  return filas;
}

export const cargarGastosDe = (coleccion, docId, tipoId = null) =>
  cargarHistorial(coleccion, docId, "gastos", tipoId);
export const cargarRestocksDe = (coleccion, docId, tipoId = null) =>
  cargarHistorial(coleccion, docId, "restocks", tipoId);

/**
 * Todos los gastos de una lista de documentos, en una sola pasada.
 *
 * Cada gasto vuelve con el material y el color de SU filamento pegados: sin
 * eso no se puede valuar el desperdicio al costo del material del que salió.
 * Se lee documento por documento en paralelo, a propósito, en vez de con una
 * consulta de collection group: así no hace falta una regla nueva en
 * firestore.rules para el comodín recursivo sobre "gastos".
 *
 * @returns {Promise<Array>} gastos con { ..., filamentoId, material, color }
 */
export async function cargarGastosDeTodos(coleccion, docs = []) {
  const porDoc = await Promise.all(
    docs.map(async (d) => {
      const gastos = await cargarGastosDe(coleccion, d._id);
      return gastos.map(g => ({
        ...g,
        filamentoId: d._id,
        material: d.material || "",
        color: d.color || "",
      }));
    })
  );
  return porDoc.flat();
}

/**
 * Carga manual: registra el restock y suma la cantidad al stock.
 *
 * En filamentos el stock es un campo del documento y alcanza con increment().
 * En insumos vive dentro de un elemento del array "tipos", donde increment()
 * no llega: hay que releer el array en una transacción y reescribirlo entero.
 */
export async function registrarRestockEn(coleccion, docId, cantidadAgregada, nota = "", tipoId = null) {
  const { campoCantidad, porTipo } = configDe(coleccion);
  const cantidad = Number(cantidadAgregada) || 0;
  if (cantidad <= 0) throw new Error("La cantidad a agregar debe ser mayor a 0.");

  const ruta = rutaDe(coleccion, docId, tipoId);
  await addDoc(collection(db, ...ruta, "restocks"), {
    cantidadAgregada: cantidad,
    nota: String(nota || "").trim(),
    fecha: serverTimestamp(),
  });

  if (!porTipo) {
    await updateDoc(doc(db, coleccion, docId), {
      [campoCantidad]: increment(cantidad),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await runTransaction(db, async (tx) => {
    const ref = doc(db, coleccion, docId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("El insumo ya no existe.");
    const actuales = tiposDe({ _id: docId, ...snap.data() });
    tx.update(ref, {
      tipos: sumarStockDeTipo(actuales, tipoId, cantidad),
      // Por si el insumo todavía estaba plano: el stock pasa a vivir en el
      // tipo y los campos de la raíz no pueden quedar como segunda verdad.
      precioUnidad: deleteField(),
      cantidadDisponible: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

// El descuento al imprimir un pedido NO pasa por acá: va dentro de la
// transacción de marcarPedidoImpreso() en src/lib/inventario.js, que valida
// el stock y escribe los gastos de forma atómica.
