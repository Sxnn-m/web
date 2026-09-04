// ─── Mensajes del formulario de contacto ─────────────────────────────
// Única colección del proyecto con escritura pública: cualquiera puede crear
// un mensaje sin estar logueado. Leerlos, marcarlos y borrarlos es admin.
// Las reglas de firestore.rules validan el documento en el servidor; lo de
// acá es la validación de UX, no la barrera de seguridad.

import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { validarConsulta, ordenarMensajes, planDeNumeracion } from './consultas.js';

export const COL_MENSAJES = "mensajes";

/**
 * Crea el mensaje desde el formulario público, sin sesión.
 *
 * Los campos son exactamente los que las reglas permiten: cualquier campo de
 * más hace que el create sea rechazado. En particular NO se manda
 * numeroConsulta — lo asigna el backoffice (ver planDeNumeracion).
 *
 * @throws {Error} con el primer error de validación, si el formulario está mal
 */
export async function enviarMensaje({ nombre, email, mensaje }) {
  const { valido, errores, datos } = validarConsulta({ nombre, email, mensaje });
  if (!valido) throw new Error(Object.values(errores)[0]);

  const ref = await addDoc(collection(db, COL_MENSAJES), {
    nombre: datos.nombre,
    email: datos.email,
    mensaje: datos.mensaje,
    leido: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Todos los mensajes, del más reciente al más viejo. Solo admin. */
export async function cargarMensajes() {
  const snap = await getDocs(collection(db, COL_MENSAJES));
  return ordenarMensajes(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
}

/** Marca leído. Se llama al abrir el detalle; si ya estaba leído no escribe. */
export async function marcarLeido(id) {
  await updateDoc(doc(db, COL_MENSAJES, id), { leido: true, leidoAt: serverTimestamp() });
}

/**
 * Completa el numeroConsulta de los mensajes que llegaron sin número.
 *
 * Se corre al cargar el tab. Es idempotente: si todos ya tienen número no
 * escribe nada y devuelve 0.
 *
 * @returns {Promise<number>} cuántos se numeraron
 */
export async function asignarNumerosFaltantes(mensajes = []) {
  const plan = planDeNumeracion(mensajes);
  if (plan.length === 0) return 0;
  await Promise.all(plan.map(p =>
    updateDoc(doc(db, COL_MENSAJES, p._id), { numeroConsulta: p.numeroConsulta })
  ));
  return plan.length;
}

/** Borrado definitivo. Con el alta abierta al público, el spam es cuestión de tiempo. */
export async function eliminarMensaje(id) {
  await deleteDoc(doc(db, COL_MENSAJES, id));
}
