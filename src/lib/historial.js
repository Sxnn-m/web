// ─── Historiales de stock, parametrizados por colección ──────────────
// Filamentos e insumos comparten el mismo patrón: subcolecciones "gastos"
// (automáticas, al imprimir un pedido) y "restocks" (carga manual).
// Lo único que cambia es la colección padre y el campo donde vive la
// cantidad: cantidadGramos en filamentos, cantidadDisponible en insumos.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  query, orderBy, increment, serverTimestamp,
} from 'firebase/firestore';

/** Config de cada colección con historial. */
export const HISTORIALES = {
  filamentos: { campoCantidad: "cantidadGramos", unidad: "g" },
  insumos: { campoCantidad: "cantidadDisponible", unidad: "u." },
};

const configDe = (coleccion) => {
  const cfg = HISTORIALES[coleccion];
  if (!cfg) throw new Error(`Colección sin historial configurado: ${coleccion}`);
  return cfg;
};

/** Lee una subcolección de historial, de la más reciente a la más vieja. */
export async function cargarHistorial(coleccion, docId, sub) {
  const snap = await getDocs(
    query(collection(db, coleccion, docId, sub), orderBy("fecha", "desc"))
  );
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

export const cargarGastosDe = (coleccion, docId) => cargarHistorial(coleccion, docId, "gastos");
export const cargarRestocksDe = (coleccion, docId) => cargarHistorial(coleccion, docId, "restocks");

/**
 * Carga manual: registra el restock y suma la cantidad al documento padre.
 * Sirve igual para gramos de filamento que para unidades de insumo.
 */
export async function registrarRestockEn(coleccion, docId, cantidadAgregada, nota = "") {
  const { campoCantidad } = configDe(coleccion);
  const cantidad = Number(cantidadAgregada) || 0;
  if (cantidad <= 0) throw new Error("La cantidad a agregar debe ser mayor a 0.");

  await addDoc(collection(db, coleccion, docId, "restocks"), {
    cantidadAgregada: cantidad,
    nota: String(nota || "").trim(),
    fecha: serverTimestamp(),
  });
  await updateDoc(doc(db, coleccion, docId), {
    [campoCantidad]: increment(cantidad),
    updatedAt: serverTimestamp(),
  });
}

// El descuento al imprimir un pedido NO pasa por acá: va dentro de la
// transacción de marcarPedidoImpreso() en src/lib/inventario.js, que valida
// el stock y escribe los gastos de forma atómica.
