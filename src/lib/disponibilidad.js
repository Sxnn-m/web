// ─── Lógica pura de disponibilidad de producto ────────────────────────
// Sin dependencias de React ni de Firestore: se puede testear/reusar
// desde el backoffice, desde un script o desde una Cloud Function.

import { tiposDe, resolverInsumoTipo, etiquetaInsumoTipo } from './tiposInsumo.js';

/** Gramos por debajo de los cuales un filamento se marca para restock. */
export const UMBRAL_RESTOCK = 350;

/** Unidades en o por debajo de las cuales un insumo se marca para restock. */
export const UMBRAL_RESTOCK_INSUMO = 5;

/**
 * A diferencia del filamento, de los insumos alcanza con tener exactamente lo
 * que consume una unidad del producto: no se exige el doble.
 */
export const FACTOR_DISPONIBILIDAD_INSUMO = 1;

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
 * ¿Este TIPO de insumo necesita restock? El stock vive en el tipo, no en el
 * insumo: un "Led" puede tener el monocolor lleno y el RGB en cero.
 */
export const necesitaRestockInsumo = (tipo) =>
  Number(tipo?.cantidadDisponible || 0) <= UMBRAL_RESTOCK_INSUMO;

/** ¿Alguno de los tipos de este insumo está en alerta? */
export const insumoEnAlerta = (insumo) =>
  tiposDe(insumo).some(necesitaRestockInsumo);

/** Busca un insumo del catálogo por su id de documento. */
export function buscarInsumo(insumos = [], insumoId) {
  if (!insumoId) return null;
  return insumos.find(i => i._id === insumoId) || null;
}

/**
 * Normaliza las líneas de insumo de un producto.
 * Shape actual: { insumoId, tipoId, nombre, cantidad, precioUnidad, subtotal }.
 * Se ignoran las líneas sin insumoId (formato viejo de texto libre): no se
 * pueden chequear contra el catálogo.
 *
 * Las líneas guardadas antes de los tipos no traen tipoId: se dejan vacías y
 * buscarTipo() las ancla al primer tipo del insumo, que es el que heredó el
 * precio y el stock que esa línea ya estaba usando.
 */
export function lineasDeInsumo(producto) {
  return (producto?.insumos || [])
    .filter(l => l && l.insumoId)
    .map(l => ({
      insumoId: l.insumoId,
      tipoId: l.tipoId || "",
      nombre: l.nombre || "",
      cantidad: Math.max(1, Number(l.cantidad) || 1),
    }));
}

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

/**
 * Evalúa una línea de insumo fijo contra el catálogo: cuánto pide, cuánto hay
 * del TIPO al que apunta, y si alcanza.
 *
 * El stock que cuenta es el del tipo anclado, no el del insumo: tener 40 leds
 * monocolor no habilita un producto que lleva el RGB.
 */
export function detalleDeLineaInsumo(linea, insumos = []) {
  const { insumo, tipo } = resolverInsumoTipo(insumos, linea.insumoId, linea.tipoId);
  const enCatalogo = tipo ? Number(tipo.cantidadDisponible) || 0 : 0;
  const requerido = linea.cantidad * FACTOR_DISPONIBILIDAD_INSUMO;
  return {
    insumoId: linea.insumoId,
    tipoId: tipo?.tipoId || linea.tipoId || "",
    // El nombre del catálogo manda; el del producto es un snapshot viejo.
    nombre: insumo ? etiquetaInsumoTipo(insumo, tipo) : linea.nombre,
    tipoNombre: tipo?.nombre || "",
    cantidadPorUnidad: linea.cantidad,
    requerido,
    enCatalogo,
    existe: Boolean(insumo && tipo),
    ok: Boolean(insumo && tipo) && enCatalogo >= requerido,
  };
}

/** Busca en el inventario el filamento que coincide en material Y color. */
export function buscarFilamento(filamentos = [], material, color) {
  const clave = claveFilamento(material, color);
  return filamentos.find(f => claveFilamento(f.material, f.color) === clave) || null;
}

/**
 * TODOS los rollos que coinciden en material Y color, no solo el primero.
 *
 * El mismo PLA Negro puede estar cargado dos veces, una por cada persona que
 * lo compró: son documentos distintos con stock distinto, y descontar del
 * primero que aparece vacía el rollo equivocado en silencio.
 */
