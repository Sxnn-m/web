// ─── Un link que viene de los datos ──────────────────────────────────
// Cualquier URL que se haya guardado en Firestore —el origen del diseño de
// un producto, el link de compra de un ítem de gasto— se abre a través de
// acá, por dos motivos:
//
//   1. Se vuelve a validar al RENDERIZAR, no solo al guardar. Un valor que
//      ya está en la base pudo escribirse antes de que existiera la
//      validación, o a mano desde la consola. Un "javascript:..." en un href
//      se ejecuta en la sesión del admin que le hace clic.
//   2. target="_blank" y rel="noopener noreferrer" quedan en un solo lugar,
//      en vez de repetidos en cada pantalla con variantes distintas (había
//      links con noreferrer pero sin noopener).
//
// Si la URL no pasa, no se muestra un link roto: se muestra el guion de
// "no hay", que es lo mismo que ve una fila sin dato.

import { normalizarUrl } from '../lib/url.js';

/**
 * @param {string} url       lo guardado, sin confiar
 * @param {string} [texto]   qué se lee en el ancla
 * @param {*}      [vacio]   qué mostrar si no hay URL o no es válida
 */
export function EnlaceExterno({ url, texto = "Link", vacio = "—", title, style }) {
  const { valida, url: limpia } = normalizarUrl(url);

  if (!valida || !limpia) {
    return <span style={{ color: "var(--muted)" }}>{vacio}</span>;
  }

  return (
    <a
      href={limpia}
      target="_blank"
      rel="noopener noreferrer"
      title={title || limpia}
      style={{ color: "var(--accent)", ...style }}
    >
      {texto}
    </a>
  );
}
