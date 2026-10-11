// ─── Cuando un chunk no se puede descargar ───────────────────────────
// El backoffice se carga aparte, con import() dinámico. Eso abre un caso que
// antes no existía: alguien deja la pestaña abierta, se publica un deploy
// nuevo, y el chunk que esa pestaña va a pedir ya no existe con ese nombre
// —Vite le pone un hash al archivo y el deploy nuevo lo cambió—. El import
// falla y, sin red de contención, el backoffice queda en blanco.
//
// La respuesta correcta es recargar: la página nueva pide los nombres nuevos.
// Pero recargar ante un error que se repite es un bucle infinito, así que se
// hace UNA sola vez, y la marca de "ya lo intenté" vive en sessionStorage
// (no en localStorage) para que muera con la pestaña.
//
// Puro y sin React a propósito: el almacén y la función de recarga entran por
// parámetro, así se prueba en Node pelado sin un navegador.

/** La marca de "en esta pestaña ya recargué por un chunk que no cargaba". */
export const CLAVE_MARCA = "tk:recarga-por-chunk";

/**
 * Los mensajes con los que cada navegador reporta un import() que no se pudo
 * resolver. Son textos, no códigos, porque no hay nada mejor: la especificación
 * no define un tipo de error para esto y cada motor escribe el suyo.
 */
const PATRONES = [
  /failed to fetch dynamically imported module/i,   // Chrome, Edge
  /error loading dynamically imported module/i,     // Firefox
  /importing a module script failed/i,              // Safari
  /loading chunk \S+ failed/i,
  // El clásico: el servidor devolvió index.html en vez del .js, así que el
  // navegador intentó parsear "<!doctype html>" como un módulo. Es el síntoma
  // de un rewrite mal configurado o de un chunk que ya no está.
  /unexpected token ['"<]/i,
  /expected a javascript(-or-wasm)? module script/i,
  /mime type of "text\/html"/i,
];

/** ¿Este error es "no pude bajar el código", y no un bug de la app? */
export function esErrorDeChunk(error) {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const texto = `${error.name || ""}: ${error.message || ""}`;
  return PATRONES.some(p => p.test(texto));
}

// El almacenamiento puede fallar: modo privado, cookies de terceros
// bloqueadas, cuota llena. Nunca se deja propagar.
const leer = (almacen) => {
  try { return almacen?.getItem(CLAVE_MARCA) === "1"; }
  catch { return null; }   // null = "no sé", distinto de false = "no hay marca"
};
const escribir = (almacen) => {
  try {
    // Sin almacén NO se da por escrita la marca. Con `almacen?.setItem(...)`
    // el encadenamiento opcional no lanza: devolvía true sin haber guardado
    // nada, y eso es exactamente el bucle infinito que esto tiene que evitar.
    if (!almacen) return false;
    almacen.setItem(CLAVE_MARCA, "1");
    // Y se vuelve a leer: hay navegadores que en modo privado aceptan el
    // setItem sin error y después devuelven null. Escribir sin poder leer de
    // vuelta es lo mismo que no tener marca.
    return almacen.getItem(CLAVE_MARCA) === "1";
  } catch { return false; }
};

/** Se llama cuando el chunk SÍ cargó: la marca dejó de aplicar. */
export function limpiarMarca(almacen = globalThis.sessionStorage) {
  try { almacen?.removeItem(CLAVE_MARCA); } catch { /* da igual */ }
}

/**
 * Qué hacer con un error que llegó al ErrorBoundary.
 *
 * @returns {"no-es-de-chunk"   el error es un bug de la app, mostralo
 *          |"recargando"        se recargó: la página nueva pide los nombres nuevos
 *          |"ya-se-intento"     ya se recargó una vez y volvió a fallar
 *          |"sin-almacen"}      no se pudo guardar la marca, así que no se
 *                               recarga: sin marca, recargar sería un bucle
 */
export function manejarErrorDeChunk(error, {
  almacen = globalThis.sessionStorage,
  recargar = () => globalThis.location?.reload(),
} = {}) {
  if (!esErrorDeChunk(error)) return "no-es-de-chunk";

  if (leer(almacen) === true) return "ya-se-intento";

  // Si no se puede escribir la marca NO se recarga. Es la decisión
  // conservadora: una recarga sin forma de recordarla es un bucle, y un bucle
  // es peor que un mensaje con un botón, porque el botón lo aprieta una
  // persona y por lo tanto no se repite solo.
  if (!escribir(almacen)) return "sin-almacen";

  recargar();
  return "recargando";
}
