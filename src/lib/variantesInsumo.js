// ─── Variantes de insumo ─────────────────────────────────────────────
// Un producto puede ofrecer GRUPOS de opciones que cambian qué insumo lleva
// (ej. "Tipo de luz": Monocolor o RGB). A diferencia de las variantes de
// color, cada opción tiene un PRECIO distinto, porque consume otro insumo.
//
// Misma partición en dos documentos que las variantes de color:
//
//   products/{id}              variantesInsumo: [{id, nombre, opciones:
//                                [{id, nombre, precio, precioManual, disponible}]}]
//   products/{id}/privado/data variantesInsumo: [{id, opciones:
//                                [{id, insumoId, tipoId, cantidad}]}]
//
// El precio SÍ es público: sin él el navegador no puede mostrar cuánto sale
// cada opción. Lo que no sale nunca es a qué insumo ni a qué tipo apunta,
// cuántas unidades consume ni cuántas quedan en el catálogo.
//
// El precio base del producto NO incluye ninguna opción: calcularRentabilidad
// suma producto.insumos (los FIJOS), y las variantes viven en otro campo. Por
// eso el precio público es base + selección, sin restar nada.

import { FACTOR_DISPONIBILIDAD_INSUMO } from './disponibilidad.js';
import { resolverInsumoTipo, etiquetaInsumoTipo } from './tiposInsumo.js';

