// ─── Catálogo de insumos ─────────────────────────────────────────────
// Componentes que no son filamento: imanes, tornillos, LEDs, cable.
// Colección propia, separada de "filamentos", con su stock en unidades.
// Solo la toca el backoffice (admin): el catálogo público no la lee.
//
// Cada insumo tiene UNO O MÁS tipos (ver src/lib/tiposInsumo.js), y el precio
// y el stock viven en el tipo, no en el insumo. El documento plano viejo se
// migra solo: ver migrarInsumosPlanos() más abajo.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  runTransaction, serverTimestamp, deleteField,
} from 'firebase/firestore';
import {
  normalizarInsumo, necesitaMigracion, normalizarTipo, nuevoIdTipo,
  tiposDe, NOMBRE_TIPO_BASE,
} from './tiposInsumo.js';

export const COL_INSUMOS = "insumos";

/**
 * Reescribe en Firestore los insumos que todavía tienen el precio y el stock
 * en la raíz del documento.
 *
 * Es la migración del punto 7, y corre sola: no hay botón. El tipo que crea
 * es el "base" (id fijo, nombre "Estándar") con exactamente el precio y el
 * stock que el insumo ya tenía, así que ningún producto que lo use como fijo
 * cambia de comportamiento — sus líneas no guardan tipoId y buscarTipo() cae
 * justo en ese primer tipo.
 *
 * Los campos planos se borran para no dejar dos fuentes de verdad: a partir de
 * acá el stock que vale es el del tipo.
 */
export async function migrarInsumosPlanos(insumos = []) {
  const pendientes = insumos.filter(necesitaMigracion);
  if (pendientes.length === 0) return { migrados: 0 };

  const batch = writeBatch(db);
  for (const i of pendientes) {
    batch.update(doc(db, COL_INSUMOS, i._id), {
      tipos: normalizarInsumo(i).tipos,
      precioUnidad: deleteField(),
      cantidadDisponible: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { migrados: pendientes.length };
}

/**
 * Carga el catálogo ya normalizado (todos con su array de tipos) y, de paso,
 * persiste la migración de los que seguían planos.
 *
 * La normalización en memoria va primero y no depende de la escritura: si el
 * batch falla, la app igual funciona con los tipos derivados.
 */
export async function cargarInsumos() {
  const snap = await getDocs(collection(db, COL_INSUMOS));
  const crudos = snap.docs.map(d => ({ _id: d.id, ...d.data() }));

  try {
    await migrarInsumosPlanos(crudos);
  } catch (err) {
    console.error("No se pudo persistir la migración de insumos a tipos:", err);
  }

  return crudos
    .map(i => ({ ...normalizarInsumo(i), _id: i._id }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

/** Saneado del array de tipos que llega del formulario. Nunca queda vacío. */
export function tiposParaGuardar(tipos = []) {
  const limpios = (Array.isArray(tipos) ? tipos : [])
    .filter(t => t)
    .map((t, i) => normalizarTipo(t, i));
  if (limpios.length > 0) return limpios;
  return [normalizarTipo({ nombre: NOMBRE_TIPO_BASE }, 0)];
}

// "tipo" (singular) agrupa insumos relacionados al armar las variantes de un
// producto. Es descriptivo y NO tiene nada que ver con "tipos" (plural), que
// es donde viven el precio y el stock.
export async function crearInsumo({ nombre, tipo = "", tipos = [] }) {
  const ref = await addDoc(collection(db, COL_INSUMOS), {
    nombre: String(nombre).trim(),
    tipo: String(tipo).trim(),
    tipos: tiposParaGuardar(tipos),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarInsumo(id, { nombre, tipo, tipos }) {
  const data = { updatedAt: serverTimestamp() };
  if (nombre !== undefined) data.nombre = String(nombre).trim();
  if (tipo !== undefined) data.tipo = String(tipo).trim();
  if (tipos !== undefined) {
    data.tipos = tiposParaGuardar(tipos);
    // Un insumo que se guarda ya no puede quedar con los campos planos: si no,
    // volvería a verse como "sin migrar" en la próxima carga.
    data.precioUnidad = deleteField();
    data.cantidadDisponible = deleteField();
  }
  await updateDoc(doc(db, COL_INSUMOS, id), data);
}

/**
 * Agrega un tipo al insumo, leyéndolo dentro de una transacción para no pisar
 * un tipo que se haya agregado desde otra pestaña en el medio.
 */
export async function agregarTipo(id, { nombre, precioUnidad = 0, cantidadDisponible = 0 }) {
  const tipoId = nuevoIdTipo();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL_INSUMOS, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("El insumo ya no existe.");
    const actuales = tiposDe({ _id: id, ...snap.data() });
    tx.update(ref, {
      tipos: [...actuales, normalizarTipo({ tipoId, nombre, precioUnidad, cantidadDisponible }, 1)],
      precioUnidad: deleteField(),
      cantidadDisponible: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
  return tipoId;
}

/** Edita un tipo (nombre, precio, stock) sin tocar los demás. */
export async function actualizarTipo(id, tipoId, patch) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL_INSUMOS, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("El insumo ya no existe.");
    const tipos = tiposDe({ _id: id, ...snap.data() }).map(t =>
      t.tipoId === tipoId ? normalizarTipo({ ...t, ...patch }) : t);
    tx.update(ref, {
      tipos, precioUnidad: deleteField(), cantidadDisponible: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Elimina un tipo. Nunca deja el insumo sin ninguno: para eso está
 * eliminarInsumo(), que borra el insumo entero.
 */
export async function eliminarTipo(id, tipoId) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL_INSUMOS, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("El insumo ya no existe.");
    const tipos = tiposDe({ _id: id, ...snap.data() });
    if (tipos.length <= 1) {
      throw new Error("Un insumo no puede quedarse sin tipos. Eliminá el insumo entero.");
    }
    tx.update(ref, {
      tipos: tipos.filter(t => t.tipoId !== tipoId),
      precioUnidad: deleteField(), cantidadDisponible: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function eliminarInsumo(id) {
  await deleteDoc(doc(db, COL_INSUMOS, id));
}

// El descuento al imprimir un pedido va dentro de la transacción de
// marcarPedidoImpreso() en src/lib/inventario.js.
