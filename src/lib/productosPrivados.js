// ─── Datos privados de producto ───────────────────────────────────────
// receta, origenUrl, notas e insumos NO viven en el doc de "products" (que
// es de lectura pública), sino en products/{id}/privado/data, restringido a
// admins por reglas. El catálogo público solo lee el booleano "disponible"
// del doc principal. Los insumos van acá porque son costos internos
// (proveedor y precio de cada componente), del mismo tipo que la receta.
//
// Todo está parametrizado por colección porque "personalizados" usa el mismo
// esquema (personalizados/{id}/privado/data). Por defecto es "products", así
// que las llamadas viejas siguen funcionando igual.

import { db } from './../firebase.js';
import {
  collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteField, serverTimestamp,
} from 'firebase/firestore';

/** Id fijo del único documento de la subcolección privada. */
export const DOC_PRIVADO = "data";

/** Campos que se mudaron fuera del doc público de products. */
export const CAMPOS_PRIVADOS = ["receta", "origenUrl", "notas", "insumos"];

export const privadoVacio = () => ({ receta: [], origenUrl: "", notas: "", insumos: [] });

/** Normaliza lo que venga de Firestore a la forma esperada por la UI. */
const normalizar = (data = {}) => ({
  receta: Array.isArray(data.receta) ? data.receta : [],
  origenUrl: data.origenUrl || "",
  notas: data.notas || "",
  insumos: Array.isArray(data.insumos) ? data.insumos : [],
});

export const COL_PRODUCTS = "products";

/** Lee los datos privados de un solo documento. */
export async function cargarPrivado(productId, coleccion = COL_PRODUCTS) {
  const snap = await getDoc(doc(db, coleccion, productId, "privado", DOC_PRIVADO));
  return snap.exists() ? normalizar(snap.data()) : privadoVacio();
}

/**
 * Lee los datos privados de todos los productos y devuelve un mapa
 * { [productId]: { receta, origenUrl, notas } }.
 *
 * Intenta una sola consulta de collection group; si el proyecto la rechaza
 * (falta de índice, por ejemplo) cae a una lectura por producto.
 */
export async function cargarPrivados(productos = [], coleccion = COL_PRODUCTS) {
  const mapa = {};
  try {
    const snap = await getDocs(collectionGroup(db, "privado"));
    snap.docs.forEach(d => {
      // El collection group trae los "privado" de TODAS las colecciones padre,
      // así que hay que quedarse solo con los de la que se pidió.
      if (d.ref.parent.parent?.parent?.id !== coleccion) return;
      const productoId = d.ref.parent.parent?.id;
      if (productoId) mapa[productoId] = normalizar(d.data());
    });
    return mapa;
  } catch (err) {
    console.warn("Collection group 'privado' no disponible, leyendo uno por uno:", err);
  }

  await Promise.all(productos.map(async p => {
    if (!p?._id) return;
    try {
      mapa[p._id] = await cargarPrivado(p._id, coleccion);
    } catch (e) {
      console.error(`No se pudieron leer los datos privados de ${p._id}:`, e);
    }
  }));
  return mapa;
}

/** Escribe (reemplazando) los datos privados de un producto. */
export async function guardarPrivado(
  productId, { receta = [], origenUrl = "", notas = "", insumos = [] }, coleccion = COL_PRODUCTS
) {
  await setDoc(doc(db, coleccion, productId, "privado", DOC_PRIVADO), {
    receta,
    origenUrl,
    notas,
    insumos,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Combina cada producto con sus datos privados. Todo lo que necesite la
 * receta (disponibilidad, plan de consumo de un pedido) trabaja sobre
 * esta lista enriquecida, nunca sobre el doc público pelado.
 */
export function enriquecerProductos(productos = [], privados = {}) {
  return productos.map(p => ({ ...p, ...privadoVacio(), ...(privados[p._id] || {}) }));
}

/**
 * Migración de una sola vez: mueve receta/origenUrl/notas que hayan quedado
 * en el doc público hacia la subcolección privada y los borra del principal.
 *
 * @returns {{migrados: number, revisados: number, detalle: string[]}}
 */
export async function migrarDatosPrivados(productos = []) {
  let migrados = 0;
  const detalle = [];

  for (const p of productos) {
    if (!p?._id) continue;
    const tieneEnPrincipal = CAMPOS_PRIVADOS.some(c => p[c] !== undefined);
    if (!tieneEnPrincipal) continue;

    // No pisar datos privados ya cargados: si la subcolección tiene algo,
    // solo se limpia el doc público.
    const yaPrivado = await cargarPrivado(p._id);
    const tienePrivado =
      yaPrivado.receta.length > 0 || yaPrivado.origenUrl || yaPrivado.notas ||
      yaPrivado.insumos.length > 0;

    if (!tienePrivado) {
      await guardarPrivado(p._id, {
        receta: Array.isArray(p.receta) ? p.receta : [],
        origenUrl: p.origenUrl || "",
        notas: p.notas || "",
        insumos: Array.isArray(p.insumos) ? p.insumos : [],
      });
    }

    await updateDoc(doc(db, "products", p._id), {
      receta: deleteField(),
      origenUrl: deleteField(),
      notas: deleteField(),
      insumos: deleteField(),
    });

    migrados++;
    detalle.push(
      `${p.name || p._id}${tienePrivado ? " (ya tenía datos privados, solo se limpió el doc público)" : ""}`
    );
  }

  return { migrados, revisados: productos.length, detalle };
}