/** Id corto y estable para un grupo o una opción. */
export function nuevoIdInsumo(prefijo = "g") {
  return `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const texto = (v) => String(v || "").trim();

/**
 * Cuántas unidades consume una opción. A diferencia de los insumos fijos, acá
 * el 0 es un valor válido: es como se ofrece un "Sin cargador" al lado de un
 * "Con cargador". Una opción en 0 no consume nada, no cuesta nada y no
 * depende de ningún stock.
 */
const cantidadDe = (v) => Math.max(0, Math.round(Number(v) || 0));

/** Las unidades que consume una opción, ya saneadas. La usa el formulario. */
export const cantidadDeOpcion = (opcion) => cantidadDe(opcion?.cantidad);

/**
 * ¿Esta opción compromete stock del catálogo?
 *
 * No lo hace si no lleva unidades, ni si no apunta a ningún insumo: las dos
 * cosas describen lo mismo —una opción que existe pero no consume— y se
 * tratan igual en todo el flujo (precio, disponibilidad, descuento, gasto).
 */
export const opcionSinConsumo = (opcion) =>
  !texto(opcion?.insumoId) || cantidadDe(opcion?.cantidad) === 0;

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
          // Qué TIPO de ese insumo lleva la opción. Vacío en las opciones
          // guardadas antes de los tipos: buscarTipo() cae al primero.
          tipoId: texto(o.tipoId),
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
          // Lo que la opción SUMA al precio base (su costo de insumo).
          precio: Number(o.precio) || 0,
          // Precio FINAL fijado a mano para esta opción, base incluida. null
          // = automático. Solo se aplica con un único grupo (ver
          // precioDeCombinacion).
          precioManual: Number.isFinite(Number(o.precioManual)) && o.precioManual !== null
            && o.precioManual !== "" ? Number(o.precioManual) : null,
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
        tipoId: privadas.get(o.id)?.tipoId || "",
        cantidad: privadas.get(o.id)?.cantidad ?? 1,
        // El precio manual es un precio: vive en la mitad pública.
        manual: o.precioManual !== null,
      })),
    };
  });
}

/** El insumo del catálogo al que apunta una opción. */
export const insumoDeOpcion = (catalogo = [], opcion) =>
  catalogo.find(i => i._id === opcion?.insumoId) || null;

/** El insumo Y el tipo concreto al que apunta una opción. */
export const referenciaDeOpcion = (catalogo = [], opcion) =>
  resolverInsumoTipo(catalogo, opcion?.insumoId, opcion?.tipoId);

/**
 * Lo que suma esa opción al precio: cantidad × precio unitario del TIPO
 * elegido. Si el insumo ya no está, cae al snapshot guardado en la opción —
 * igual que hacen los insumos fijos.
 *
 * Una opción que no consume nada suma 0, aunque tenga un snapshot viejo: no
 * hay unidades que cobrar. Su precio manual, si lo tiene, es otra cosa y sigue
 * mandando (ver precioDeCombinacion).
 */
export function precioDeOpcion(opcion, catalogo = []) {
  if (opcionSinConsumo(opcion)) return 0;
  const { tipo } = referenciaDeOpcion(catalogo, opcion);
  const unitario = tipo
    ? Number(tipo.precioUnidad) || 0
    : Number(opcion?.precio) || 0;
  return tipo ? unitario * cantidadDe(opcion?.cantidad) : unitario;
}

/**
 * Evalúa un grupo contra el catálogo de insumos.
 *
 * Mismo criterio que los insumos fijos: alcanza con tener lo que consume UNA
 * unidad del producto (1×, no el doble como el filamento).
 */
export function disponibilidadDeGrupo(grupo, catalogo = []) {
  const opciones = (grupo?.opciones || []).map(o => {
    const { insumo, tipo } = referenciaDeOpcion(catalogo, o);
    // El stock que cuenta es el del TIPO: tener leds monocolor de sobra no
    // habilita la opción RGB.
    const enCatalogo = tipo ? Number(tipo.cantidadDisponible) || 0 : 0;
    const requerido = cantidadDe(o.cantidad) * FACTOR_DISPONIBILIDAD_INSUMO;

    // Una opción que no consume nada ("Sin cargador") no depende de ningún
    // stock: no hay nada que reponer para poder ofrecerla, así que está
    // disponible siempre y no necesita insumo vinculado.
    if (opcionSinConsumo(o)) {
      return {
        ...o,
        sinConsumo: true,
        insumoNombre: insumo ? etiquetaInsumoTipo(insumo, tipo) : "",
        tipoNombre: tipo?.nombre || "",
        tipoId: tipo?.tipoId || o.tipoId || "",
        precio: 0,
        requerido: 0,
        enCatalogo: 0,
        existe: true,
        disponible: true,
      };
    }

    return {
      ...o,
      sinConsumo: false,
      // El nombre del catálogo manda; el de la opción es lo que ve el cliente.
      insumoNombre: insumo ? etiquetaInsumoTipo(insumo, tipo) : "",
      tipoNombre: tipo?.nombre || "",
      // El tipo REAL al que quedó anclada: con una opción vieja sin tipoId es
      // el primero del insumo, y es el que hay que descontar.
      tipoId: tipo?.tipoId || o.tipoId || "",
      precio: precioDeOpcion(o, catalogo),
      requerido,
      enCatalogo,
      existe: Boolean(insumo && tipo),
      disponible: Boolean(insumo && tipo) && enCatalogo >= requerido,
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
      precioManual: o.manual === true && Number.isFinite(Number(o.precioManual))
        ? Number(o.precioManual) : null,
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

/**
 * La opción elegida de un grupo, o la primera con stock si la elegida no sirve.
 *
 * @param {boolean} [opciones.exigirStock=true] En el catálogo público sí: una
 *   opción agotada no se puede comprar, y si el stock cambió después de cargar
 *   la página hay que caer en una que sí se pueda. En el backoffice NO: el
 *   pedido registra lo que se vendió, y una opción sin stock se elige a
 *   propósito (se imprime cuando llegue). Ahí caer en otra opción cobraría un
 *   precio que no es el de lo que se pidió.
 */
export function opcionElegida(grupo, seleccion = {}, { exigirStock = true } = {}) {
  const opciones = grupo?.opciones || [];
  const pedida = opciones.find(o => o.id === seleccion[grupo?.id]);
  if (pedida && (!exigirStock || pedida.disponible)) return pedida;
  return opciones.find(o => o.disponible) || null;
}

/**
 * Cuánto suman al precio las opciones elegidas. Es lo que se agrega al precio
 * base del producto, que no incluye ninguna.
 */
export function precioDeSeleccion(gruposPublicos = [], seleccion = {}, opts) {
  return gruposPublicos.reduce((total, g) => {
    const o = opcionElegida(g, seleccion, opts);
    return total + (o ? Number(o.precio) || 0 : 0);
  }, 0);
}

/**
 * ¿Se puede fijar un precio manual por opción?
 *
 * Solo con UN grupo. El precio manual es el precio FINAL de esa opción (base
 * incluida), mientras que el automático es un SUMANDO. Con dos o más grupos
 * habría que sumar totales con sumandos, y la base quedaría contada de más:
 * no hay resta que arregle eso cuando se mezcla una opción manual con una
 * automática. Antes que una regla que solo cierra en algunos casos, se
 * restringe la función a donde es exacta.
 */
export const permiteManual = (grupos = []) => grupos.length === 1;

/**
 * El precio de UNA combinación concreta. Es la única regla de precio del
 * módulo: la usan el detalle, la tarjeta del catálogo y el carrito.
 *
 *   un grupo con precio manual en la opción elegida → ese precio, tal cual
 *   en cualquier otro caso                          → base + Σ sumandos
 */
export function precioDeCombinacion(precioBase = 0, gruposPublicos = [], seleccion = {}, opts) {
  const base = Number(precioBase) || 0;
  if (permiteManual(gruposPublicos)) {
    const o = opcionElegida(gruposPublicos[0], seleccion, opts);
    if (o && o.precioManual !== null && o.precioManual !== undefined) {
      return Number(o.precioManual) || 0;
    }
  }
  return base + precioDeSeleccion(gruposPublicos, seleccion, opts);
}

/**
 * Precios manuales que están cargados pero NO se aplican porque el producto
 * tiene más de un grupo. Se conservan guardados —sacar el grupo extra los
 * devuelve a la vida— pero el formulario tiene que avisar que hoy no rigen.
 */
export function manualesIgnorados(grupos = []) {
  if (permiteManual(grupos) || grupos.length === 0) return [];
  return grupos.flatMap(g => (g.opciones || [])
    .filter(o => o.manual === true || (o.precioManual !== null && o.precioManual !== undefined))
    .map(o => `${g.nombre || "(sin nombre)"}: ${o.nombre || "(sin nombre)"}`));
}

/**
 * El precio más barato que se puede pagar hoy: la combinación con stock más
 * barata. Es lo que muestran las tarjetas del catálogo como "Desde", porque el
 * precio base solo no lo puede pagar nadie cuando el producto obliga a elegir.
 *
 * Con un grupo se evalúa opción por opción (una puede tener precio manual);
 * con varios, se toma el sumando más barato de cada uno.
 */
export function precioDesde(precioBase = 0, gruposPublicos = []) {
  const base = Number(precioBase) || 0;

  if (permiteManual(gruposPublicos)) {
    const conStock = gruposPublicos[0].opciones.filter(o => o.disponible);
    if (conStock.length === 0) return base;
    return Math.min(...conStock.map(o =>
      precioDeCombinacion(base, gruposPublicos, { [gruposPublicos[0].id]: o.id })));
  }

  return gruposPublicos.reduce((total, g) => {
    const conStock = g.opciones.filter(o => o.disponible);
    if (conStock.length === 0) return total;
    return total + Math.min(...conStock.map(o => Number(o.precio) || 0));
  }, base);
}

/**
 * ¿Hay que mostrar "Desde"? Si alguna opción suma algo, o si hay precios
 * manuales (que por definición cambian el total según lo que se elija).
 */
export const tieneOpcionesConPrecio = (gruposPublicos = []) =>
  gruposPublicos.some(g => g.opciones.some(o =>
    (Number(o.precio) || 0) > 0 || (o.precioManual !== null && o.precioManual !== undefined)));

/**
 * La opción que se vendió en un grupo, para descontar stock.
 *
 * A diferencia de opcionElegida() —que es la del catálogo público y cae en la
 * primera con stock— acá NO se sustituye por otra: descontar un insumo que no
 * es el que se pidió sería peor que no descontar nada. Lo único que se
 * resuelve solo es el grupo de una sola opción: no hay ambigüedad posible, y
 * es lo que hace falta para los pedidos anteriores a las variantes de insumo.
 */
export function opcionPedida(grupo, seleccion = {}) {
  const opciones = grupo?.opciones || [];
  const pedida = opciones.find(o => o.id === seleccion?.[grupo?.id]);
  if (pedida) return pedida;
  return opciones.length === 1 ? opciones[0] : null;
}

/**
 * Los insumos que consume la selección, para descontar del catálogo al
 * imprimir el pedido. Devuelve el mismo shape que lineasDeInsumo().
 */
export function insumosDeSeleccion(grupos = [], seleccion = {}, catalogo = []) {
  const salida = [];
  for (const grupo of disponibilidadDeGrupos(grupos, catalogo)) {
    const pedida = opcionPedida(grupo, seleccion);
    // Sin línea no hay descuento, ni gasto, ni nada que validar: es como se
    // resuelve solo el caso de una opción que no consume ("Sin cargador").
    if (!pedida || pedida.sinConsumo || !pedida.insumoId) continue;
    salida.push({
      insumoId: pedida.insumoId,
      tipoId: pedida.tipoId || "",
      nombre: pedida.insumoNombre || pedida.nombre || "",
      tipoNombre: pedida.tipoNombre || "",
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
 * El MISMO TIPO cargado en dos lados a la vez: como insumo fijo del producto y
 * dentro de alguna opción de variante. Se cobra y se descuenta dos veces
 * —sumadas, no por separado, ver agruparConsumo()—, así que no está prohibido,
 * pero casi siempre es un error de carga y el formulario lo avisa.
 *
 * Se compara por insumo + tipo: usar el Led monocolor como fijo y ofrecer el
 * RGB como opción es una combinación válida y no se marca.
 */
export function insumosDuplicados(insumosFijos = [], grupos = [], catalogo = []) {
  const claveDe = (insumoId, tipoId) => {
    const { tipo } = resolverInsumoTipo(catalogo, insumoId, tipoId);
    return `${insumoId}|${tipo?.tipoId || tipoId || ""}`;
  };
  const fijos = new Set(
    (insumosFijos || [])
      .filter(l => l?.insumoId)
      .map(l => claveDe(l.insumoId, l.tipoId))
  );
  const repetidos = new Map();
  for (const g of grupos || []) {
    for (const o of g?.opciones || []) {
      // Una opción que no consume nada no cobra dos veces nada.
      if (!o?.insumoId || opcionSinConsumo(o)) continue;
      const clave = claveDe(o.insumoId, o.tipoId);
      if (!fijos.has(clave)) continue;
      const { insumo, tipo } = resolverInsumoTipo(catalogo, o.insumoId, o.tipoId);
      repetidos.set(clave, insumo
        ? etiquetaInsumoTipo(insumo, tipo)
        : o.nombre || o.insumoId);
    }
  }
  return [...repetidos.values()];
}

/** Etiqueta legible de la selección, para el carrito y el pedido. */
export function etiquetaSeleccion(gruposPublicos = [], seleccion = {}, opts) {
  return gruposPublicos
    .map(g => {
      const o = opcionElegida(g, seleccion, opts);
      return o ? `${g.nombre}: ${o.nombre}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

/** Clave estable de una selección, para la identidad de la línea del carrito. */
export const claveSeleccion = (seleccion = {}) =>
  Object.keys(seleccion).sort().map(k => `${k}:${seleccion[k]}`).join(",");
