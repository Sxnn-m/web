// ─── Marcas de filamento ─────────────────────────────────────────────
// Funciones puras. No hay colección "marcas": la lista sale de un distinct
// sobre los filamentos ya cargados. Una marca existe mientras exista al
// menos un filamento que la use, y se puede volver a tipear cuando no.
//
// IMPORTANTE: la marca es un dato descriptivo y NO participa del matcheo de
// recetas. Los productos encuentran su filamento por material + color
// (claveFilamento en disponibilidad.js); si la marca entrara ahí, toda
// receta ya cargada dejaría de encontrar su filamento.

import { normalizar } from './disponibilidad.js';

/**
 * Marcas distintas usadas en los filamentos, ordenadas alfabéticamente.
 *
 * La deduplicación es case-insensitive y se queda con la PRIMERA grafía que
 * aparece: si el inventario ya arrastra "Eryone" y "ERYONE", el desplegable
 * muestra una sola opción en vez de ofrecer las dos y perpetuar la variante.
 *
 * @returns {string[]}
 */
export function marcasDeFilamentos(filamentos = []) {
  const vistas = new Map();
  for (const f of filamentos) {
    const marca = String(f?.marca || "").trim();
    if (!marca) continue;
    const clave = normalizar(marca);
    if (!vistas.has(clave)) vistas.set(clave, marca);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Resuelve la marca que se escribió a mano contra las que ya existen.
 *
 * Acá está la garantía real contra las variantes: el desplegable evita el
 * typo del que elige de la lista, pero es esto lo que impide que escribir
 * "eryone" cree un duplicado de "Eryone". Si hay coincidencia ignorando
 * mayúsculas y espacios, devuelve la grafía YA guardada.
 *
 * @returns {{valor: string, existente: boolean}} valor "" si no se escribió nada
 */
export function resolverMarca(texto, marcas = []) {
  const escrita = String(texto || "").trim();
  if (!escrita) return { valor: "", existente: false };
  const clave = normalizar(escrita);
  const yaExiste = marcas.find(m => normalizar(m) === clave);
  return yaExiste
    ? { valor: yaExiste, existente: true }
    : { valor: escrita, existente: false };
}
