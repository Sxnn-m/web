// ─── Variantes de insumo ─────────────────────────────────────────────
// Un producto puede ofrecer GRUPOS de opciones que cambian qué insumo lleva
// (ej. "Tipo de luz": Monocolor o RGB). A diferencia de las variantes de
// color, cada opción tiene un PRECIO distinto, porque consume otro insumo.
//
// Misma partición en dos documentos que las variantes de color:
//
//   products/{id}              variantesInsumo: [{id, nombre, opciones:
//                                [{id, nombre, precio, disponible}]}]
//   products/{id}/privado/data variantesInsumo: [{id, opciones:
//                                [{id, insumoId, cantidad}]}]
//
// El precio SÍ es público: sin él el navegador no puede mostrar cuánto sale
// cada opción. Lo que no sale nunca es a qué insumo apunta, cuántas unidades
// consume ni cuántas quedan en el catálogo.
//
// El precio base del producto NO incluye ninguna opción: calcularRentabilidad
// suma producto.insumos (los FIJOS), y las variantes viven en otro campo. Por
// eso el precio público es base + selección, sin restar nada.

import { FACTOR_DISPONIBILIDAD_INSUMO } from './disponibilidad.js';

/** Id corto y estable para un grupo o una opción. */
export function nuevoIdInsumo(prefijo = "g") {
  return `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const texto = (v) => String(v || "").trim();
const cantidadDe = (v) => Math.max(1, Number(v) || 1);

/** Normaliza la mitad privada: a qué insumo apunta cada opción y cuánto lleva. */
export function normalizarGruposPrivados(grupos = []) {
  return (Array.isArray(grupos) ? grupos : [])
    .filter(g => g && g.id)
    .map(g => ({
      id: String(g.id),
      opciones: (Array.isArray(g.opciones) ? g.opciones : [])
        .filter(o => o && o.id)
        .map(o => ({
          id: String(o.id),
          insumoId: texto(o.insumoId),
          cantidad: cantidadDe(o.cantidad),
        })),
    }));
}

/** Normaliza la mitad pública: lo único que ve el cliente. */
export function normalizarGruposPublicos(grupos = []) {
  return (Array.isArray(grupos) ? grupos : [])
    .filter(g => g && g.id)
    .map(g => ({
      id: String(g.id),
      nombre: texto(g.nombre),
      opciones: (Array.isArray(g.opciones) ? g.opciones : [])
        .filter(o => o && o.id)
        .map(o => ({
          id: String(o.id),
          nombre: texto(o.nombre),
          precio: Number(o.precio) || 0,
          disponible: o.disponible === true,
        })),
    }));
}

/** Une las dos mitades en la forma que edita el backoffice. */
export function unirGruposInsumo(publicos = [], privados = []) {
  const porId = new Map(normalizarGruposPrivados(privados).map(g => [g.id, g.opciones]));
  return normalizarGruposPublicos(publicos).map(g => {
    const privadas = new Map((porId.get(g.id) || []).map(o => [o.id, o]));
    return {
      ...g,
      opciones: g.opciones.map(o => ({
        ...o,
        insumoId: privadas.get(o.id)?.insumoId || "",
        cantidad: privadas.get(o.id)?.cantidad ?? 1,
      })),
    };
  });
}

/** El insumo del catálogo al que apunta una opción. */
export const insumoDeOpcion = (catalogo = [], opcion) =>
  catalogo.find(i => i._id === opcion?.insumoId) || null;

/**
 * Lo que suma esa opción al precio: cantidad × precio unitario del catálogo.
 * Si el insumo ya no está, cae al snapshot guardado en la opción — igual que
 * hacen los insumos fijos.
 */
export function precioDeOpcion(opcion, catalogo = []) {
  const insumo = insumoDeOpcion(catalogo, opcion);
  const unitario = insumo
    ? Number(insumo.precioUnidad) || 0
    : Number(opcion?.precio) || 0;
  return insumo ? unitario * cantidadDe(opcion?.cantidad) : unitario;
}

/**
 * Evalúa un grupo contra el catálogo de insumos.
 *
 * Mismo criterio que los insumos fijos: alcanza con tener lo que consume UNA
 * unidad del producto (1×, no el doble como el filamento).
 */
export function disponibilidadDeGrupo(grupo, catalogo = []) {
  const opciones = (grupo?.opciones || []).map(o => {
    const insumo = insumoDeOpcion(catalogo, o);
    const enCatalogo = insumo ? Number(insumo.cantidadDisponible) || 0 : 0;
    const requerido = cantidadDe(o.cantidad) * FACTOR_DISPONIBILIDAD_INSUMO;
    return {
      ...o,
      // El nombre del catálogo manda; el de la opción es lo que ve el cliente.
      insumoNombre: insumo?.nombre || "",
      precio: precioDeOpcion(o, catalogo),
      requerido,
      enCatalogo,
      existe: Boolean(insumo),
      disponible: Boolean(insumo) && enCatalogo >= requerido,
    };
  });
  return {
    ...grupo,
    opciones,
    // Un grupo sin ninguna opción con stock deja al producto sin poder armarse.
    disponible: opciones.some(o => o.disponible),
  };
}

/** Todos los grupos evaluados. */
export const disponibilidadDeGrupos = (grupos = [], catalogo = []) =>
  grupos.map(g => disponibilidadDeGrupo(g, catalogo));

/**
 * ¿Se puede armar el producto por el eje de insumos? Sin grupos, sí: el eje
 * no aplica. Con grupos, CADA UNO tiene que tener al menos una opción.
 */
export const gruposArmables = (gruposEvaluados = []) =>
  gruposEvaluados.every(g => g.disponible);

/** La mitad pública derivada, lista para escribir en products/{id}. */
export function gruposPublicos(grupos = [], catalogo = []) {
  return disponibilidadDeGrupos(grupos, catalogo).map(g => ({
    id: g.id,
    nombre: g.nombre || "",
    opciones: g.opciones.map(o => ({
      id: o.id,
      nombre: o.nombre || "",
      precio: o.precio,
      disponible: o.disponible,
    })),
  }));
}

/** La mitad privada, lista para escribir en privado/data. */
export const gruposPrivados = (grupos = []) => normalizarGruposPrivados(grupos);

/**
 * Selección inicial: la primera opción CON stock de cada grupo. Nunca una
 * agotada, igual que el selector de color.
 */
export function seleccionInicial(gruposPublicos = []) {
  const salida = {};
  for (const g of gruposPublicos) {
    const elegible = g.opciones.find(o => o.disponible);
    if (elegible) salida[g.id] = elegible.id;
  }
  return salida;
}

/** La opción elegida de un grupo, o la primera con stock si la elegida no sirve. */
export function opcionElegida(grupo, seleccion = {}) {
  const opciones = grupo?.opciones || [];
  const pedida = opciones.find(o => o.id === seleccion[grupo?.id]);
  if (pedida?.disponible) return pedida;
  return opciones.find(o => o.disponible) || null;
}

/**
 * Cuánto suman al precio las opciones elegidas. Es lo que se agrega al precio
 * base del producto, que no incluye ninguna.
 */
export function precioDeSeleccion(gruposPublicos = [], seleccion = {}) {
  return gruposPublicos.reduce((total, g) => {
    const o = opcionElegida(g, seleccion);
    return total + (o ? Number(o.precio) || 0 : 0);
  }, 0);
}

/**
 * El precio más barato que se puede pagar hoy: base + la opción con stock más
 * barata de cada grupo. Es lo que muestran las tarjetas del catálogo como
 * "Desde", porque el precio base solo no lo puede pagar nadie cuando el
 * producto obliga a elegir.
 */
export function precioDesde(precioBase = 0, gruposPublicos = []) {
  return gruposPublicos.reduce((total, g) => {
    const conStock = g.opciones.filter(o => o.disponible);
    if (conStock.length === 0) return total;
    return total + Math.min(...conStock.map(o => Number(o.precio) || 0));
  }, Number(precioBase) || 0);
}

/** ¿Hay que mostrar "Desde"? Solo si alguna opción suma algo. */
export const tieneOpcionesConPrecio = (gruposPublicos = []) =>
  gruposPublicos.some(g => g.opciones.some(o => (Number(o.precio) || 0) > 0));

/**
 * Los insumos que consume la selección, para descontar del catálogo al
 * imprimir el pedido. Devuelve el mismo shape que lineasDeInsumo().
 */
export function insumosDeSeleccion(grupos = [], seleccion = {}, catalogo = []) {
  const salida = [];
  for (const grupo of disponibilidadDeGrupos(grupos, catalogo)) {
    const pedida = (grupo.opciones || []).find(o => o.id === seleccion[grupo.id]);
    if (!pedida || !pedida.insumoId) continue;
    salida.push({
      insumoId: pedida.insumoId,
      nombre: pedida.insumoNombre || pedida.nombre || "",
      cantidad: cantidadDe(pedida.cantidad),
      grupoId: grupo.id,
      grupoNombre: grupo.nombre || "",
      opcionId: pedida.id,
      opcionNombre: pedida.nombre || "",
    });
  }
  return salida;
}

/**
 * Insumos cargados en DOS lados a la vez: como insumo fijo del producto y
 * dentro de alguna opción de variante. Es un error de carga —el costo se
 * contaría dos veces— y el formulario lo avisa nombrando el insumo.
 */
export function insumosDuplicados(insumosFijos = [], grupos = [], catalogo = []) {
  const fijos = new Set(
    (insumosFijos || []).map(l => l?.insumoId).filter(Boolean)
  );
  const repetidos = new Map();
  for (const g of grupos || []) {
    for (const o of g?.opciones || []) {
      if (!o?.insumoId || !fijos.has(o.insumoId)) continue;
      const insumo = catalogo.find(i => i._id === o.insumoId);
      repetidos.set(o.insumoId, insumo?.nombre || o.nombre || o.insumoId);
    }
  }
  return [...repetidos.values()];
}

/** Etiqueta legible de la selección, para el carrito y el pedido. */
export function etiquetaSeleccion(gruposPublicos = [], seleccion = {}) {
  return gruposPublicos
    .map(g => {
      const o = opcionElegida(g, seleccion);
      return o ? `${g.nombre}: ${o.nombre}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

/** Clave estable de una selección, para la identidad de la línea del carrito. */
export const claveSeleccion = (seleccion = {}) =>
  Object.keys(seleccion).sort().map(k => `${k}:${seleccion[k]}`).join(",");
