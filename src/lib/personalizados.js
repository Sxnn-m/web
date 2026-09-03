// ─── Personalizados ──────────────────────────────────────────────────
// Piezas hechas a pedido de un cliente puntual. Mismo modelo de datos que
// "products" (receta, insumos, specs calculadas, precio con toggle manual,
// imágenes), pero:
//   · sin categoría, subcategoría ni tag;
//   · en vez del ID correlativo TKPx tienen "clienteNombre", texto libre;
//   · NUNCA salen al catálogo público: la colección es admin-only y ningún
//     componente de cara al público la consulta.
//
// Los datos privados (receta, insumos, origenUrl, notas) usan el mismo
// esquema que products: personalizados/{id}/privado/data.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { cargarPrivados, guardarPrivado, enriquecerProductos } from './productosPrivados.js';

export const COL_PERSONALIZADOS = "personalizados";

export async function cargarPersonalizados() {
  const snap = await getDocs(collection(db, COL_PERSONALIZADOS));
  return snap.docs
    .map(d => ({ _id: d.id, ...d.data() }))
    .sort((a, b) =>
      (a.clienteNombre || "").localeCompare(b.clienteNombre || "") ||
      (a.name || "").localeCompare(b.name || "")
    );
}

/** Personalizados + sus datos privados, listos para calcular disponibilidad. */
export async function cargarPersonalizadosCompletos() {
  const lista = await cargarPersonalizados();
  const privados = await cargarPrivados(lista, COL_PERSONALIZADOS);
  return enriquecerProductos(lista, privados);
}

/**
 * Alta o edición. Igual que en products, la receta y los insumos van a la
 * subcolección privada, no al documento principal.
 */
export async function guardarPersonalizado(data) {
  const { _id, receta, origenUrl, notas, insumos, ...publico } = data;
  const privado = {
    receta: receta || [],
    origenUrl: origenUrl || "",
    notas: notas || "",
    insumos: insumos || [],
  };

  let id = _id;
  if (id) {
    await updateDoc(doc(db, COL_PERSONALIZADOS, id), publico);
  } else {
    const ref = await addDoc(collection(db, COL_PERSONALIZADOS), {
      ...publico,
      createdAt: serverTimestamp(),
    });
    id = ref.id;
  }
  await guardarPrivado(id, privado, COL_PERSONALIZADOS);
  return id;
}

export async function eliminarPersonalizado(id) {
  await deleteDoc(doc(db, COL_PERSONALIZADOS, id));
}