export function filamentosDe(filamentos = [], material, color) {
  const clave = claveFilamento(material, color);
  return filamentos.filter(f => claveFilamento(f.material, f.color) === clave);
}

/**
 * Los owners que REALMENTE tienen ese material+color, con sus gramos.
 * Es lo que alimenta el selector "Descontar de" del modal de impresión: si un
 * owner no tiene ese rollo cargado, no aparece como opción.
 *
 * Va por documento y no por nombre de owner: la misma persona puede tener dos
 * rollos del mismo material+color cargados por separado, y el descuento
 * siempre sale de UN documento.
 */
export function opcionesDeOwner(filamentos = [], material, color) {
  return filamentosDe(filamentos, material, color).map(f => ({
    id: f._id,
    owner: f.owner || "",
    disponible: Number(f.cantidadGramos) || 0,
  }));
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
 * Los insumos (imanes, tornillos) se chequean con el mismo criterio pero a 1x:
 * alcanza con tener en el catálogo lo que consume una unidad del producto.
 *
 * @param {object} producto  documento de "products" (usa producto.receta e insumos)
 * @param {Array}  filamentos documentos de "filamentos"
 * @param {Array}  insumos    documentos de "insumos"
 * @returns {{
 *   disponible: boolean,
 *   sinReceta: boolean,
 *   detalle: Array<{material,color,gramosPorUnidad,requerido,enInventario,existe,ok}>,
 *   faltantes: Array<object>,
 *   detalleInsumos: Array<{insumoId,nombre,cantidadPorUnidad,requerido,enCatalogo,existe,ok}>,
 *   faltantesInsumos: Array<object>
 * }}
 */
/**
 * Cálculo por receta con color fijo: el modelo viejo, anterior a las
 * variantes. La disponibilidad que usa la app vive ahora en
 * variantes.js/calcularDisponibilidad — esta queda para poder comparar los
 * dos modelos durante la migración.
 *
 * Está acá y no en variantes.js para no armar un ciclo de imports: variantes
 * depende de este módulo, no al revés.
 */
export function calcularDisponibilidadPorReceta(producto, filamentos = [], insumos = []) {
  const receta = agruparReceta(producto?.receta || []);

  // Los insumos se evalúan siempre, incluso sin receta, para que el detalle
  // del backoffice muestre el panorama completo.
  const detalleInsumos = lineasDeInsumo(producto).map(l => detalleDeLineaInsumo(l, insumos));
  const faltantesInsumos = detalleInsumos.filter(d => !d.ok);

  // Sin receta cargada no hay forma de evaluar el consumo: el producto no
  // se ofrece hasta que se cargue.
  if (receta.length === 0) {
    return {
      disponible: false, sinReceta: true,
      detalle: [], faltantes: [],
      detalleInsumos, faltantesInsumos,
    };
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
    // Tiene que cumplir las dos condiciones: filamento (2x) e insumos (1x).
    disponible: faltantes.length === 0 && faltantesInsumos.length === 0,
    sinReceta: false,
    detalle,
    faltantes,
    detalleInsumos,
    faltantesInsumos,
  };
}


/** Texto corto explicando por qué un filamento de la receta no alcanza. */
export function motivoFaltante(item) {
  const etiqueta = `${item.material}${item.color ? " " + item.color : ""}`;
  if (!item.existe) {
    return `${etiqueta}: no está cargado en inventario (necesita ${item.requerido} g)`;
  }
  return `${etiqueta}: ${item.enInventario} g disponibles vs. ${item.requerido} g necesarios ` +
    `(${item.gramosPorUnidad} g × ${FACTOR_DISPONIBILIDAD})`;
}

/** Texto corto explicando por qué un insumo de la receta no alcanza. */
export function motivoFaltanteInsumo(item) {
  if (!item.existe) {
    return `${item.nombre || "insumo"}: ya no está en el catálogo de insumos ` +
      `(necesita ${item.requerido} u.)`;
  }
  return `${item.nombre}: ${item.enCatalogo} u. disponibles vs. ${item.requerido} u. necesarias`;
}
