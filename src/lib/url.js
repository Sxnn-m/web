// ─── URLs que entran desde un formulario ─────────────────────────────
// Una dirección pegada a mano llega de cualquier forma: con http, sin nada,
// con espacios. Y un campo que después se renderiza como <a href> es el lugar
// clásico donde se cuela un "javascript:..." , así que el esquema se valida
// por nombre en vez de confiar en que el navegador lo ignore.
//
// Puro, sin React: se prueba en Node pelado.

/** Los únicos dos esquemas que puede tener un link que vamos a abrir. */
const PERMITIDOS = ["http:", "https:"];

/**
 * Una URL pegada a mano, lista para guardar.
 *
 * Reglas:
 *   - vacío es válido y vale "" (el campo es opcional);
 *   - sin esquema se asume https:// ("mercadolibre.com.ar/x" funciona);
 *   - http y https pasan;
 *   - cualquier otro esquema se rechaza POR NOMBRE, antes de intentar
 *     interpretarlo. Sin eso, "javascript:alert(1)" no tiene "//" y la regla
 *     de "no tiene esquema, ponele https://" lo convertiría en una URL válida
 *     en vez de rechazarlo.
 *
 * @returns {{valida: boolean, url: string, error: string}}
 */
export function normalizarUrl(texto) {
  const crudo = String(texto ?? "").trim();
  if (crudo === "") return { valida: true, url: "", error: "" };

  const conEsquema = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(crudo);
  if (conEsquema && !PERMITIDOS.includes(`${conEsquema[1].toLowerCase()}:`)) {
    return {
      valida: false, url: "",
      error: `El link tiene que empezar con http:// o https:// (este empieza con "${conEsquema[1]}:").`,
    };
  }

  const candidato = conEsquema ? crudo : `https://${crudo}`;
  let u;
  try { u = new URL(candidato); }
  catch { return { valida: false, url: "", error: "Esa dirección no se entiende como un link." }; }

  if (!PERMITIDOS.includes(u.protocol) || !u.hostname) {
    return { valida: false, url: "", error: "El link tiene que empezar con http:// o https://." };
  }
  // Un texto suelto ("comprado en la feria") se vuelve "https://comprado..."
  // sin fallar. Si el usuario no escribió el esquema, se le pide al menos un
  // dominio con punto para no guardar eso como si fuera un link.
  if (!conEsquema && !u.hostname.includes(".")) {
    return { valida: false, url: "", error: "Eso no parece una dirección web." };
  }

  return { valida: true, url: u.href, error: "" };
}

/** ¿Se puede abrir esta URL ya guardada? Lo que decide si se pinta el link. */
export const esUrlSegura = (url) => normalizarUrl(url).valida && String(url || "").trim() !== "";
