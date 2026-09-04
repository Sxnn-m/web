// ─── Costos y rentabilidad ───────────────────────────────────────────
// Funciones puras: la única implementación de la fórmula, consumida por la
// tabla de Rentabilidad y por la columna "Costo fab." de Productos.

import { normalizar } from './disponibilidad.js';
import { horasDeImpresion } from './tiempoImpresion.js';

/**
 * Margen fijo sobre el material: el precio de venta usa el costo del gramo
 * multiplicado por este factor. La hora de máquina se suma aparte, sin margen.
 */
export const MARGEN_MATERIAL = 3;

export const DEFAULT_COSTS = {
  horaMaquina: 150,
  materiales: {
    "PLA": 80, "PLA+": 95, "PLA tranúlcido": 110,
    "PETG": 100, "TPU": 130, "Resina": 200,
  },
};

/**
 * Agrupa la receta por MATERIAL, ignorando el color: todas las líneas que
 * comparten material suman sus gramos.
 *
 * @returns {Array<{material: string, gramos: number}>} en orden de aparición
 */
export function gramosPorMaterial(receta = []) {
  const mapa = new Map();
  for (const item of receta) {
    const material = String(item?.material || "").trim();
    const gramos = Number(item?.gramos) || 0;
    if (!material || gramos <= 0) continue;
    const clave = normalizar(material);
    const previo = mapa.get(clave);
    if (previo) previo.gramos += gramos;
    else mapa.set(clave, { material, gramos });
  }
  return [...mapa.values()];
}

/**
 * Busca el costo por gramo configurado para un material.
 * El match es exacto (normalizando mayúsculas y espacios): si la receta dice
 * "PLA+" y en la configuración solo existe "PLA", NO se considera encontrado,
 * porque son materiales con costos distintos.
 *
 * @returns {number|null} costo por gramo, o null si el material no está configurado
 */
export function costoPorGramo(material, costs = DEFAULT_COSTS) {
  const objetivo = normalizar(material);
  const entrada = Object.entries(costs.materiales || {})
    .find(([nombre]) => normalizar(nombre) === objetivo);
  return entrada ? (Number(entrada[1]) || 0) : null;
}

/**
 * Rentabilidad de un producto según su receta y la configuración de costos.
 *
 *   costoFabricacion = Σ (gramos × costoPorGramo)                    [material]
 *                    + Σ (cantidad × precioUnidad)                   [insumos]
 *   precioFormulaBase = horas × horaMaquina
 *                     + Σ (gramos × costoPorGramo × MARGEN_MATERIAL)
 *   precioFormula    = precioFormulaBase + Σ (insumos)               [sin margen]
 *   precioVenta      = el precio REAL: el cargado a mano si el producto tiene
 *                      "Editar precio manualmente" activo, si no precioFormula
 *   ganancia         = precioVenta − costoFabricacion
 *
 * Los insumos entran en las dos puntas: son plata real que se paga para
 * producir la pieza, así que suman al costo de fabricación, y además se
 * trasladan al precio sin margen.
 *
 * No es calculable si el producto no tiene receta, o si algún material de la
 * receta no está en la lista de costos configurada: en esos casos los importes
 * vuelven en null para que la UI muestre "—" en vez de un número incorrecto.
 *
 * @returns {{
 *   calculable: boolean, motivo: string|null,
 *   costoFabricacion: number|null, costoMaterial: number|null,
 *   precioVenta: number|null,
 *   precioFormulaBase: number|null, precioFormula: number|null,
 *   insumos: number, esManual: boolean,
 *   ganancia: number|null, margen: number|null,
 *   materiales: Array<{material, gramos, costoPorGramo: number|null}>,
 *   sinCosto: string[], gramosTotales: number, horas: number
 * }}
 */
export function calcularRentabilidad(producto, costs = DEFAULT_COSTS) {
  const desglose = gramosPorMaterial(producto?.receta || []);
  // Horas decimales reales: 5h 30min son 5.5, no 530.
  const horas = horasDeImpresion(producto);
  const gramosTotales = desglose.reduce((s, d) => s + d.gramos, 0);

  const materiales = desglose.map(d => ({ ...d, costoPorGramo: costoPorGramo(d.material, costs) }));
  const sinCosto = materiales.filter(m => m.costoPorGramo === null).map(m => m.material);

  const insumos = totalInsumos(producto?.insumos || []);
  const esManual = producto?.precioManual === true;

  const noCalculable = (motivo) => ({
    calculable: false, motivo,
    costoFabricacion: null, costoMaterial: null, precioVenta: null,
    precioFormulaBase: null, precioFormula: null,
    insumos, esManual,
    ganancia: null, margen: null,
    materiales, sinCosto, gramosTotales, horas,
  });

  if (desglose.length === 0) return noCalculable("Sin receta cargada");
  if (sinCosto.length > 0) {
    return noCalculable(
      `Sin costo configurado para: ${sinCosto.join(", ")}`
    );
  }

  const costoMaterial = materiales.reduce((s, m) => s + m.gramos * m.costoPorGramo, 0);
  // Los insumos son costo de fabricación: se pagan para producir la pieza.
  const costoFabricacion = costoMaterial + insumos;
  const precioFormulaBase =
    horas * (Number(costs.horaMaquina) || 0) +
    materiales.reduce((s, m) => s + m.gramos * m.costoPorGramo * MARGEN_MATERIAL, 0);
  const precioFormula = precioFormulaBase + insumos;

  // El precio real es el que se le cobra al cliente: con precio manual activo
  // manda el valor cargado a mano, no la fórmula.
  const precioVenta = esManual ? (Number(producto?.price) || 0) : precioFormula;
  const ganancia = precioVenta - costoFabricacion;

  return {
    calculable: true, motivo: null,
    costoFabricacion, costoMaterial, precioVenta,
    precioFormulaBase, precioFormula,
    insumos, esManual,
    ganancia,
    margen: precioVenta > 0 ? (ganancia / precioVenta) * 100 : 0,
    materiales, sinCosto, gramosTotales, horas,
  };
}

