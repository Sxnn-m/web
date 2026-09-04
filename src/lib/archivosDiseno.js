// ─── Archivos de diseño (.stl / .3mf) ────────────────────────────────
// Funciones puras: validación, límites y formato. La capa de Firebase
// Storage vive en src/lib/almacenamiento.js.
//
// Son un backup interno de los archivos de impresión: nunca salen al
// catálogo público. La metadata va a products/{id}/privado/data y los
// binarios a Storage, los dos restringidos a admin.

/** Extensiones aceptadas. En minúsculas y con el punto. */
export const EXTENSIONES = [".stl", ".3mf"];

/** 100 MB por archivo. Un STL de una pieza grande ronda los 20-50 MB. */
export const TAMANIO_MAXIMO = 100 * 1024 * 1024;

/** Carpeta raíz en Storage. */
export const RAIZ_STORAGE = "productos";

/** "1,4 MB" — tamaños legibles para la lista y el total. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const unidades = ["KB", "MB", "GB"];
  let valor = n / 1024, i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i++; }
  const decimales = valor < 10 ? 1 : 0;
  return `${valor.toFixed(decimales).replace(".", ",")} ${unidades[i]}`;
}

/** Extensión en minúsculas, con punto. "" si el nombre no tiene. */
export function extensionDe(nombre) {
  const punto = String(nombre || "").lastIndexOf(".");
  return punto === -1 ? "" : String(nombre).slice(punto).toLowerCase();
}

/**
 * ¿Se puede subir este archivo?
 *
 * El chequeo es por extensión y no por MIME type a propósito: los .stl y los
 * .3mf no tienen un tipo estándar y el navegador suele reportarlos como
 * "application/octet-stream" o vacío, así que el MIME no distingue nada.
 *
 * @param {{name: string, size: number}} archivo
 * @returns {{valido: boolean, error: string|null}}
 */
export function validarArchivo(archivo) {
  const nombre = String(archivo?.name || "").trim();
  const tamanio = Number(archivo?.size) || 0;

  if (!nombre) return { valido: false, error: "El archivo no tiene nombre." };

  const ext = extensionDe(nombre);
  if (!EXTENSIONES.includes(ext)) {
    return {
      valido: false,
      error: `"${nombre}" no es un archivo de diseño. Solo se aceptan ${EXTENSIONES.join(" y ")}.`,
    };
  }
  if (tamanio === 0) {
    return { valido: false, error: `"${nombre}" está vacío.` };
  }
  if (tamanio > TAMANIO_MAXIMO) {
    return {
      valido: false,
      error: `"${nombre}" pesa ${formatBytes(tamanio)} y el máximo por archivo es ` +
        `${formatBytes(TAMANIO_MAXIMO)}.`,
    };
  }
  return { valido: true, error: null };
}

/** Valida una tanda y separa los que entran de los que no. */
export function validarTanda(archivos = []) {
  const validos = [], errores = [];
  for (const a of archivos) {
    const { valido, error } = validarArchivo(a);
    if (valido) validos.push(a); else errores.push(error);
  }
  return { validos, errores };
}

/**
 * Nombre seguro para Storage: sin barras ni caracteres raros que rompan la
 * ruta, conservando la extensión. Si ya existe uno igual en el producto se le
 * agrega un sufijo, para no pisar un archivo subido antes sin avisar.
 */
export function nombreSeguro(nombre, yaExistentes = []) {
  const ext = extensionDe(nombre);
  const base = String(nombre).slice(0, nombre.length - ext.length)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // sin tildes
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "archivo";

  const usados = new Set(yaExistentes.map(a => a?.nombre));
  let candidato = `${base}${ext}`;
  let n = 2;
  while (usados.has(candidato)) candidato = `${base}-${n++}${ext}`;
  return candidato;
}

/** productos/{productId}/archivos/{nombre} */
export const rutaArchivo = (productId, nombre) =>
  `${RAIZ_STORAGE}/${productId}/archivos/${nombre}`;

/** Suma de tamaños, para mostrar cuánto ocupa el producto. */
export const pesoTotal = (archivos = []) =>
  archivos.reduce((s, a) => s + (Number(a?.tamanio) || 0), 0);

/** Normaliza lo que venga guardado, tolerando docs viejos o incompletos. */
export const normalizarArchivos = (archivos) =>
  (Array.isArray(archivos) ? archivos : [])
    .filter(a => a && a.path && a.nombre)
    .map(a => ({
      nombre: String(a.nombre),
      path: String(a.path),
      tamanio: Number(a.tamanio) || 0,
      subidoAt: a.subidoAt || null,
    }));
