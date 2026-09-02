// ─── Escritura de la renumeración de IDs de producto ─────────────────
// Separado de idsProducto.js (que es puro y testeable) porque acá sí se
// toca Firestore.

import { db } from './../firebase.js';
import { doc, updateDoc } from 'firebase/firestore';

/**
 * Aplica el plan que el usuario revisó y confirmó: un updateDoc por producto,
 * escribiendo SOLO el campo "id". No se toca el resto del documento ni sus
 * subcolecciones (products/{id}/privado), que dependen del _id de Firestore.
 *
 * Durante la pasada puede haber IDs repetidos de forma transitoria (un producto
 * ya renumerado y otro todavía no); al terminar quedan todos únicos. Si algo
 * falla a mitad de camino, volver a correr el botón recalcula el mismo plan
 * sobre el mismo orden y termina el trabajo.
 *
 * @param {Array<{_id, idNuevo, cambia}>} plan  salida de planDeRenumeracion()
 * @returns {{actualizados: number, total: number, errores: Array<{nombre, error}>}}
 */
export async function aplicarRenumeracionIds(plan = []) {
  let actualizados = 0;
  const errores = [];

  for (const item of plan) {
    if (!item?._id || !item.cambia) continue;
    try {
      await updateDoc(doc(db, "products", item._id), { id: item.idNuevo });
      actualizados++;
    } catch (err) {
      errores.push({ nombre: item.nombre, error: err.message });
    }
  }

  return { actualizados, total: plan.length, errores };
}
