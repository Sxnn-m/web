// ─── Filtros de categoría / subcategoría ─────────────────────────────
// Funciones puras compartidas por el tab Productos y por la tabla de
// Rentabilidad del tab Costos: los dos filtran en cascada con el mismo
// criterio, así que la lógica vive una sola vez.

/** Valor del selector cuando no se filtra por nada. */
export const TODAS = "all";

/**
 * Opción extra del selector de categoría, solo en Rentabilidad: los
 * personalizados no tienen categoría real, pero se los quiere poder aislar.
 * El prefijo con guiones bajos evita chocar con un id de categoría real.
 */
export const CAT_PERSONALIZADOS = "__personalizados__";

/**
 * Subcategorías que ofrece el selector según la categoría elegida:
 *   - una categoría concreta → sus propias subcategorías
 *   - "Todas"                → todas las existentes, sin repetir
 *   - "Personalizados"       → ninguna: no tienen subcategoría
 *
 * @returns {string[]}
 */
export function subcategoriasDisponibles(categories = [], filtroCat = TODAS) {
  if (filtroCat === CAT_PERSONALIZADOS) return [];
  if (filtroCat !== TODAS) {
    return categories.find(c => c.id === filtroCat)?.subs || [];
  }
  return [...new Set(categories.flatMap(c => c.subs || []))]
    .sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * ¿Una fila pasa el filtro de categoría + subcategoría?
 *
 * Sirve tanto para un producto crudo de "products" como para una fila de
 * Rentabilidad (que además lleva "tipo"). Un personalizado no tiene "cat", así
 * que al elegir una categoría real queda afuera solo por comparar; no hace
 * falta excluirlo aparte.
 *
 * Los dos criterios se combinan con AND, y quien llama los combina a su vez
 * con el AND del buscador de texto.
 */
export function coincideCategoria(fila, filtroCat = TODAS, filtroSub = TODAS) {
  if (filtroCat === CAT_PERSONALIZADOS) return fila?.tipo === "personalizado";
  const coincideCat = filtroCat === TODAS || fila?.cat === filtroCat;
  const coincideSub = filtroSub === TODAS || fila?.sub === filtroSub;
  return coincideCat && coincideSub;
}
