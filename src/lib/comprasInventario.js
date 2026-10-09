// ─── Comprar es mover inventario ─────────────────────────────────────
// Guardar un ítem de filamento o de insumo en un gasto suma stock y deja un
// restock en el historial. Lo difícil no es sumar: es que editar y borrar no
// sumen dos veces ni dejen restocks huérfanos.
//
// Por eso hay UNA sola función para el detalle, aplicarItem(), que siempre
// hace lo mismo: revierte el ítem anterior y aplica el nuevo. Crear es
// anterior=null, borrar es nuevo=null, editar son los dos. "No sumar dos
// veces" deja de ser un caso que haya que acordarse de programar y pasa a ser
// la única forma que tiene.
//
// El alta de un gasto entero (crearGastoConItems) no puede llamar N veces a
// aplicarItem: serían N transacciones y el pedido es que el gasto, el número
// correlativo, el stock y los restocks entren o no entren juntos. Lo que
// comparten es todo lo de abajo —cómo se resuelve un destino, cómo se lee,
// cómo se valida, cómo se escribe— así que esa lógica sigue en un solo lugar
// y lo único distinto entre las dos es la orquestación.
//
// En las dos vale la misma regla de Firestore: TODAS las lecturas antes de
// cualquier escritura, y adentro de una transacción no se puede consultar una
// colección, solo leer documentos por referencia. Por eso los destinos se
// resuelven afuera y se vuelven a leer adentro.

