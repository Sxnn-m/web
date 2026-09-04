// ─── Consultas del formulario público ────────────────────────────────
// Funciones puras: validación del formulario y numeración correlativa.
// La capa Firestore vive en src/lib/mensajes.js.

export const PREFIJO_CONSULTA = "CON";

/** Largos máximos. Los mismos valores están replicados en firestore.rules. */
export const LIMITES = { nombre: 100, email: 200, mensaje: 5000 };

/**
 * Valida lo que se escribió en el formulario público.
 *
 * El chequeo de email es a propósito laxo (algo@algo.algo): la validación
 * estricta de direcciones rechaza casillas válidas y lo único que importa acá
 * es que se pueda contestar. Si está mal escrita, se ve en el backoffice.
 *
 * @returns {{valido: boolean, errores: {nombre?, email?, mensaje?}, datos}}
 */
export function validarConsulta({ nombre = "", email = "", mensaje = "" } = {}) {
  const datos = {
    nombre: String(nombre).trim(),
    email: String(email).trim(),
    mensaje: String(mensaje).trim(),
  };
  const errores = {};

  if (!datos.nombre) errores.nombre = "Poné tu nombre.";
  else if (datos.nombre.length > LIMITES.nombre) errores.nombre = `Máximo ${LIMITES.nombre} caracteres.`;

  if (!datos.email) errores.email = "Poné un email para poder contestarte.";
  else if (datos.email.length > LIMITES.email) errores.email = `Máximo ${LIMITES.email} caracteres.`;
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) errores.email = "Ese email no parece válido.";

  if (!datos.mensaje) errores.mensaje = "Contanos algo del proyecto.";
  else if (datos.mensaje.length > LIMITES.mensaje) errores.mensaje = `Máximo ${LIMITES.mensaje} caracteres.`;

  return { valido: Object.keys(errores).length === 0, errores, datos };
}

/** Número de un "CON-0007" → 7. Devuelve 0 si no tiene el formato. */
export function numeroDeConsulta(numeroConsulta) {
  const n = parseInt(String(numeroConsulta || "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** "CON-0001" a partir de los mensajes que ya tienen número. */
export function siguienteNumeroConsulta(mensajes = []) {
  const maximo = mensajes.reduce(
    (max, m) => Math.max(max, numeroDeConsulta(m?.numeroConsulta)), 0
  );
  return `${PREFIJO_CONSULTA}-${String(maximo + 1).padStart(4, "0")}`;
}

/** Milisegundos de un createdAt de Firestore, para ordenar. 0 si no hay fecha. */
export function fechaEnMs(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Mensajes del más reciente al más viejo, que es como se lee una bandeja.
 * Un mensaje recién creado puede llegar con createdAt todavía en null (el
 * serverTimestamp no resolvió): va primero, porque es el más nuevo.
 */
export function ordenarMensajes(mensajes = []) {
  return [...mensajes].sort((a, b) => {
    const fa = fechaEnMs(a?.createdAt), fb = fechaEnMs(b?.createdAt);
    if (fa === 0 && fb !== 0) return -1;
    if (fb === 0 && fa !== 0) return 1;
    return fb - fa;
  });
}

/**
 * Qué número le toca a cada mensaje que todavía no tiene.
 *
 * El formulario público NO puede numerar: para saber cuál es el último número
 * habría que leer la colección, y leerla es justamente lo que las reglas le
 * prohíben a un visitante anónimo. Así que el documento se crea sin número y
 * el backoffice se lo asigna al abrir el tab, con la sesión admin que sí puede
 * leer. Se numeran por orden de llegada (createdAt ascendente), para que el
 * correlativo siga el orden real en que entraron las consultas.
 *
 * Es idempotente: un mensaje que ya tiene número no se toca.
 *
 * @returns {Array<{_id, numeroConsulta}>} solo los que hay que escribir
 */
export function planDeNumeracion(mensajes = []) {
  const sinNumero = mensajes
    .filter(m => !m?.numeroConsulta)
    .sort((a, b) => fechaEnMs(a?.createdAt) - fechaEnMs(b?.createdAt));

  let siguiente = mensajes.reduce(
    (max, m) => Math.max(max, numeroDeConsulta(m?.numeroConsulta)), 0
  );

  return sinNumero.map(m => {
    siguiente += 1;
    return {
      _id: m._id,
      numeroConsulta: `${PREFIJO_CONSULTA}-${String(siguiente).padStart(4, "0")}`,
    };
  });
}

/** Cuántos mensajes están sin leer, para el contador de la nav. */
export const contarNoLeidos = (mensajes = []) =>
  mensajes.filter(m => m?.leido !== true).length;
