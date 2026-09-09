// ─── Opciones de los campos de filamento ─────────────────────────────
// Funciones puras. No hay colecciones "materiales", "colores" ni "marcas":
// las listas de los desplegables salen de un distinct sobre los filamentos
// ya cargados. Un valor existe mientras lo use al menos un filamento, y se
// puede volver a tipear cuando no.
//
// IMPORTANTE sobre el matcheo con las recetas: material y color SÍ arman la
// clave con la que un producto encuentra su filamento (claveFilamento en
// disponibilidad.js), que compara con normalizar() — trim + minúsculas. La
// marca y el owner son descriptivos y no participan: si entraran, toda receta
// ya cargada dejaría de encontrar su filamento.

import { normalizar } from './disponibilidad.js';

/**
 * Valores distintos de un campo entre los filamentos cargados, ordenados
 * alfabéticamente.
 *
 * La deduplicación es case-insensitive y se queda con la PRIMERA grafía que
 * aparece: si el inventario ya arrastra "Eryone" y "ERYONE", el desplegable
 * muestra una sola opción en vez de ofrecer las dos y perpetuar la variante.
 *
 * @param {string} campo  "material" | "color" | "marca" | "owner"
 * @returns {string[]}
 */
export function valoresUsados(filamentos = [], campo) {
  const vistas = new Map();
  for (const f of filamentos) {
    const valor = String(f?.[campo] || "").trim();
    if (!valor) continue;
    const clave = normalizar(valor);
    if (!vistas.has(clave)) vistas.set(clave, valor);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export const materialesUsados = (filamentos) => valoresUsados(filamentos, "material");
export const coloresUsados = (filamentos) => valoresUsados(filamentos, "color");
export const marcasUsadas = (filamentos) => valoresUsados(filamentos, "marca");
// "owner": quién del equipo cargó o posee el rollo. Descriptivo como la marca,
// no participa del matcheo con las recetas.
export const ownersUsados = (filamentos) => valoresUsados(filamentos, "owner");

/**
 * Resuelve lo que se escribió a mano contra los valores que ya existen.
 *
 * Acá está la garantía real contra las variantes: el desplegable evita el
 * typo del que elige de la lista, pero es esto lo que impide que escribir
 * "pla" cree un duplicado de "PLA". Si hay coincidencia ignorando mayúsculas
 * y espacios, devuelve la grafía YA guardada.
 *
 * Un valor que no existe se devuelve TAL CUAL se escribió (solo sin espacios
 * al borde): nada de mayúsculas forzadas ni otras transformaciones, para que
 * el string guardado sea exactamente el que la receta va a tener que
 * matchear.
 *
 * @returns {{valor: string, existente: boolean}} valor "" si no se escribió nada
 */
export function resolverValor(texto, opciones = []) {
  const escrito = String(texto || "").trim();
  if (!escrito) return { valor: "", existente: false };
  const clave = normalizar(escrito);
  const yaExiste = opciones.find(o => normalizar(o) === clave);
  return yaExiste
    ? { valor: yaExiste, existente: true }
    : { valor: escrito, existente: false };
}
