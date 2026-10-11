// ─── Categorías: forma garantizada ───────────────────────────────────
// Una categoría mal formada no es un problema cosmético: la home hace
// c.name.length y c.subs.map(), y un documento sin esos campos tira un
// TypeError que, sin Error Boundary, dejaba TODO el sitio público en blanco.
//
// La defensa va acá, en el único lugar por donde las categorías entran a la
// app (App.jsx las lee de Firestore y se las pasa a todas las pantallas),
// y no repartida en cada consumidor. Un documento escrito a mano desde la
// consola, uno de una versión vieja o uno a medio migrar entran igual, pero
// salen con la forma completa.
//
// Puro, sin React ni Firestore: se prueba en Node.

const texto = (v) => (typeof v === "string" ? v : "");

/**
 * Una categoría con todos sus campos garantizados.
 *
 * El id cae al _id del documento si falta: es lo que usan las URLs y los
 * filtros, y sin él la categoría no se puede ni abrir. El nombre cae al id
 * antes que quedar vacío, porque una tarjeta sin texto no se entiende.
 */
export function normalizarCategoria(cruda) {
  const id = texto(cruda?.id).trim() || texto(cruda?._id).trim();
  return {
    ...cruda,
    id,
    name: texto(cruda?.name).trim() || id,
    // Solo strings no vacíos: un null suelto en el array rompía el .map del
    // render igual que la ausencia del array.
    subs: Array.isArray(cruda?.subs)
      ? cruda.subs.filter(s => typeof s === "string" && s.trim() !== "")
      : [],
    hiddenSubs: Array.isArray(cruda?.hiddenSubs)
      ? cruda.hiddenSubs.filter(s => typeof s === "string")
      : [],
  };
}

/** Lo mismo para una lista, descartando las que no tienen ni id. */
export const normalizarCategorias = (lista = []) =>
  (Array.isArray(lista) ? lista : [])
    .map(normalizarCategoria)
    .filter(c => c.id !== "");

/**
 * Los campos de una categoría tal como hay que ESCRIBIRLOS en Firestore.
 *
 * Se usa también al editar, y no solo al crear: hasta ahora el update
 * guardaba {id, name} y dejaba el documento como estaba, así que una
 * categoría a la que le faltara "subs" seguía rota aunque la editaras.
 */
export const datosDeCategoria = (cat, { orden } = {}) => ({
  id: texto(cat?.id).trim(),
  name: texto(cat?.name).trim(),
  subs: Array.isArray(cat?.subs)
    ? cat.subs.filter(s => typeof s === "string" && s.trim() !== "")
    : [],
  ...(orden === undefined ? {} : { order: orden }),
});

/** ¿Se puede guardar? Mismo criterio para el alta y la edición. */
export function validarCategoria(cat) {
  const id = texto(cat?.id).trim();
  const name = texto(cat?.name).trim();
  if (!id) return { valido: false, error: "El ID es obligatorio." };
  if (!name) return { valido: false, error: "El nombre es obligatorio." };
  return { valido: true, error: "" };
}