import {
  collection, doc, runTransaction, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { buscarRollo, claveDeRollo } from './transferencias.js';
import { tiposDe, sumarStockDeTipo } from './tiposInsumo.js';
import {
  mueveStock, mismoDestino, claveDeDestino, totalDeItems,
} from './gastoItems.js';
import {
  refContadores, formatearNumeroGasto, validarGasto,
} from './finanzas.js';

const COL_FILAMENTOS = "filamentos";
const COL_INSUMOS = "insumos";
const COL_GASTOS = "gastos";

/** La nota que queda en el historial. Dice de qué compra vino. */
export const notaDeCompra = (numeroGasto) =>
  `Compra ${String(numeroGasto || "").trim() || "(gasto sin número)"}`;

/** Cuántas unidades mueve un ítem: gramos en filamento, unidades en insumo. */
const cantidadDe = (item) => Number(item?.cantidad) || 0;

export class StockInsuficienteError extends Error {
  constructor(mensaje) { super(mensaje); this.name = "StockInsuficienteError"; }
}

/** El documento destino dejó de ser el que se había resuelto en pantalla. */
export class DestinoCambiadoError extends Error {
  constructor(mensaje) { super(mensaje); this.name = "DestinoCambiadoError"; }
}

// ── Destinos: a qué documento va el stock de un ítem ──────────────────

/**
 * Dónde cae el stock de este ítem, resuelto ANTES de abrir la transacción.
 *
 * Para el filamento puede no existir todavía: ahí devuelve una referencia
 * nueva con crear=true. La referencia se genera igual, así se puede usar para
 * armar la ruta del restock y guardar el filamentoId del ítem sin esperar a
 * que la transacción corra.
 *
 * @returns {{ref, tipo, tipoId, crear, caracteristicas}|null}
 */
export function resolverDestino(item, filamentos = []) {
  if (!mueveStock(item)) return null;

  if (item.categoria === "filamento") {
    const existente = item.filamentoId
      ? filamentos.find(f => f._id === item.filamentoId)
      : buscarRollo(filamentos, item);
    return {
      ref: existente ? doc(db, COL_FILAMENTOS, existente._id) : doc(collection(db, COL_FILAMENTOS)),
      tipo: "filamento", tipoId: null, crear: !existente, caracteristicas: item,
    };
  }
  if (!item.insumoId) throw new Error("El ítem de insumo no dice qué insumo es.");
  if (!item.tipoId) throw new Error(`No se resolvió el tipo de "${item.insumoNombre || "el insumo"}".`);
  return {
    ref: doc(db, COL_INSUMOS, item.insumoId),
    tipo: "insumo", tipoId: item.tipoId, crear: false, caracteristicas: item,
  };
}

/** Una cuenta por documento: cuánto se le suma en total, de todos los ítems. */
const nuevaCuenta = (destino) => ({ ...destino, snap: null, delta: 0, ausente: false });

/** Cuánto hay hoy en el documento leído, en sus propias unidades. */
function stockActual(cuenta) {
  if (cuenta.tipo === "filamento") return Number(cuenta.snap.data().cantidadGramos) || 0;
  const t = tiposDe({ _id: cuenta.ref.id, ...cuenta.snap.data() })
    .find(x => x.tipoId === cuenta.tipoId);
  return Number(t?.cantidadDisponible) || 0;
}

const unidadDe = (cuenta) => (cuenta.tipo === "filamento" ? "g" : "u.");

/** Cómo se lee este destino en un mensaje de error. */
function nombreDeDestino(cuenta) {
  const c = cuenta.caracteristicas || {};
  return cuenta.tipo === "filamento"
    ? `${c.material || ""} ${c.color || ""} de ${c.owner || "sin owner"}`.trim()
    : `${c.insumoNombre || "el insumo"}${c.tipoNombre ? ` · ${c.tipoNombre}` : ""}`;
}

/**
 * Lo leído adentro de la transacción tiene que seguir siendo lo que se
 * resolvió afuera. Entre que la pantalla cargó y el botón se tocó, alguien
 * pudo borrar el rollo desde Inventario o renombrarle el owner, y sumarle
 * gramos igual los metería en el documento equivocado.
 */
function verificarDestino(cuenta) {
  if (!cuenta.snap.exists()) {
    throw new DestinoCambiadoError(
      `${nombreDeDestino(cuenta)} ya no existe en el inventario. Se borró mientras cargabas la compra: ` +
      `volvé a abrir la pantalla para que el ítem se resuelva de nuevo.`
    );
  }
  if (cuenta.tipo === "filamento") {
    const guardado = { _id: cuenta.ref.id, ...cuenta.snap.data() };
    const mismoOwner = String(guardado.owner || "").trim().toLowerCase()
      === String(cuenta.caracteristicas.owner || "").trim().toLowerCase();
    if (claveDeRollo(guardado) !== claveDeRollo(cuenta.caracteristicas) || !mismoOwner) {
      throw new DestinoCambiadoError(
        `El rollo ${nombreDeDestino(cuenta)} cambió mientras cargabas la compra ` +
        `(ahora es ${guardado.material} ${guardado.color} de ${guardado.owner || "sin owner"}). ` +
        `Volvé a abrir la pantalla.`
      );
    }
  } else {
    const hay = tiposDe({ _id: cuenta.ref.id, ...cuenta.snap.data() })
      .some(t => t.tipoId === cuenta.tipoId);
    if (!hay) {
      throw new DestinoCambiadoError(
        `${nombreDeDestino(cuenta)} ya no tiene ese tipo: se borró mientras cargabas la compra. ` +
        `Volvé a abrir la pantalla.`
      );
    }
  }
}

/**
 * Qué impide escribir esta cuenta.
 *
 * @param {boolean} exigeDestinoIntacto en el alta sí: sumar en un documento
 *   que ya no es el que se eligió es peor que no guardar. Al editar o borrar
 *   un ítem no, porque entonces un rollo borrado a mano dejaría el ítem
 *   atrapado sin forma de sacarlo; ahí se marca ausente y se sigue.
 */
function validarCuenta(cuenta, { exigeDestinoIntacto = false } = {}) {
  if (cuenta.crear) return;
  if (exigeDestinoIntacto) { verificarDestino(cuenta); }
  else if (!cuenta.snap.exists()) { cuenta.ausente = true; return; }

  if (cuenta.delta >= 0) return;
  const hay = stockActual(cuenta);
  if (hay + cuenta.delta < 0) {
    const u = unidadDe(cuenta);
    throw new StockInsuficienteError(
      `No se puede revertir: hay ${hay} ${u} y habría que restar ${-cuenta.delta} ${u}. ` +
      `Ya se consumió o se reservó parte. Ajustalo a mano desde ` +
      `${cuenta.tipo === "filamento" ? "Inventario" : "Insumos"} y volvé a intentar.`
    );
  }
}

/** El stock nuevo del documento. Una sola escritura por documento. */
function escribirCuenta(tx, cuenta) {
  if (cuenta.ausente) return;
  if (cuenta.crear) {
    const c = cuenta.caracteristicas;
    tx.set(cuenta.ref, {
      material: String(c.material || "").trim(),
      color: String(c.color || "").trim(),
      marca: String(c.marca || "").trim(),
      owner: String(c.owner || "").trim(),
      cantidadGramos: cuenta.delta,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  // Delta neto 0 —se editó el precio y no la cantidad— no escribe nada.
  if (cuenta.delta === 0) return;

  if (cuenta.tipo === "filamento") {
    tx.update(cuenta.ref, {
      cantidadGramos: stockActual(cuenta) + cuenta.delta,
      updatedAt: serverTimestamp(),
    });
  } else {
    tx.update(cuenta.ref, {
      tipos: sumarStockDeTipo(tiposDe({ _id: cuenta.ref.id, ...cuenta.snap.data() }),
        cuenta.tipoId, cuenta.delta),
      // Por si el insumo todavía estaba plano: el stock pasa a vivir en el
      // tipo y los campos de la raíz no pueden quedar como segunda verdad.
      precioUnidad: deleteField(),
      cantidadDisponible: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }
}

// ── Restocks ──────────────────────────────────────────────────────────

/** Dónde vive el historial del destino de este ítem. */
const rutaRestock = (item, refDoc) => item.categoria === "filamento"
  ? [COL_FILAMENTOS, refDoc.id, "restocks"]
  : [COL_INSUMOS, refDoc.id, "tipos", item.tipoId, "restocks"];

const datosDeRestock = (item, numeroGasto) => ({
  cantidadAgregada: cantidadDe(item),
  nota: notaDeCompra(numeroGasto),
  fecha: serverTimestamp(),
});

// ── Monto del gasto ───────────────────────────────────────────────────

/**
 * Qué escribir en el gasto cuando cambian sus ítems.
 *
 * Un gasto de antes del interruptor no tiene el campo montoManual. Si recibe
 * su primer ítem, se le sella en true: su monto lo escribió una persona y
 * tiene que quedarse donde está, no pasar a ser la suma de lo que se le
 * agregue. Sellarlo acá —y no deducirlo cada vez que se lee— es lo que hace
 * que el saldo no se mueva solo.
 */
function montoAGuardar(datosPrevios, items) {
  const manual = typeof datosPrevios?.montoManual === "boolean"
    ? datosPrevios.montoManual
    : !(Array.isArray(datosPrevios?.items) && datosPrevios.items.length > 0);
  return manual ? { montoManual: true } : { montoManual: false, monto: totalDeItems(items) };
}

// ── Guardar un ítem (detalle del gasto) ───────────────────────────────

/**
 * Aplica un cambio de ítem y mueve el inventario que corresponda, todo en una
 * transacción con el documento del gasto.
 *
 * @param {object} gasto        el gasto, con sus items actuales
 * @param {object|null} anterior el ítem como estaba guardado (null si es alta)
 * @param {object|null} nuevo    el ítem como queda (null si es baja)
 * @param {Array} filamentos    catálogo en pantalla, solo para resolver ids:
 *   las cantidades siempre salen de la lectura transaccional
 * @returns {Promise<{items: Array, creoFilamento: boolean, movioStock: boolean}>}
 */
export async function aplicarItem({ gasto, anterior = null, nuevo = null, filamentos = [] }) {
  const mueveAlgo = mueveStock(anterior) || mueveStock(nuevo);

  // El destino del ítem nuevo se resuelve afuera: adentro no se puede
  // consultar la colección de filamentos.
  const destinoNuevo = mueveStock(nuevo) ? resolverDestino(nuevo, filamentos) : null;

  return runTransaction(db, async (tx) => {
    const refGasto = doc(db, COL_GASTOS, gasto._id);

    // ── 1. Lecturas: todas antes de cualquier escritura ──
    const snapGasto = await tx.get(refGasto);
    if (!snapGasto.exists()) throw new Error("El gasto ya no existe.");

    // Un mapa por documento para netear antes de escribir: dos tx.update al
    // mismo doc se pisan y el segundo se llevaría puesto al primero.
    const cuentas = new Map();
    const acumular = async (destino, delta) => {
      const clave = destino.ref.path;
      if (!cuentas.has(clave)) {
        const cuenta = nuevaCuenta(destino);
        if (!cuenta.crear) cuenta.snap = await tx.get(cuenta.ref);
        cuentas.set(clave, cuenta);
      }
      const cuenta = cuentas.get(clave);
      cuenta.delta += delta;
      return cuenta;
    };

    // Lo que hay que devolver del ítem anterior. Va por su filamentoId
    // guardado y no por buscarRollo: lo que se revierte es adonde FUE, no
    // adonde iría hoy.
    let refAnterior = null;
    if (mueveStock(anterior)) {
      if (anterior.categoria === "filamento" && anterior.filamentoId) {
        refAnterior = doc(db, COL_FILAMENTOS, anterior.filamentoId);
        await acumular({
          ref: refAnterior, tipo: "filamento", tipoId: null, crear: false,
          caracteristicas: anterior,
        }, -cantidadDe(anterior));
      } else if (anterior.categoria === "insumo" && anterior.insumoId) {
        refAnterior = doc(db, COL_INSUMOS, anterior.insumoId);
        await acumular({
          ref: refAnterior, tipo: "insumo", tipoId: anterior.tipoId, crear: false,
          caracteristicas: anterior,
        }, -cantidadDe(anterior));
      }
    }

    // Lo que hay que sumar del nuevo.
    let refNuevo = null;
    if (destinoNuevo) {
      refNuevo = destinoNuevo.ref;
      await acumular(destinoNuevo, cantidadDe(nuevo));
    }

    // ── 2. Validación contra lo recién leído ──
    for (const cuenta of cuentas.values()) validarCuenta(cuenta);

    // ── 3. Escrituras de stock ──
    for (const cuenta of cuentas.values()) escribirCuenta(tx, cuenta);

    // El restock. Si el destino no cambió se ACTUALIZA el que ya existe en vez
    // de crear otro: editar los gramos de una compra no es una compra nueva.
    let restockId = null;
    const reutiliza = anterior && nuevo && mismoDestino(anterior, nuevo) && anterior.restockId;

    if (mueveStock(anterior) && refAnterior && anterior.restockId && !reutiliza) {
      tx.delete(doc(db, ...rutaRestock(anterior, refAnterior), anterior.restockId));
    }
    if (mueveStock(nuevo) && refNuevo) {
      const ref = reutiliza
        ? doc(db, ...rutaRestock(nuevo, refNuevo), anterior.restockId)
        : doc(collection(db, ...rutaRestock(nuevo, refNuevo)));
      tx.set(ref, datosDeRestock(nuevo, gasto.numeroGasto));
      restockId = ref.id;
    }

    // ── 4. El array de ítems del gasto ──
    const datosPrevios = snapGasto.data();
    const actuales = Array.isArray(datosPrevios.items) ? datosPrevios.items : [];
    const id = (nuevo || anterior)?.itemId;
    let items;
    if (!nuevo) {
      items = actuales.filter(i => i.itemId !== id);
    } else {
      const guardado = {
        ...nuevo,
        ...(nuevo.categoria === "filamento" ? { filamentoId: refNuevo?.id || null } : {}),
        ...(mueveStock(nuevo) ? { restockId } : {}),
      };
      items = actuales.some(i => i.itemId === id)
        ? actuales.map(i => (i.itemId === id ? guardado : i))
        : [...actuales, guardado];
    }
    tx.update(refGasto, { items, ...montoAGuardar(datosPrevios, items) });

    return { items, creoFilamento: Boolean(destinoNuevo?.crear), movioStock: mueveAlgo };
  });
}

// ── Alta de un gasto completo ─────────────────────────────────────────

/**
 * El gasto entero en una sola transacción: el número correlativo, el
 * documento, el stock de cada ítem y un restock por ítem. O entra todo, o no
 * entra nada: no puede quedar un gasto sin su stock, ni —peor— stock sumado
 * sin el gasto que lo explique, ni el contador gastado sin documento.
 *
 * Los ítems que van al MISMO documento se suman en una sola escritura y, si
 * ese rollo todavía no existe, se crea una vez para todos. Cada ítem conserva
 * igual su propio restock: dos compras del mismo rollo el mismo día son dos
 * renglones del historial, no uno.
 *
 * @returns {Promise<{numeroGasto: string, gastoId: string, creados: number}>}
 */
export async function crearGastoConItems({
  fecha, descripcion, monto, montoManual = false, detalle = "",
  items = [], filamentos = [],
}) {
  const { valido, errores, datos } = validarGasto({ fecha, descripcion, monto, montoManual, items });
  if (!valido) throw new Error(Object.values(errores).join(" "));

  // Copias propias: a cada ítem se le escribe su filamentoId y su restockId.
  const finales = items.map(i => ({ ...i }));

  // ── 1. Agrupar por destino y resolver cada grupo UNA vez ──
  const cuentas = new Map();
  const cuentaDe = new Map();
  for (const item of finales) {
    if (!mueveStock(item)) continue;
    const clave = claveDeDestino(item);
    if (!cuentas.has(clave)) cuentas.set(clave, nuevaCuenta(resolverDestino(item, filamentos)));
    const cuenta = cuentas.get(clave);
    cuenta.delta += cantidadDe(item);
    cuentaDe.set(item.itemId, cuenta);
  }

  // ── 2. Referencias de los restocks, antes de la transacción ──
  // El array de ítems guarda el restockId de cada uno, así que los ids tienen
  // que existir antes de escribir el gasto. Generarlos del lado del cliente es
  // justo lo que permite escribir las dos cosas en la misma transacción.
  const restocks = [];
  for (const item of finales) {
    const cuenta = cuentaDe.get(item.itemId);
    if (!cuenta) continue;
    if (item.categoria === "filamento") item.filamentoId = cuenta.ref.id;
    const ref = doc(collection(db, ...rutaRestock(item, cuenta.ref)));
    item.restockId = ref.id;
    restocks.push({ item, ref });
  }

  const refGasto = doc(collection(db, COL_GASTOS));

  return runTransaction(db, async (tx) => {
    // ── Lecturas: el contador y cada documento destino, una vez por
    // documento aunque lo toquen tres ítems ──
    const snapContador = await tx.get(refContadores());
    for (const cuenta of cuentas.values()) {
      if (!cuenta.crear) cuenta.snap = await tx.get(cuenta.ref);
    }

    // ── Verificación: que el destino siga siendo el que se resolvió ──
    for (const cuenta of cuentas.values()) {
      validarCuenta(cuenta, { exigeDestinoIntacto: true });
    }

    // ── Escrituras ──
    const siguiente = (Number(snapContador.exists() ? snapContador.data().gastos : 0) || 0) + 1;
    const numeroGasto = formatearNumeroGasto(siguiente);
    // merge para no pisar otros contadores que viven en el mismo documento.
    tx.set(refContadores(), { gastos: siguiente }, { merge: true });

    for (const cuenta of cuentas.values()) escribirCuenta(tx, cuenta);
    for (const { item, ref } of restocks) tx.set(ref, datosDeRestock(item, numeroGasto));

    tx.set(refGasto, {
      numeroGasto,
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      // El valor efectivo, el que suman el saldo y los totales.
      monto: datos.monto,
      montoManual: Boolean(montoManual),
      detalle: String(detalle || ""),
      items: finales,
      createdAt: serverTimestamp(),
    });

    return {
      numeroGasto,
      gastoId: refGasto.id,
      creados: [...cuentas.values()].filter(c => c.crear).length,
    };
  });
}

// ── Borrado de un gasto ───────────────────────────────────────────────

/**
 * Qué pasaría al borrar un gasto entero: qué ítems hay que revertir y si
 * alguno no se puede. Se consulta ANTES de borrar, para poder mostrarlo en la
 * confirmación en vez de fallar a mitad de camino.
 *
 * @returns {{aRevertir: Array, bloqueos: Array<string>}}
 */
export function previsualizarBorrado(gasto, { filamentos = [], insumos = [] } = {}) {
  const aRevertir = [];
  const bloqueos = [];

  // Lo que cada documento tendría que devolver en total: dos ítems del mismo
  // rollo se revierten juntos, y mirarlos de a uno diría que alcanza cuando
  // entre los dos no alcanza.
  const porDoc = new Map();
  for (const item of (gasto?.items || [])) {
    if (!mueveStock(item)) continue;
    aRevertir.push(item);
    const clave = claveDeDestino(item);
    porDoc.set(clave, (porDoc.get(clave) || 0) + cantidadDe(item));
  }

  for (const [clave, total] of porDoc) {
    if (clave.startsWith("f:")) {
      const f = filamentos.find(x => x._id === clave.slice(2));
      // Un rollo que ya no existe no traba: no hay nada que devolverle.
      if (!f) continue;
      const hay = Number(f.cantidadGramos) || 0;
      if (hay < total) {
        bloqueos.push(`${f.material} ${f.color} de ${f.owner || "sin owner"}: hay ${hay} g y habría que restar ${total} g.`);
      }
    } else if (clave.startsWith("i:")) {
      const [insumoId, tipoId] = clave.slice(2).split("|");
      const insumo = insumos.find(x => x._id === insumoId);
      if (!insumo) continue;
      const tipo = tiposDe(insumo).find(t => t.tipoId === tipoId);
      if (!tipo) continue;
      const hay = Number(tipo.cantidadDisponible) || 0;
      if (hay < total) {
        bloqueos.push(`${insumo.nombre} · ${tipo.nombre}: hay ${hay} u. y habría que restar ${total} u.`);
      }
    }
  }

  return { aRevertir, bloqueos };
}

/**
 * Revierte todos los ítems de un gasto, de a uno. No va en una sola
 * transacción a propósito: pueden tocar muchos documentos distintos y
 * Firestore limita cuántos entran. Si uno falla, los anteriores ya se
 * revirtieron y el gasto NO se borra, así que se puede reintentar.
 */
export async function revertirItemsDeGasto(gasto, { filamentos = [] } = {}) {
  let actual = gasto;
  for (const item of [...(gasto?.items || [])]) {
    if (!mueveStock(item)) continue;
    const { items } = await aplicarItem({
      gasto: actual, anterior: item, nuevo: null, filamentos,
    });
    actual = { ...actual, items };
  }
  return actual;
}
