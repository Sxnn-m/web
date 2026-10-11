// ─── El documento público de un producto ─────────────────────────────
// products/{id} es la única colección con `allow read: if true` en
// firestore.rules: cualquiera que abra el sitio se baja el documento
// ENTERO, no solo los campos que la pantalla dibuja. Así que lo que
// decide qué es público no es el JSX: es qué campos se escriben acá.
//
// Hasta ahora el doc público se armaba por DESCARTE: se quitaban del
// formulario los seis campos privados conocidos y se escribía todo el
// resto. Eso funciona mientras nadie agregue un campo. El día que el
// ProductForm gane uno nuevo —un costo, un proveedor, una nota— se
// publica solo, sin que nadie lo decida y sin que ninguna prueba falle.
//
// Por eso la lista es al revés: lo que no está acá no se escribe.

/**
 * Campos que el sitio público lee de verdad. Cada uno con quién lo lee,
 * para que sacar uno sea una decisión informada y no una poda a ciegas.
 *
 *   id                · CatalogoScreen (ruta y key), DetalleScreen
 *                       (busca por id), carrito (productoId)
 *   name              · ProductCard, DetalleScreen, carrito, mobile
 *   cat               · filtro de CatalogoScreen, migaja de DetalleScreen
 *   sub               · filtro de CatalogoScreen, ProductCard
 *   desc              · ProductCard, descripcionPublica en DetalleScreen
 *   tag               · píldora de ProductCard, destacados de HomeScreen
 *   price             · ProductCard, DetalleScreen, carrito
 *   visible           · CatalogoScreen lo usa para esconder productos
 *   img               · ProductImage, miniatura del carrito
 *   images            · galería de DetalleScreen, fallback del carrito
 *   specs             · specsVisibles y formatTiempoProducto en
 *                       DetalleScreen (ver CAMPOS_SPECS)
 *   variantes         · DetalleScreen, solo la mitad pública
 *   variantesInsumo   · DetalleScreen y ProductCard, solo la mitad pública
 *   disponible        · sinStock / SinStockBadge; el ÚNICO dato de stock
 *                       que ve el público, y es un booleano
 */
export const CAMPOS_DEL_FORM = [
  "id", "name", "cat", "sub", "desc", "tag", "price", "visible", "img", "images",
  // No lo lee ninguna pantalla pública, pero NO se puede sacar de acá sin
  // migrar antes: recalcularDisponibilidad() decide con `p.precioManual
  // !== true` si puede reescribir el precio, y lee el producto enriquecido,
  // donde este campo sale del doc público. Si desapareciera de golpe, todo
  // producto con precio puesto a mano pasaría a contar como automático y el
  // primer recálculo le reescribiría el precio. Es un booleano: no revela
  // ningún número del inventario.
  "precioManual",
];

/**
 * Las claves de `specs` que ve el público.
 *
 *   material, peso  · specsVisibles() en DetalleScreen
 *   tiempoHoras,
 *   tiempoMinutos   · formatTiempoProducto() los necesita para mostrar
 *                     "5h 30min"
 *   tiempo          · el texto libre viejo. Sigue acá como respaldo
 *                     mientras queden productos sin migrar: es a lo que
 *                     cae tiempoDeProducto() cuando no hay campos nuevos.
 *
 * Queda AFUERA tiempoImpresionHorasDecimal: se escribía en el doc público
 * pero no lo lee nadie, ni el sitio ni el backoffice. Las fórmulas usan
 * tiempoDeProducto(), que recalcula el decimal a partir de horas y minutos.
 */
export const CAMPOS_SPECS = ["material", "peso", "tiempo", "tiempoHoras", "tiempoMinutos"];

/** Lo que calcula el guardado, no el formulario. */
export const CAMPOS_CALCULADOS = ["specs", "variantes", "variantesInsumo", "disponible"];

/** Todo lo que docPublico() puede devolver. Es la lista que prueba el test. */
export const CAMPOS_PUBLICOS = [...CAMPOS_DEL_FORM, ...CAMPOS_CALCULADOS];

/**
 * Y lo que además puede existir en un documento de Firestore sin ser un
 * campo filtrado: el sello de creación, que se escribe una sola vez con
 * serverTimestamp() y nunca viaja por el formulario.
 */
export const CAMPOS_PUBLICOS_EN_DOC = [...CAMPOS_PUBLICOS, "createdAt"];

/** Solo las claves permitidas de specs, y solo las que tengan valor. */
export function specsPublicas(specs = {}) {
  const salida = {};
  for (const clave of CAMPOS_SPECS) {
    if (specs?.[clave] !== undefined) salida[clave] = specs[clave];
  }
  return salida;
}

/**
 * Arma el documento público a partir de lo que mandó el formulario.
 *
 * Las variantes y la disponibilidad NO se toman de `data`: entran por
 * parámetro, ya reducidas a su mitad pública por variantesPublicas() y
 * gruposPublicos(). Es a propósito: si se leyeran de `data`, alcanzaría
 * con borrar una línea del guardado para que los colores y los insumos
 * de cada opción se publicaran enteros.
 *
 * @param {object} data            lo que entregó el ProductForm
 * @param {object} publico
 * @param {Array}  publico.variantes        mitad pública de las variantes
 * @param {Array}  publico.variantesInsumo  mitad pública de los grupos
 * @param {boolean} publico.disponible      el booleano recalculado
 */
export function docPublico(data = {}, { variantes = [], variantesInsumo = [], disponible = false } = {}) {
  const salida = {};
  for (const campo of CAMPOS_DEL_FORM) {
    if (data?.[campo] !== undefined) salida[campo] = data[campo];
  }
  salida.specs = specsPublicas(data?.specs);
  salida.variantes = variantes;
  salida.variantesInsumo = variantesInsumo;
  salida.disponible = disponible;
  return salida;
}

/**
 * Qué campos de más tiene un documento que ya está en Firestore.
 *
 * Un producto guardado hoy queda limpio, pero el guardado usa updateDoc,
 * que FUSIONA: un campo que se escribió en una versión anterior de la app
 * y ya no se escribe más se queda en el documento para siempre. El caso
 * conocido es "stock", el contador manual que alimentaba el badge de
 * "¡Últimas N unidades!": dejó de leerse y de escribirse, pero sigue
 * publicando una cantidad de inventario en los productos viejos.
 *
 * Esto no borra nada: solo dice qué habría que borrar.
 *
 * @returns {{campos: string[], specs: string[]}}
 */
export function camposExtra(doc = {}) {
  const permitidos = new Set([...CAMPOS_PUBLICOS_EN_DOC, "_id"]);
  return {
    campos: Object.keys(doc).filter(c => !permitidos.has(c)).sort(),
    specs: Object.keys(doc?.specs || {}).filter(c => !CAMPOS_SPECS.includes(c)).sort(),
  };
}
