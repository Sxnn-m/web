// ─── Limpieza de campos viejos del doc público de productos ──────────
// La escritura. El plan lo calcula planDeLimpieza() en productoPublico.js,
// que es puro: acá solo se borra lo que ese plan ya decidió.
//
// POR QUÉ HACE FALTA
// El guardado de un producto usa updateDoc, que FUSIONA. Un campo que
// escribió una versión anterior de la app se queda en el documento para
// siempre aunque el código de hoy ya no lo escriba. Y products/{id} es la
// única colección con `allow read: if true`: lo que quedó ahí lo lee
// cualquiera que abra el sitio. El caso que importa es "stock", el contador
// manual del badge de "¡Últimas N unidades!", que sigue publicando una
// cantidad de inventario en los productos anteriores al cambio.

import { db } from './../firebase.js';
import { collection, getDocs, doc, writeBatch, deleteField } from 'firebase/firestore';
import { planDeLimpieza } from './productoPublico.js';

/** Solo products. Ninguna otra colección entra acá. */
export const COL_PRODUCTS = "products";

/**
 * Documentos por lote. Firestore admite 500 operaciones por batch; se usan
 * 400 para dejar margen, porque un producto puede aportar varias
 * eliminaciones de campo y conviene no quedar al borde del límite.
 */
export const TAMANO_LOTE = 400;

/** Lee toda la colección y devuelve el plan, sin escribir nada. */
export async function calcularPlanDeLimpieza() {
  const snap = await getDocs(collection(db, COL_PRODUCTS));
  return planDeLimpieza(snap.docs.map(d => ({ ...d.data(), _id: d.id })));
}

/** [1,2,3,4] con tamaño 2 → [[1,2],[3,4]] */
export const enLotes = (lista = [], tamano = TAMANO_LOTE) => {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
};

/**
 * Aplica el plan: por cada producto, un update que borra SOLO sus campos de
 * más con deleteField(). Nada más del documento se toca, así que un producto
 * ya limpio no entra en ningún lote y no se reescribe (su updatedAt, si
 * tiene, no se mueve).
 *
 * Un lote que falla no corta los demás: se registra con los productos que
 * tenía adentro y se sigue. El batch es atómico, así que si un lote falla no
 * se limpió ninguno de sus productos: por eso los errores se cuentan por
 * lote y no por producto.
 *
 * Idempotente: una segunda corrida recalcula el plan sobre documentos ya
 * limpios y no encuentra nada.
 *
 * @param {object} plan  salida de planDeLimpieza()
 * @returns {{limpiados, lotes, lotesOk, errores: Array<{productos: string[], error: string}>, ok: boolean}}
 */
export async function aplicarLimpieza(plan) {
  const productos = plan?.productos || [];
  const lotes = enLotes(productos);
  const errores = [];
  let limpiados = 0;
  let lotesOk = 0;

  for (const lote of lotes) {
    const batch = writeBatch(db);
    for (const p of lote) {
      const borrados = {};
      for (const campo of p.campos) borrados[campo.ruta] = deleteField();
      batch.update(doc(db, COL_PRODUCTS, p._id), borrados);
    }
    try {
      await batch.commit();
      limpiados += lote.length;
      lotesOk++;
    } catch (err) {
      errores.push({ productos: lote.map(p => p.nombre), error: err.message });
    }
  }

  return {
    limpiados,
    lotes: lotes.length,
    lotesOk,
    errores,
    // No hay "éxito" si algún lote falló, aunque los otros hayan andado.
    ok: errores.length === 0,
  };
}
