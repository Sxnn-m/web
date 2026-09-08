// ─── Tipos de insumo ─────────────────────────────────────────────────
// Un insumo del catálogo ("Led", "Imán") tiene UNO O MÁS tipos, y cada tipo
// lleva su propio precio y su propio stock:
//
//   insumos/{id} = {
//     nombre: "Led",
//     tipo: "Luz",                       // agrupador descriptivo, NO es esto
//     tipos: [
//       { tipoId: "base", nombre: "Estándar", precioUnidad, cantidadDisponible },
//       { tipoId: "t…",   nombre: "RGB",      precioUnidad, cantidadDisponible },
//     ],
//   }
//
// Nunca hay un insumo "sin tipos": el que no los tenga en Firestore todavía es
// del modelo plano viejo y normalizarInsumo() le arma el suyo al vuelo.
//
// Lógica pura: sin React ni Firestore, para poder testearla en Node y usarla
// tanto en el backoffice como dentro de la transacción de impresión.

/** Id del tipo que se crea al migrar un insumo plano. Fijo, no generado. */
export const ID_TIPO_BASE = "base";

/**
 * Nombre del tipo único al migrar.
 *
 * No es "Único" (deja de ser cierto apenas se agrega el segundo) ni el nombre
 * del propio insumo (los selectores dirían "Led — Led"). "Estándar" se lee
 * bien al lado de un tipo nuevo y es editable como cualquier otro.
 */
export const NOMBRE_TIPO_BASE = "Estándar";

/** Id corto y estable para un tipo nuevo. */
export const nuevoIdTipo = () =>
  `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const texto = (v) => String(v || "").trim();
const numero = (v) => Number(v) || 0;

/** Un tipo con sus cuatro campos, saneado. */
export function normalizarTipo(t, indice = 0) {
  return {
    tipoId: texto(t?.tipoId) || (indice === 0 ? ID_TIPO_BASE : nuevoIdTipo()),
    nombre: texto(t?.nombre) || NOMBRE_TIPO_BASE,
    precioUnidad: numero(t?.precioUnidad),
    cantidadDisponible: numero(t?.cantidadDisponible),
  };
}

/** ¿Este documento sigue en el modelo plano (precio y stock en la raíz)? */
export const necesitaMigracion = (insumo) =>
  !Array.isArray(insumo?.tipos) || insumo.tipos.length === 0;

/**
 * El insumo con su array de tipos garantizado.
 *
 * Si el documento todavía es plano, arma el tipo base con el precio y el stock
 * que tenía en la raíz. Así todo el resto del código puede asumir "tipos"
 * aunque el doc no se haya reescrito todavía en Firestore.
 */
export function normalizarInsumo(insumo) {
  if (!insumo) return null;
  const { precioUnidad, cantidadDisponible, ...resto } = insumo;
  if (necesitaMigracion(insumo)) {
    return {
      ...resto,
      tipos: [{
        tipoId: ID_TIPO_BASE,
        nombre: NOMBRE_TIPO_BASE,
        precioUnidad: numero(precioUnidad),
        cantidadDisponible: numero(cantidadDisponible),
      }],
    };
  }
  return { ...resto, tipos: insumo.tipos.map(normalizarTipo) };
}

/** Los tipos de un insumo, siempre al menos uno. */
export const tiposDe = (insumo) => normalizarInsumo(insumo)?.tipos || [];

/** ¿Hay que hacer elegir un tipo, o hay uno solo y se ancla solo? */
export const esMultiTipo = (insumo) => tiposDe(insumo).length > 1;

/**
 * El tipo pedido, o el PRIMERO si no se pidió ninguno o el pedido ya no está.
 *
 * El fallback es lo que sostiene la migración: las referencias guardadas antes
 * de los tipos (productos con el insumo como fijo, opciones de variante) no
 * tienen tipoId, y el primer tipo de un insumo migrado es justamente el que
 * lleva el precio y el stock que ese producto ya estaba usando.
 */
export function buscarTipo(insumo, tipoId) {
  const tipos = tiposDe(insumo);
  if (tipos.length === 0) return null;
  return tipos.find(t => t.tipoId === tipoId) || tipos[0];
}

/** Resuelve una referencia {insumoId, tipoId} contra el catálogo. */
export function resolverInsumoTipo(catalogo = [], insumoId, tipoId) {
  const insumo = (catalogo || []).find(i => i?._id === insumoId) || null;
  return { insumo, tipo: insumo ? buscarTipo(insumo, tipoId) : null };
}

/** Precio por unidad del tipo referenciado; 0 si no existe. */
export const precioDeTipo = (catalogo, insumoId, tipoId) =>
  numero(resolverInsumoTipo(catalogo, insumoId, tipoId).tipo?.precioUnidad);

/** Stock del tipo referenciado; 0 si no existe. */
export const stockDeTipo = (catalogo, insumoId, tipoId) =>
  numero(resolverInsumoTipo(catalogo, insumoId, tipoId).tipo?.cantidadDisponible);

/**
 * "Led — RGB" con varios tipos, "Imán neodimio" con uno solo: repetir
 * "— Estándar" en cada selector sería ruido.
 */
export function etiquetaInsumoTipo(insumo, tipo) {
  const nombre = texto(insumo?.nombre);
  if (!insumo) return texto(tipo?.nombre);
  if (!esMultiTipo(insumo)) return nombre;
  return tipo ? `${nombre} — ${texto(tipo.nombre)}` : nombre;
}

/** Misma etiqueta, resolviendo la referencia contra el catálogo. */
export function etiquetaDeReferencia(catalogo, insumoId, tipoId, fallback = "") {
  const { insumo, tipo } = resolverInsumoTipo(catalogo, insumoId, tipoId);
  return insumo ? etiquetaInsumoTipo(insumo, tipo) : fallback;
}

/**
 * Clave de agrupación del consumo. Dos líneas de un pedido que comprometen el
 * MISMO tipo (una por insumo fijo, otra por opción de variante) caen en la
 * misma clave y se validan y descuentan sumadas, no como dos consumos
 * independientes que pasarían el chequeo por separado.
 */
export const claveTipo = (insumoId, tipoId) =>
  `${insumoId || ""}|${tipoId || ID_TIPO_BASE}`;

/** El tipoId real al que apunta una referencia, ya resuelto el fallback. */
export const tipoIdEfectivo = (catalogo, insumoId, tipoId) =>
  resolverInsumoTipo(catalogo, insumoId, tipoId).tipo?.tipoId || tipoId || ID_TIPO_BASE;

/**
 * Devuelve el array de tipos con el stock de uno modificado.
 *
 * increment() de Firestore no llega a un elemento de array, así que tanto el
 * restock manual como el descuento al imprimir reescriben el array entero
 * dentro de una transacción, a partir de lo que acaban de leer.
 */
export function sumarStockDeTipo(tipos = [], tipoId, delta) {
  const objetivo = buscarTipo({ tipos }, tipoId)?.tipoId;
  return tiposDe({ tipos }).map(t => t.tipoId === objetivo
    ? { ...t, cantidadDisponible: numero(t.cantidadDisponible) + numero(delta) }
    : t);
}

/** Ídem, pero fijando el stock en un valor absoluto. */
export function fijarStockDeTipo(tipos = [], tipoId, valor) {
  const objetivo = buscarTipo({ tipos }, tipoId)?.tipoId;
  return tiposDe({ tipos }).map(t => t.tipoId === objetivo
    ? { ...t, cantidadDisponible: numero(valor) }
    : t);
}
