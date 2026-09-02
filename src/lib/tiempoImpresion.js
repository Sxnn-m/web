// ─── Tiempo de impresión ─────────────────────────────────────────────
// El tiempo se carga como dos números (horas y minutos) y se guarda así:
//   specs.tiempoHoras                    · valor crudo ingresado
//   specs.tiempoMinutos                  · valor crudo ingresado
//   specs.tiempoImpresionHorasDecimal    · lo que usan las fórmulas
// El string legible ("5h 30min") se genera al mostrar, nunca se guarda.

/** horas + minutos → horas decimales. 5h 30min → 5.5 */
export function horasDecimales(horas, minutos) {
  const h = Number(horas) || 0;
  const m = Number(minutos) || 0;
  return h + m / 60;
}

const aNumero = (s) => Number(String(s).replace(",", ".")) || 0;

/**
 * Parsea el formato viejo de texto libre para poder migrarlo.
 * Acepta "5h 30min", "2h", "45min", "1.5h", "8" (número suelto = horas).
 *
 * @returns {{horas: number, minutos: number}|null} null si no se reconoce
 */
export function parseTiempoTexto(texto = "") {
  const s = String(texto || "").trim().toLowerCase();
  if (!s) return null;

  const mHoras = s.match(/(\d+(?:[.,]\d+)?)\s*(?:horas|hora|hrs|hr|hs|h)\b/);
  const mMinutos = s.match(/(\d+(?:[.,]\d+)?)\s*(?:minutos|minuto|mins|min|m)\b/);

  let horas = 0;
  let minutos = 0;

  if (mHoras || mMinutos) {
    if (mHoras) horas = aNumero(mHoras[1]);
    if (mMinutos) minutos = aNumero(mMinutos[1]);
  } else {
    // Un número solo ("8") se interpreta como horas.
    const soloNumero = s.match(/^(\d+(?:[.,]\d+)?)$/);
    if (!soloNumero) return null;
    horas = aNumero(soloNumero[1]);
  }

  // "1.5h" → 1h 30min
  const fraccion = horas - Math.floor(horas);
  if (fraccion > 0) {
    minutos += fraccion * 60;
    horas = Math.floor(horas);
  }
  minutos = Math.round(minutos);
  if (minutos >= 60) {
    horas += Math.floor(minutos / 60);
    minutos = minutos % 60;
  }

  return { horas: Math.round(horas), minutos };
}

/**
 * Tiempo de impresión de un producto, sea cual sea el formato guardado.
 * Prioriza los campos numéricos nuevos y cae al texto viejo mientras haya
 * productos sin migrar, para que ningún precio quede mal calculado.
 *
 * @returns {{horas, minutos, decimal, origen: "campos"|"texto"|"ilegible"|"vacio"}}
 */
export function tiempoDeProducto(producto) {
  const specs = producto?.specs || {};

  if (specs.tiempoHoras !== undefined || specs.tiempoMinutos !== undefined) {
    const horas = Number(specs.tiempoHoras) || 0;
    const minutos = Number(specs.tiempoMinutos) || 0;
    return { horas, minutos, decimal: horasDecimales(horas, minutos), origen: "campos" };
  }

  const parseado = parseTiempoTexto(specs.tiempo);
  if (parseado) {
    return { ...parseado, decimal: horasDecimales(parseado.horas, parseado.minutos), origen: "texto" };
  }

  return {
    horas: 0, minutos: 0, decimal: 0,
    origen: specs.tiempo ? "ilegible" : "vacio",
  };
}

/** Horas decimales de un producto: el único valor que deben usar las fórmulas. */
export const horasDeImpresion = (producto) => tiempoDeProducto(producto).decimal;

/** "5h 30min" · "8h" · "45min" · "—" — solo para mostrar en pantalla. */
export function formatTiempo(horas, minutos) {
  const h = Number(horas) || 0;
  const m = Number(minutos) || 0;
  if (h <= 0 && m <= 0) return "—";
  if (h <= 0) return `${m}min`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Atajo: tiempo de un producto ya formateado para mostrar. */
export function formatTiempoProducto(producto) {
  const t = tiempoDeProducto(producto);
  return formatTiempo(t.horas, t.minutos);
}

/** Campos que se persisten en specs a partir de horas y minutos. */
export function specsDeTiempo(horas, minutos) {
  const h = Math.max(0, Number(horas) || 0);
  const m = Math.max(0, Number(minutos) || 0);
  return {
    tiempoHoras: h,
    tiempoMinutos: m,
    tiempoImpresionHorasDecimal: horasDecimales(h, m),
  };
}
