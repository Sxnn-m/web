// ─── Descripción pública de un producto ──────────────────────────────
// Lo que se lee en la pestaña "Descripción" es la descripción cargada en el
// ProductForm más un mensaje fijo sobre la producción. Concatenarlas con un
// espacio no alcanza: casi ninguna descripción termina en punto, y quedaba
// "Disponibles en monocolor y RGB Cada pieza es impresa...".

export const MENSAJE_PRODUCCION =
  "Cada pieza es impresa bajo pedido en nuestro taller en CABA. " +
  "Los tiempos de producción varían según la demanda y el nivel de detalle.";

// El "…" cuenta como cierre: agregarle un punto daría "….".
const TERMINALES = [".", "!", "?", "…"];

// Una comilla o un paréntesis que cierran no son el final de la oración; lo
// que decide es el signo que viene justo antes.
const CIERRES = ['"', "'", "»", "”", "’", ")", "]"];

/**
 * Une la descripción propia con el mensaje de producción, garantizando que
 * queden separadas por un punto.
 *
 * @param {string} desc     lo que se escribió en el ProductForm
 * @param {string} mensaje  el texto fijo que se suma al final
 * @returns {string} el mensaje solo, si no hay descripción propia
 */
export function descripcionPublica(desc, mensaje = MENSAJE_PRODUCCION) {
  const propia = String(desc || "").trim();
  if (!propia) return mensaje;

  let fin = propia;
  while (fin.length && CIERRES.includes(fin.at(-1))) fin = fin.slice(0, -1);

  return `${propia}${TERMINALES.includes(fin.at(-1)) ? "" : "."} ${mensaje}`;
}
