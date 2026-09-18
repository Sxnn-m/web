// ─── Modo mantenimiento ──────────────────────────────────────────────
// La bandera vive en settings/general, igual que la config de costos vive en
// settings/costos. La diferencia importante es que ESTE documento sí es de
// lectura pública: el sitio tiene que poder saber si está clausurado antes de
// que exista ninguna sesión. Por eso no se guarda nada más que la bandera, y
// las reglas de Firestore validan con hasOnly que nunca se le agregue otro
// campo — un dato interno estacionado acá quedaría expuesto sin que se note.

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export const DOC_GENERAL = "general";

/**
 * Rutas que el modo mantenimiento NUNCA bloquea.
 *
 * "auth" es tan imprescindible como "admin". La navegación del sitio es estado
 * de React, no URLs: no hay un /admin al que llegar escribiéndolo. Si la
 * pantalla de login también quedara tapada, un admin que entra SIN sesión no
 * tendría ningún camino hacia el backoffice, y un mantenimiento activado por
 * error solo se podría apagar desde la consola de Firebase.
 */
export const RUTAS_ABIERTAS = ["auth", "admin"];

/**
 * Normaliza el documento a un booleano. Si todavía no existe, o el campo no
 * está, el sitio está ABIERTO: el estado por defecto de una tienda no es
 * "cerrada".
 */
export function estaEnMantenimiento(datos) {
  return datos?.mantenimientoActivo === true;
}

/**
 * El único criterio de bloqueo del sitio, acá y no desparramado por las
 * pantallas. Los admins nunca se bloquean: necesitan ver el sitio público tal
 * como quedó mientras trabajan, y llegar al Dashboard para desactivarlo.
 */
export function debeBloquear({ activo, esAdmin, ruta }) {
  if (!activo) return false;
  if (esAdmin) return false;
  return !RUTAS_ABIERTAS.includes(ruta);
}

/**
 * Se suscribe a la bandera y avisa cada vez que cambia, así el sitio se
 * clausura —y se reabre— sin que nadie recargue nada.
 *
 * Ante CUALQUIER error (reglas sin desplegar, sin conexión, proyecto mal
 * configurado) responde `false`. Un sitio que se cierra solo porque no pudo
 * leer una bandera es peor que uno que se queda abierto de más: el admin
 * siempre puede volver a cerrarlo, pero un visitante no puede hacer nada
 * contra una pantalla de mantenimiento que apareció por un error de lectura.
 *
 * @param {(activo: boolean) => void} alCambiar
 * @returns {() => void} para desuscribirse
 */
export function escucharMantenimiento(alCambiar) {
  try {
    return onSnapshot(
      doc(db, "settings", DOC_GENERAL),
      snap => alCambiar(estaEnMantenimiento(snap.exists() ? snap.data() : null)),
      err => {
        console.warn("No se pudo leer el modo mantenimiento:", err);
        alCambiar(false);
      },
    );
  } catch (err) {
    console.warn("No se pudo escuchar el modo mantenimiento:", err);
    alCambiar(false);
    return () => {};
  }
}

/** Lectura puntual, para el Dashboard al abrirse. */
export async function leerMantenimiento() {
  const snap = await getDoc(doc(db, "settings", DOC_GENERAL));
  return estaEnMantenimiento(snap.exists() ? snap.data() : null);
}

/**
 * Guarda la bandera. Va sin merge a propósito: el documento queda siempre con
 * exactamente estos dos campos, que es lo que las reglas permiten escribir en
 * un doc de lectura pública.
 */
export async function guardarMantenimiento(activo) {
  await setDoc(doc(db, "settings", DOC_GENERAL), {
    mantenimientoActivo: Boolean(activo),
    updatedAt: serverTimestamp(),
  });
}
