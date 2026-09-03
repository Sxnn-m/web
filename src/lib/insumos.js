// ─── Catálogo de insumos ─────────────────────────────────────────────
// Componentes que no son filamento: imanes, tornillos, LEDs, cable.
// Colección propia, separada de "filamentos", con su stock en unidades.
// Solo la toca el backoffice (admin): el catálogo público no la lee.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  increment, serverTimestamp,
} from 'firebase/firestore';

export const COL_INSUMOS = "insumos";

export async function cargarInsumos() {
  const snap = await getDocs(collection(db, COL_INSUMOS));
  return snap.docs
    .map(d => ({ _id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

export async function crearInsumo({ nombre, precioUnidad = 0, cantidadDisponible = 0 }) {
  const ref = await addDoc(collection(db, COL_INSUMOS), {
    nombre: String(nombre).trim(),
    precioUnidad: Number(precioUnidad) || 0,
    cantidadDisponible: Number(cantidadDisponible) || 0,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarInsumo(id, { nombre, precioUnidad, cantidadDisponible }) {
  const data = { updatedAt: serverTimestamp() };
  if (nombre !== undefined) data.nombre = String(nombre).trim();
  if (precioUnidad !== undefined) data.precioUnidad = Number(precioUnidad) || 0;
  if (cantidadDisponible !== undefined) data.cantidadDisponible = Number(cantidadDisponible) || 0;
  await updateDoc(doc(db, COL_INSUMOS, id), data);
}

export async function eliminarInsumo(id) {
  await deleteDoc(doc(db, COL_INSUMOS, id));
}

/**
 * Descuenta unidades del catálogo. Se usa al marcar un pedido como impreso.
 * Puede dejar el stock en negativo a propósito: el pedido ya se imprimió en
 * la vida real, así que bloquearlo escondería el problema en vez de mostrarlo.
 */
export async function descontarInsumo(id, unidades) {
  const n = Number(unidades) || 0;
  if (n <= 0) return;
  await updateDoc(doc(db, COL_INSUMOS, id), {
    cantidadDisponible: increment(-n),
    updatedAt: serverTimestamp(),
  });
}
