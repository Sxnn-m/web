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

import { normalizar, opcionesDeOwner } from './disponibilidad.js';

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
 * De quién se puede descontar una línea de impresión: TODOS los owners del
 * sistema, evaluados contra lo que esa línea necesita.
 *
 * Se listan todos y no solo los que tienen el rollo, para que la lista sea la
 * respuesta completa a "¿quién puede imprimir esto?": un owner que no lo tiene
 * cargado también es información, y esconderlo deja la duda de si falta él o
 * falta el filamento. Los que no sirven quedan deshabilitados con el motivo.
 *
 * Seleccionable = tiene ESE material+color Y le alcanza para la línea entera
 * (receta + desperdicio). No se suma entre owners: la pieza sale de un rollo.
 *
 * Vive acá y no en disponibilidad.js porque necesita el distinct de owners, y
 * al revés armaría un ciclo de imports.
 *
 * @param {number} necesita gramos que consume la línea, desperdicio incluido
 * @returns {Array<{id, owner, disponible, tiene, alcanza, falta}>}
 *   ordenados: primero los que sirven, después los cortos, al final los que no
 *   tienen el filamento. `id` es el documento del rollo, o "owner:<nombre>"
 *   para los que no tienen ninguno.
 */
export function opcionesDeDescuento(filamentos = [], material, color, necesita = 0) {
  const pedido = Number(necesita) || 0;
  const conRollo = opcionesDeOwner(filamentos, material, color).map(o => ({
    ...o,
    tiene: true,
    alcanza: o.disponible >= pedido,
    falta: Math.max(0, pedido - o.disponible),
  }));

  // Los owners que existen en el sistema pero no tienen este material+color.
  // Un owner puede tener DOS rollos del mismo material+color; alcanza con que
  // aparezca en conRollo para no volver a listarlo como que no lo tiene.
  const yaListados = new Set(conRollo.map(o => normalizar(o.owner)));
  const sinRollo = ownersUsados(filamentos)
    .filter(owner => !yaListados.has(normalizar(owner)))
    .map(owner => ({
      id: `owner:${owner}`, owner, disponible: 0,
      tiene: false, alcanza: false, falta: pedido,
    }));

  return [...conRollo, ...sinRollo].sort((a, b) =>
    (b.alcanza - a.alcanza) ||          // los que sirven, primero
    (b.tiene - a.tiene) ||              // después los cortos, al final los que no lo tienen
    (b.disponible - a.disponible) ||    // entre los cortos, el que más cerca está
    String(a.owner).localeCompare(String(b.owner), "es"));
}

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
