// ─── Variantes de color ──────────────────────────────────────────────
// La receta define QUÉ material y CUÁNTO consume cada línea. El COLOR sale
// de la variante: una combinación concreta de colores, uno por línea de
// receta, que el cliente puede elegir.
//
// Una variante vive partida en dos documentos, igual que "disponible":
//
//   products/{id}              variantes: [{id, nombre, aclaracion, disponible}]
//   products/{id}/privado/data variantes: [{id, colores: {lineaId: color}}]
//
// El catálogo público solo lee el doc principal, y ahí no hay ningún dato de
// inventario: ni gramos, ni marca, ni qué filamento usa cada variante. Solo
// el nombre que se muestra, la aclaración y un booleano.
//
// Las líneas de receta necesitan un id propio: un producto bicolor puede
// tener dos líneas del MISMO material (PLA negro + PLA blanco), y la variante
// tiene que poder darles colores distintos. Agrupar por material las
// fusionaría y perdería esa distinción.

import {
  claveFilamento, buscarFilamento, FACTOR_DISPONIBILIDAD,
  lineasDeInsumo, detalleDeLineaInsumo,
} from './disponibilidad.js';
import { disponibilidadDeGrupos, gruposArmables } from './variantesInsumo.js';

/** Id corto y estable para una línea de receta o una variante. */
export function nuevoId(prefijo = "v") {
  return `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Garantiza que cada línea de receta tenga id, material y gramos.
 *
 * Las líneas viejas traen además "color": se conserva tal cual para que la
 * migración pueda leerlo, pero ya no participa del cálculo.
 */
export function normalizarReceta(receta = []) {
  return (Array.isArray(receta) ? receta : [])
    .filter(Boolean)
    .map((l, i) => ({
      ...l,
      id: l.id || `l${i}_${claveFilamento(l.material, l.color || "")}`,
      material: String(l.material || "").trim(),
      gramos: Number(l.gramos) || 0,
    }));
}

/** Líneas que efectivamente consumen algo. Las incompletas no cuentan. */
export function lineasUtiles(receta = []) {
  return normalizarReceta(receta).filter(l => l.material && l.gramos > 0);
}

/** Normaliza la parte privada: la asignación de colores de cada variante. */
export function normalizarVariantesPrivadas(variantes = []) {
  return (Array.isArray(variantes) ? variantes : [])
    .filter(v => v && v.id)
    .map(v => ({
      id: String(v.id),
      colores: v.colores && typeof v.colores === "object" ? { ...v.colores } : {},
    }));
}

/** Normaliza la parte pública: lo único que ve el cliente. */
export function normalizarVariantesPublicas(variantes = []) {
  return (Array.isArray(variantes) ? variantes : [])
    .filter(v => v && v.id)
    .map(v => ({
      id: String(v.id),
      nombre: String(v.nombre || "").trim(),
      aclaracion: String(v.aclaracion || "").trim(),
      disponible: v.disponible === true,
    }));
}

/**
 * Une las dos mitades en la forma que edita el backoffice.
 * Una mitad sin la otra no es un error: un producto a medio migrar puede
 * tener la pública sin la privada, y ahí la variante queda sin colores (y
 * por lo tanto sin stock), que es exactamente lo que hay que mostrar.
 */
export function unirVariantes(publicas = [], privadas = []) {
  const colores = new Map(
    normalizarVariantesPrivadas(privadas).map(v => [v.id, v.colores])
  );
  return normalizarVariantesPublicas(publicas).map(v => ({
    ...v,
    colores: colores.get(v.id) || {},
  }));
}

/**
 * El color que esta variante le asigna a esta línea.
 *
 * Sin variante —o con una variante que no le asignó color a esta línea, porque
 * se agregó a la receta después— cae al color que la propia línea trae del
 * modelo viejo, anterior a las variantes. Es el color con el que ese producto
 * se estuvo imprimiendo, así que descontarlo es lo correcto; inventar uno o
 * dejarlo vacío haría que un pedido viejo no se pueda cerrar nunca.
 */
export const colorDeLinea = (variante, lineaId, linea = null) =>
  String(variante?.colores?.[lineaId] || linea?.color || "").trim();

/**
 * Las líneas de consumo reales de una variante: material + color + gramos.
 * Es lo que hay que descontar del inventario al imprimir.
 *
 * Se agrupa por material+color (no por línea): dos líneas que terminan en el
 * mismo rollo consumen del mismo stock y hay que evaluarlas juntas, o cada
 * una pasaría el chequeo por separado.
 */
export function consumoDeVariante(receta = [], variante) {
  const mapa = new Map();
  for (const linea of lineasUtiles(receta)) {
    const color = colorDeLinea(variante, linea.id, linea);
    const clave = claveFilamento(linea.material, color);
    const previo = mapa.get(clave);
    if (previo) previo.gramos += linea.gramos;
    else mapa.set(clave, {
      clave, material: linea.material, color, gramos: linea.gramos,
      // Sin color asignado no hay rollo al que apuntar.
      incompleta: !color,
    });
  }
  return [...mapa.values()];
}

/**
 * Disponibilidad de UNA variante: para cada material+color que consume, el
 * inventario tiene que tener al menos FACTOR_DISPONIBILIDAD veces los gramos.
 * Mismo criterio de siempre, ahora por combinación de colores.
 */
export function disponibilidadDeVariante(receta = [], variante, filamentos = []) {
  const lineas = consumoDeVariante(receta, variante);

  if (lineas.length === 0) {
    return { disponible: false, motivo: "sin-receta", detalle: [], faltantes: [] };
  }
  const sinColor = lineas.filter(l => l.incompleta);
  if (sinColor.length > 0) {
    return {
      disponible: false, motivo: "sin-color", detalle: [], faltantes: [],
      materialesSinColor: sinColor.map(l => l.material),
    };
  }

  const detalle = lineas.map(item => {
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
    motivo: faltantes.length === 0 ? null : "sin-stock",
    detalle,
    faltantes,
  };
}

/**
 * Disponibilidad del producto entero: cada variante evaluada por separado,
 * más los insumos, que son comunes a todas (no dependen del color).
 *
 * El producto está disponible si AL MENOS UNA variante lo está. Sin variantes
 * cargadas queda NO disponible, con el mismo criterio que ya se aplicaba a un
 * producto sin receta: no hay forma de saber en qué color imprimirlo.
 */
export function disponibilidadPorVariantes(producto, filamentos = [], insumos = []) {
  const receta = producto?.receta || [];
  const variantes = Array.isArray(producto?.variantes) ? producto.variantes : [];

  const detalleInsumos = lineasDeInsumo(producto)
    .map(linea => detalleDeLineaInsumo(linea, insumos));
  const faltantesInsumos = detalleInsumos.filter(d => !d.ok);
  const insumosOk = faltantesInsumos.length === 0;

  const evaluadas = variantes.map(v => {
    const r = disponibilidadDeVariante(receta, v, filamentos);
    return {
      ...v,
      // Los insumos faltantes bloquean TODAS las variantes por igual: no
      // dependen del color, así que no tiene sentido ofrecer una sí y otra no.
      disponible: r.disponible && insumosOk,
      motivo: r.disponible && !insumosOk ? "sin-insumos" : r.motivo,
      detalle: r.detalle,
      faltantes: r.faltantes,
      materialesSinColor: r.materialesSinColor || [],
    };
  });

  // Segundo eje: los grupos de variante de insumo. El producto se puede armar
  // solo si CADA grupo tiene al menos una opción con stock. Sin grupos el eje
  // no aplica y no bloquea nada.
  const gruposInsumo = disponibilidadDeGrupos(producto?.variantesInsumo || [], insumos);
  const insumosArmables = gruposArmables(gruposInsumo);

  return {
    // Una combinación completa necesita las dos cosas: un color imprimible y
    // una opción de cada grupo de insumo.
    disponible: evaluadas.some(v => v.disponible) && insumosArmables,
    sinReceta: lineasUtiles(receta).length === 0,
    sinVariantes: variantes.length === 0,
    variantes: evaluadas,
    gruposInsumo,
    // Grupos que dejaron al producto sin poder armarse, para poder nombrarlos.
    gruposSinOpciones: gruposInsumo.filter(g => !g.disponible),
    detalleInsumos,
    faltantesInsumos,
  };
}

/**
 * Disponibilidad del producto en la forma que espera el resto de la app
 * ({disponible, detalle, faltantes, ...}). detalle y faltantes describen la
 * variante que se está ofreciendo: la primera disponible, o la primera a
 * secas si ninguna lo está — que es la que mejor explica qué falta.
 *
 * Reemplaza a la de disponibilidad.js, que evaluaba la receta con color fijo.
 */
export function calcularDisponibilidad(producto, filamentos = [], insumos = []) {
  const porVariantes = disponibilidadPorVariantes(producto, filamentos, insumos);
  const elegida = porVariantes.variantes.find(v => v.disponible)
    || porVariantes.variantes[0]
    || null;

  return {
    disponible: porVariantes.disponible,
    sinReceta: porVariantes.sinReceta,
    sinVariantes: porVariantes.sinVariantes,
    variantes: porVariantes.variantes,
    gruposInsumo: porVariantes.gruposInsumo,
    gruposSinOpciones: porVariantes.gruposSinOpciones,
    detalle: elegida?.detalle || [],
    faltantes: elegida?.faltantes || [],
    detalleInsumos: porVariantes.detalleInsumos,
    faltantesInsumos: porVariantes.faltantesInsumos,
  };
}

/** Atajo booleano, útil para mapear listas de productos. */
export const esDisponible = (producto, filamentos, insumos) =>
  calcularDisponibilidad(producto, filamentos, insumos).disponible;

/**
 * Todas las combinaciones material+color que consume el producto, mirando
 * TODAS sus variantes, para el detalle de inventario del backoffice.
 *
 * Se agrupa por material+color+gramos, no solo por material+color: dos
 * variantes pueden apuntar al mismo rollo con consumos distintos (una pieza
 * bicolor Negro/Blanco gasta 100 g de PLA Negro, y la Negro/Negro gasta 140 g
 * del mismo rollo). Fusionarlas mostraría un requerimiento que no es el de
 * ninguna de las dos. Cuando el consumo coincide —el caso habitual— la fila
 * es una sola y lista las variantes que la comparten.
 *
 * @returns {Array<{material, color, gramosPorUnidad, requerido, enInventario,
 *                  existe, ok, variantes: string[]}>}
 */
export function filasDeInventario(producto, filamentos = []) {
  const receta = producto?.receta || [];
  const variantes = Array.isArray(producto?.variantes) ? producto.variantes : [];
  const filas = new Map();

  for (const variante of variantes) {
    const { detalle } = disponibilidadDeVariante(receta, variante, filamentos);
    const etiqueta = variante.nombre || "(sin nombre)";
    for (const d of detalle) {
      const clave = `${claveFilamento(d.material, d.color)}|${d.gramosPorUnidad}`;
      const previa = filas.get(clave);
      if (previa) {
        if (!previa.variantes.includes(etiqueta)) previa.variantes.push(etiqueta);
      } else {
        filas.set(clave, { ...d, variantes: [etiqueta] });
      }
    }
  }

  // Los faltantes arriba: son los que hay que reponer.
  return [...filas.values()].sort((a, b) =>
    (a.ok - b.ok) ||
    a.material.localeCompare(b.material, "es") ||
    a.color.localeCompare(b.color, "es")
  );
}

/**
 * Todo lo que el producto puede consumir del catálogo de insumos, en una sola
 * tabla: los insumos FIJOS y, además, cada opción de cada grupo de variante de
 * insumo, con su tipo, lo que pide y lo que hay.
 *
 * Mismo criterio que filasDeInventario con las variantes de color: no se
 * muestra solo lo que consume la combinación que se está ofreciendo, se
 * muestran todas, porque una opción sin stock tiene que verse.
 *
 * La diferencia con los fijos es qué significa que falte: un fijo faltante
 * bloquea el producto entero, mientras que de cada grupo se consume UNA sola
 * opción, así que el grupo alcanza con que tenga una con stock. Por eso cada
 * fila lleva `opcional` y `origen`.
 *
 * @returns {Array<{origen, esFijo, opcional, nombre, tipoNombre, opcionNombre,
 *                  cantidadPorUnidad, requerido, enCatalogo, existe, ok}>}
 */
export function filasDeInsumos(producto, insumos = []) {
  const fijas = lineasDeInsumo(producto)
    .map(l => detalleDeLineaInsumo(l, insumos))
    .map(d => ({ ...d, origen: "Fijo", esFijo: true, opcional: false, opcionNombre: "" }));

  const deGrupos = disponibilidadDeGrupos(producto?.variantesInsumo || [], insumos)
    .flatMap(g => (g.opciones || []).map(o => ({
      insumoId: o.insumoId,
      tipoId: o.tipoId || "",
      nombre: o.insumoNombre || o.nombre || "(sin insumo)",
      tipoNombre: o.tipoNombre || "",
      opcionNombre: o.nombre || "(sin nombre)",
      origen: g.nombre || "(grupo sin nombre)",
      esFijo: false,
      // De un grupo se consume una sola opción: que esta no tenga stock no
      // rompe nada mientras otra sí lo tenga.
      opcional: true,
      cantidadPorUnidad: Math.max(1, Number(o.cantidad) || 1),
      requerido: o.requerido,
      enCatalogo: o.enCatalogo,
      existe: o.existe,
      ok: o.disponible,
    })));

  // Los faltantes arriba, y dentro de cada bloque primero los fijos: son los
  // que efectivamente bloquean el producto.
  return [...fijas, ...deGrupos].sort((a, b) =>
    (a.ok - b.ok) || (b.esFijo - a.esFijo) ||
    String(a.origen).localeCompare(String(b.origen), "es") ||
    String(a.nombre).localeCompare(String(b.nombre), "es")
  );
}

/** La parte pública derivada, lista para escribir en products/{id}. */
export function variantesPublicas(producto, filamentos = [], insumos = []) {
  return disponibilidadPorVariantes(producto, filamentos, insumos).variantes
    .map(v => ({
      id: v.id,
      nombre: v.nombre,
      aclaracion: v.aclaracion,
      disponible: v.disponible,
    }));
}

/** La parte privada, lista para escribir en privado/data. */
export function variantesPrivadas(variantes = []) {
  return normalizarVariantesPrivadas(variantes);
}

/**
 * Nombre visible sugerido a partir de los colores elegidos: "Negro" con un
 * material, "Negro / Blanco" con varios. Se usa como default al crear una
 * variante y al migrar, y queda editable.
 */
export function nombreSugerido(receta = [], variante) {
  const colores = [];
  for (const linea of lineasUtiles(receta)) {
    const color = colorDeLinea(variante, linea.id);
    if (color && !colores.includes(color)) colores.push(color);
  }
  return colores.join(" / ");
}

/**
 * Todos los material+color que referencian las variantes de un producto, sin
 * repetir. Es lo que hay que asegurar en el inventario al guardar: antes salía
 * de la receta, que ya no tiene color.
 */
export function filamentosDeVariantes(receta = [], variantes = []) {
  const vistos = new Set();
  const salida = [];
  for (const variante of variantes) {
    for (const linea of consumoDeVariante(receta, variante)) {
      if (linea.incompleta) continue;
      if (vistos.has(linea.clave)) continue;
      vistos.add(linea.clave);
      salida.push({ material: linea.material, color: linea.color });
    }
  }
  return salida;
}

/**
 * Ordena las variantes para mostrárselas al cliente: primero las que se
 * pueden imprimir hoy, después las agotadas.
 *
 * El orden DENTRO de cada grupo se conserva (sort es estable desde ES2019),
 * así que las disponibles siguen apareciendo en el orden en que se cargaron.
 * No muta el array recibido.
 */
export function ordenarPorDisponibilidad(variantes = []) {
  return [...variantes].sort((a, b) => (b.disponible === true) - (a.disponible === true));
}

/** ¿Ya tiene variantes cargadas? */
export const tieneVariantes = (producto) =>
  Array.isArray(producto?.variantes) && producto.variantes.length > 0;

/**
 * Migración: arma UNA variante con los colores que cada línea de receta ya
 * tenía fijos. Es la traducción exacta del modelo viejo — el producto queda
 * ofreciendo justo lo que ofrecía antes, sin inventar combinaciones.
 *
 * Devuelve null si no hay nada que migrar: sin receta utilizable, o si el
 * producto ya tiene variantes (no se pisa lo cargado a mano).
 *
 * @returns {{receta, variantePublica, variantePrivada}|null}
 */
export function migrarAVariante(producto) {
  if (tieneVariantes(producto)) return null;
  const receta = normalizarReceta(producto?.receta || []);
  const utiles = receta.filter(l => l.material && l.gramos > 0);
  if (utiles.length === 0) return null;

  const colores = {};
  for (const linea of utiles) {
    const color = String(linea.color || "").trim();
    if (color) colores[linea.id] = color;
  }
  // Ninguna línea tenía color: no hay variante que armar, se carga a mano.
  if (Object.keys(colores).length === 0) return null;

  const id = nuevoId("v");
  const variante = { id, colores };
  return {
    receta,
    variantePublica: {
      id,
      nombre: nombreSugerido(receta, variante) || "Único",
      aclaracion: "",
      disponible: false,   // lo calcula el barrido, no la migración
    },
    variantePrivada: variante,
  };
}