/**
 * Suma de los insumos de un producto (imanes, tornillos, cable, etc.).
 *
 * Shape actual: { insumoId, nombre, cantidad, precioUnidad, subtotal }.
 * Se acepta también el shape viejo { nombre, precio } de antes del catálogo,
 * para que un producto sin migrar no pierda su precio.
 */
export function totalInsumos(insumos = []) {
  return insumos.reduce((total, i) => {
    if (i?.subtotal !== undefined) return total + (Number(i.subtotal) || 0);
    if (i?.precioUnidad !== undefined) {
      return total + (Number(i.precioUnidad) || 0) * (Number(i.cantidad) || 0);
    }
    return total + (Number(i?.precio) || 0);   // formato viejo
  }, 0);
}

/**
 * Precio sugerido de venta de un producto:
 *
 *   precio = (horas × horaMaquina) + Σ (gramos × costoPorGramo × MARGEN_MATERIAL)
 *          + Σ (precios de insumos)
 *
 * Los insumos se suman tal cual, sin margen. Si la receta no permite calcular
 * (sin receta, o material sin costo configurado), precio vuelve null.
 *
 * @returns {{calculable, motivo, base, insumos, precio: number|null}}
 */
export function calcularPrecioSugerido(producto, costs = DEFAULT_COSTS) {
  const rent = calcularRentabilidad(producto, costs);
  return {
    calculable: rent.calculable,
    motivo: rent.motivo,
    base: rent.precioFormulaBase,    // material con margen + hora de máquina
    insumos: rent.insumos,
    // Siempre el precio de fórmula: es una SUGERENCIA, no mira el precio manual.
    precio: rent.precioFormula,
  };
}

/**
 * Filas de la tabla de Rentabilidad: el catálogo y los personalizados
 * mezclados en una sola lista, ordenada de menor a mayor margen.
 *
 * Los dos tipos se calculan con la MISMA fórmula: calcularRentabilidad no
 * mira de qué colección salió el producto, solo su receta, sus insumos y su
 * precio (manual o de fórmula). Por eso un personalizado con insumos suma
 * esos insumos al costo de fabricación igual que uno de catálogo.
 *
 * Cada fila lleva "tipo" y "referencia": lo que va debajo del nombre en la
 * tabla. Un producto de catálogo se ubica por categoría/subcategoría; un
 * personalizado no las tiene, se ubica por el nombre del cliente.
 *
 * @returns {Array<producto & {tipo, categoria, referencia, clave, rent}>}
 */
export function filasDeRentabilidad(productos = [], personalizados = [], costs = DEFAULT_COSTS) {
  const filas = [
    ...productos
      .filter(p => p.visible !== false)
      .map(p => ({
        ...p,
        tipo: "catalogo",
        categoria: [p.cat, p.sub].filter(Boolean).join(" · ") || "Sin categoría",
        referencia: "",   // el catálogo ya se ubica por su categoría
      })),
    ...personalizados.map(p => ({
      ...p,
      tipo: "personalizado",
      categoria: "Personalizado",
      referencia: p.clienteNombre ? `Cliente · ${p.clienteNombre}` : "Cliente sin nombre",
    })),
  ].map(p => ({
    ...p,
    // Los _id salen de dos colecciones distintas: se prefijan para que React
    // no pueda ver dos filas con la misma key.
    clave: `${p.tipo}:${p._id || p.id}`,
    rent: calcularRentabilidad(p, costs),
  }));

  // Peor margen primero; los no calculables van al final para que no ensucien
  // el ranking pero queden visibles.
  return filas.sort((a, b) => {
    if (a.rent.calculable !== b.rent.calculable) return a.rent.calculable ? -1 : 1;
    if (!a.rent.calculable) return (a.name || "").localeCompare(b.name || "");
    return a.rent.margen - b.rent.margen;
  });
}

/** "PLA, PETG" — materiales distintos de la receta, para la columna Material/es. */
export const listaMateriales = (producto) =>
  gramosPorMaterial(producto?.receta || []).map(d => d.material).join(", ");
