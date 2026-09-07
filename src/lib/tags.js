// ─── Tags de producto ────────────────────────────────────────────────
// La lista de tags disponibles vive en settings/tags, igual que la config
// de costos vive en settings/costos. El tag ELEGIDO se guarda en el doc del
// producto (que es de lectura pública, para que el catálogo pinte el badge);
// acá solo está el catálogo de opciones, que únicamente usa el backoffice.

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

export const DOC_TAGS = "tags";

/** Los que estaban hardcodeados en el formulario, para no arrancar en cero. */
export const TAGS_POR_DEFECTO = ["Best seller", "Nuevo", "Premium"];

/** Limpia, recorta y deduplica sin distinguir mayúsculas, conservando el orden. */
export function normalizarTags(valor) {
  const lista = Array.isArray(valor) ? valor : [];
  const vistos = new Set();
  const salida = [];
  for (const t of lista) {
    const texto = String(t || "").trim();
    if (!texto) continue;
    const clave = texto.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(texto);
  }
  return salida;
}

/** Productos que usan un tag, comparando sin distinguir mayúsculas. */
export function productosConTag(productos = [], tag) {
  const clave = String(tag || "").trim().toLowerCase();
  if (!clave) return [];
  return productos.filter(p => String(p?.tag || "").trim().toLowerCase() === clave);
}

/**
 * Lee la lista. Si el documento todavía no existe devuelve los tags por
 * defecto, así el selector nunca aparece vacío en un proyecto recién
 * arrancado. No se escribe nada hasta que el usuario agregue o borre uno.
 */
export async function cargarTags() {
  try {
    const snap = await getDoc(doc(db, "settings", DOC_TAGS));
    if (!snap.exists()) return [...TAGS_POR_DEFECTO];
    const lista = normalizarTags(snap.data().lista);
    return lista.length > 0 ? lista : [...TAGS_POR_DEFECTO];
  } catch (err) {
    console.warn("No se pudieron cargar los tags:", err);
    return [...TAGS_POR_DEFECTO];
  }
}

export async function guardarTags(lista) {
  await setDoc(doc(db, "settings", DOC_TAGS), {
    lista: normalizarTags(lista),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Borra un tag de la lista y lo limpia de los productos que lo tenían.
 *
 * Se eligió limpiar en vez de dejarlo como texto suelto: un tag borrado que
 * sigue pintando su badge en el catálogo público, sobre productos que ya no
 * se pueden gestionar desde ningún lado, es un borrado a medias. Además, al
 * abrir uno de esos productos en el formulario el tag se perdería igual, en
 * silencio, al guardar.
 *
 * @returns {Promise<{limpiados: number}>}
 */
export async function eliminarTag(tag, lista, productos = []) {
  const afectados = productosConTag(productos, tag);

  // Los updates van en lote: o se limpian todos o no se limpia ninguno.
  if (afectados.length > 0) {
    const lote = writeBatch(db);
    for (const p of afectados) {
      if (!p._id) continue;
      lote.update(doc(db, "products", p._id), { tag: "" });
    }
    await lote.commit();
  }

  const clave = String(tag).trim().toLowerCase();
  await guardarTags(lista.filter(t => t.trim().toLowerCase() !== clave));
  return { limpiados: afectados.length };
}
