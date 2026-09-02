// ─── IDs de producto (TKP + número) ──────────────────────────────────
// Ojo: este ID es un CAMPO del documento ("id"), no el ID del documento en
// Firestore. El doc lo crea addDoc() con un ID autogenerado, que es el que
// se guarda en _id y el que usan pedidos.items[].productoId y la
// subcolección products/{id}/privado.

export const PREFIJO_ID = "TKP";

/** "TKP12" → 12 · "p03" → 3 · basura → null */
export function numeroDeId(id) {
  const m = String(id || "").match(/(\d+)\s*$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Número más alto usado por cualquier producto (0 si no hay ninguno). */
export function maximoNumero(productos = []) {
  return productos.reduce((max, p) => {
    const n = numeroDeId(p?.id);
    return n !== null && n > max ? n : max;
  }, 0);
}

/** Siguiente ID correlativo: "TKP" + (el más alto + 1). */
export function siguienteIdProducto(productos = []) {
  return `${PREFIJO_ID}${maximoNumero(productos) + 1}`;
}

/**
 * Productos que comparten el mismo ID visible.
 *
 * @returns {Array<{id: string, productos: Array}>} solo los IDs repetidos
 */
export function detectarDuplicados(productos = []) {
  const porId = new Map();
  for (const p of productos) {
    const clave = String(p?.id || "").trim().toUpperCase();
    if (!clave) continue;
    if (!porId.has(clave)) porId.set(clave, []);
    porId.get(clave).push(p);
  }
  return [...porId.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([id, lista]) => ({ id, productos: lista }));
}

/** Set de los IDs visibles repetidos, para marcarlos en la tabla. */
export function idsDuplicados(productos = []) {
  return new Set(detectarDuplicados(productos).map(d => d.id));
}
