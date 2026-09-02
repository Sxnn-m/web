// ─── Lógica pura de disponibilidad de producto ────────────────────────
// Sin dependencias de React ni de Firestore: se puede testear/reusar
// desde el backoffice, desde un script o desde una Cloud Function.

/** Gramos por debajo de los cuales un filamento se marca para restock. */
export const UMBRAL_RESTOCK = 350;

/**
 * Un producto está disponible si, para cada material/color de su receta,
 * el inventario tiene al menos este múltiplo de lo que consume una unidad.
 */
export const FACTOR_DISPONIBILIDAD = 2;

/** Normaliza material/color para comparar sin importar mayúsculas ni espacios. */
export const normalizar = (s = "") => String(s).trim().toLowerCase();

/** Clave única de un filamento: material + color. */
export const claveFilamento = (material, color) =>
  `${normalizar(material)}|${normalizar(color)}`;

/** ¿Este filamento necesita restock? */
export const necesitaRestock = (filamento) =>
  Number(filamento?.cantidadGramos || 0) < UMBRAL_RESTOCK;

/**
 * Agrupa las líneas de una receta que apuntan al mismo material/color,
 * sumando los gramos. Así un producto que usa "PLA negro" en dos líneas
 * se evalúa por el total que consume, no línea por línea.
 *
 * @param {Array<{material: string, color: string, gramos: number|string}>} receta
 * @returns {Array<{material: string, color: string, gramos: number, clave: string}>}
 */
export function agruparReceta(receta = []) {
  const mapa = new Map();
  for (const item of receta) {
    if (!item) continue;
    const material = String(item.material || "").trim();
    const color = String(item.color || "").trim();
    const gramos = Number(item.gramos) || 0;
    if (!material && !color) continue;
    if (gramos <= 0) continue;
    const clave = claveFilamento(material, color);
    const previo = mapa.get(clave);
    if (previo) previo.gramos += gramos;
    else mapa.set(clave, { material, color, gramos, clave });
  }
  return [...mapa.values()];
}

// ─── Specs derivadas de la receta ────────────────────────────────────
// specs.material y specs.peso ya no se cargan a mano: salen de la receta,
// que es la única fuente de verdad de qué y cuánto consume el producto.

/** Materiales únicos de la receta, en orden de aparición: "PLA, PETG". */
export function materialesDeReceta(receta = []) {
  const vistos = new Map();
  for (const item of receta) {
    const material = String(item?.material || "").trim();
    if (!material) continue;
    if ((Number(item?.gramos) || 0) <= 0) continue;
    const clave = normalizar(material);
    if (!vistos.has(clave)) vistos.set(clave, material);
  }
  return [...vistos.values()];
}

/** Suma de gramos de todas las líneas de la receta (peso real de impresión). */
export function pesoTotalReceta(receta = []) {
  return receta.reduce((total, item) => {
    const gramos = Number(item?.gramos) || 0;
    return gramos > 0 ? total + gramos : total;
  }, 0);
}

/**
 * Valores que se persisten en specs.material y specs.peso.
 * Con receta vacía devuelve strings vacíos: no hay dato que mostrar y no
 * queremos dejar un valor viejo desincronizado.
 */
export function specsDesdeReceta(receta = []) {
  const materiales = materialesDeReceta(receta);
  const peso = pesoTotalReceta(receta);
  return {
    material: materiales.join(", "),
    peso: peso > 0 ? `${peso} g` : "",
  };
}

/** Busca en el inventario el filamento que coincide en material Y color. */
export function buscarFilamento(filamentos = [], material, color) {
  const clave = claveFilamento(material, color);
  return filamentos.find(f => claveFilamento(f.material, f.color) === clave) || null;
}

/**
 * Calcula la disponibilidad de un producto contra el inventario de filamentos.
 *
 * Un producto está disponible SOLO SI tiene receta cargada y, para cada
 * material/color de esa receta, el inventario tiene al menos el doble de los
 * gramos que consume una unidad. Si falta un filamento de la receta, o no
 * llega al doble, queda NO disponible.
 *
 * Un producto sin receta también queda NO disponible: sin receta no hay forma
 * de saber si se puede imprimir, así que no se vende hasta cargarla.
 *
 * @param {object} producto  documento de "products" (usa producto.receta)
 * @param {Array}  filamentos documentos de "filamentos"
 * @returns {{
 *   disponible: boolean,
 *   sinReceta: boolean,
 *   detalle: Array<{material,color,gramosPorUnidad,requerido,enInventario,existe,ok}>,
 *   faltantes: Array<object>
 * }}
 */
export function calcularDisponibilidad(producto, filamentos = []) {
  const receta = agruparReceta(producto?.receta || []);

  // Sin receta cargada no hay forma de evaluar el consumo: el producto no
  // se ofrece hasta que se cargue.
  if (receta.length === 0) {
    return { disponible: false, sinReceta: true, detalle: [], faltantes: [] };
  }

  const detalle = receta.map(item => {
    const filamento = buscarFilamento(filamentos, item.material, item.color);
    const enInventario = filamento ? Number(filamento.cantidadGramos) || 0 : 0;
    const requerido = item.gramos * FACTOR_DISPONIBILIDAD;
    return {
      material: item.material,
      color: item.color,
      gramosPorUnidad: item.gramos,
      requerido,
      enInventario,
      existe: Boolean(filamento),
      filamentoId: filamento?._id || null,
      ok: Boolean(filamento) && enInventario >= requerido,
    };
  });

  const faltantes = detalle.filter(d => !d.ok);
  return {
    disponible: faltantes.length === 0,
    sinReceta: false,
    detalle,
    faltantes,
  };
}

/** Atajo booleano, útil para mapear listas de productos. */
export const esDisponible = (producto, filamentos) =>
  calcularDisponibilidad(producto, filamentos).disponible;

/** Texto corto explicando por qué un filamento de la receta no alcanza. */
export function motivoFaltante(item) {
  const etiqueta = `${item.material}${item.color ? " " + item.color : ""}`;
  if (!item.existe) {
    return `${etiqueta}: no está cargado en inventario (necesita ${item.requerido} g)`;
  }
  return `${etiqueta}: ${item.enInventario} g disponibles vs. ${item.requerido} g necesarios ` +
    `(${item.gramosPorUnidad} g × ${FACTOR_DISPONIBILIDAD})`;
}
