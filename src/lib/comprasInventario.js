// ─── Comprar es mover inventario ─────────────────────────────────────
// Guardar un ítem de filamento o de insumo en un gasto suma stock y deja un
// restock en el historial. Lo difícil no es sumar: es que editar y borrar no
// sumen dos veces ni dejen restocks huérfanos.
//
// Por eso hay UNA sola función, aplicarItem(), que siempre hace lo mismo:
// revierte el ítem anterior y aplica el nuevo. Crear es anterior=null, borrar
// es nuevo=null, editar son los dos. "No sumar dos veces" deja de ser un caso
// que haya que acordarse de programar y pasa a ser la única forma que tiene.
//
// Cuando los dos caen en el MISMO documento —editar solo los gramos— los
// deltas se netean antes de escribir: dos tx.update al mismo doc se pisan y
// el segundo se llevaría puesto al primero.

import {
  collection, doc, runTransaction, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { buscarRollo } from './transferencias.js';
import { tiposDe, sumarStockDeTipo } from './tiposInsumo.js';
import { mueveStock, mismoDestino } from './gastoItems.js';

const COL_FILAMENTOS = "filamentos";
const COL_INSUMOS = "insumos";
const COL_GASTOS = "gastos";

/** La nota que queda en el historial. Dice de qué compra vino. */
export const notaDeCompra = (numeroGasto) =>
  `Compra ${String(numeroGasto || "").trim() || "(gasto sin número)"}`;

/** Cuántas unidades mueve un ítem: gramos en filamento, unidades en insumo. */
const cantidadDe = (item) => Number(item?.cantidad) || 0;

class StockInsuficienteError extends Error {
  constructor(mensaje) { super(mensaje); this.name = "StockInsuficienteError"; }
}

/**
 * Aplica un cambio de ítem y mueve el inventario que corresponda, todo en una
 * transacción con el documento del gasto.
 *
 * @param {object} gasto        el gasto, con sus items actuales
 * @param {object|null} anterior el ítem como estaba guardado (null si es alta)
 * @param {object|null} nuevo    el ítem como queda (null si es baja)
 * @param {Array} filamentos    catálogo en pantalla, solo para resolver ids:
 *   las cantidades siempre salen de la lectura transaccional
 * @returns {Promise<{items: Array, creoFilamento: boolean}>}
 */
export async function aplicarItem({ gasto, anterior = null, nuevo = null, filamentos = [] }) {
  const mueveAlgo = mueveStock(anterior) || mueveStock(nuevo);

  // Un rollo nuevo se resuelve ANTES de abrir la transacción: adentro no se
  // puede consultar la colección, solo leer documentos por id.
  let refFilamentoNuevo = null;
  let creaFilamento = false;
  if (mueveStock(nuevo) && nuevo.categoria === "filamento") {
    const existente = nuevo.filamentoId
      ? filamentos.find(f => f._id === nuevo.filamentoId)
      : buscarRollo(filamentos, nuevo);
    if (existente) {
      refFilamentoNuevo = doc(db, COL_FILAMENTOS, existente._id);
    } else {
      refFilamentoNuevo = doc(collection(db, COL_FILAMENTOS));
      creaFilamento = true;
    }
  }

  const resultado = await runTransaction(db, async (tx) => {
    const refGasto = doc(db, COL_GASTOS, gasto._id);

    // ── 1. Lecturas: todas antes de cualquier escritura ──
    const snapGasto = await tx.get(refGasto);
    if (!snapGasto.exists()) throw new Error("El gasto ya no existe.");

    // Un mapa ref → {snap, delta} para poder netear antes de escribir.
    const tocados = new Map();
    const registrar = async (ref, delta, meta) => {
      const clave = ref.path;
      if (tocados.has(clave)) {
        tocados.get(clave).delta += delta;
        return tocados.get(clave);
      }
      const snap = await tx.get(ref);
      const entrada = { ref, snap, delta, ...meta };
      tocados.set(clave, entrada);
      return entrada;
    };

    // Lo que hay que devolver del ítem anterior.
    let refAnterior = null;
    if (mueveStock(anterior)) {
      if (anterior.categoria === "filamento" && anterior.filamentoId) {
        refAnterior = doc(db, COL_FILAMENTOS, anterior.filamentoId);
        await registrar(refAnterior, -cantidadDe(anterior), { tipo: "filamento" });
      } else if (anterior.categoria === "insumo" && anterior.insumoId) {
        refAnterior = doc(db, COL_INSUMOS, anterior.insumoId);
        await registrar(refAnterior, -cantidadDe(anterior), { tipo: "insumo", tipoId: anterior.tipoId });
      }
    }

    // Lo que hay que sumar del nuevo.
    let refNuevo = null;
    if (mueveStock(nuevo)) {
      if (nuevo.categoria === "filamento") {
        refNuevo = refFilamentoNuevo;
        if (!creaFilamento) await registrar(refNuevo, cantidadDe(nuevo), { tipo: "filamento" });
        else tocados.set(refNuevo.path, { ref: refNuevo, snap: null, delta: cantidadDe(nuevo), tipo: "filamento", crear: true });
      } else {
        refNuevo = doc(db, COL_INSUMOS, nuevo.insumoId);
        await registrar(refNuevo, cantidadDe(nuevo), { tipo: "insumo", tipoId: nuevo.tipoId });
      }
    }

    // ── 2. Validación contra lo recién leído ──
    for (const e of tocados.values()) {
      if (e.crear) continue;
      // El documento ya no existe: se borró a mano desde Inventario o Insumos.
      // No se traba —el ítem tiene que poder sacarse igual— pero tampoco se
      // escribe en un documento fantasma.
      if (!e.snap.exists()) { e.ausente = true; continue; }
      if (e.delta >= 0) continue;

      const hay = e.tipo === "filamento"
        ? Number(e.snap.data().cantidadGramos) || 0
        : Number((tiposDe({ _id: e.ref.id, ...e.snap.data() })
            .find(t => t.tipoId === e.tipoId) || {}).cantidadDisponible) || 0;
      if (hay + e.delta < 0) {
        const unidad = e.tipo === "filamento" ? "g" : "u.";
        throw new StockInsuficienteError(
          `No se puede revertir: hay ${hay} ${unidad} y habría que restar ${-e.delta} ${unidad}. ` +
          `Ya se consumió o se reservó parte. Ajustalo a mano desde ` +
          `${e.tipo === "filamento" ? "Inventario" : "Insumos"} y volvé a intentar.`
        );
      }
    }

    // ── 3. Escrituras ──
    for (const e of tocados.values()) {
      if (e.ausente) continue;
      if (e.crear) {
        tx.set(e.ref, {
          material: String(nuevo.material || "").trim(),
          color: String(nuevo.color || "").trim(),
          marca: String(nuevo.marca || "").trim(),
          owner: String(nuevo.owner || "").trim(),
          cantidadGramos: e.delta,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        continue;
      }
      // Delta neto 0 —se editó el precio y no la cantidad— no escribe nada.
      if (e.delta === 0) continue;
      if (e.tipo === "filamento") {
        tx.update(e.ref, {
          cantidadGramos: (Number(e.snap.data().cantidadGramos) || 0) + e.delta,
          updatedAt: serverTimestamp(),
        });
      } else {
        const actuales = tiposDe({ _id: e.ref.id, ...e.snap.data() });
        tx.update(e.ref, {
          tipos: sumarStockDeTipo(actuales, e.tipoId, e.delta),
          // Por si el insumo todavía estaba plano: el stock pasa a vivir en el
          // tipo y los campos de la raíz no pueden quedar como segunda verdad.
          precioUnidad: deleteField(),
          cantidadDisponible: deleteField(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // El restock. Si el destino no cambió se ACTUALIZA el que ya existe en vez
    // de crear otro: editar los gramos de una compra no es una compra nueva.
    const rutaRestock = (item, refDoc) => item.categoria === "filamento"
      ? [COL_FILAMENTOS, refDoc.id, "restocks"]
      : [COL_INSUMOS, refDoc.id, "tipos", item.tipoId, "restocks"];

    let restockId = null;
    const reutiliza = anterior && nuevo && mismoDestino(anterior, nuevo) && anterior.restockId;

    if (mueveStock(anterior) && refAnterior && anterior.restockId && !reutiliza) {
      tx.delete(doc(db, ...rutaRestock(anterior, refAnterior), anterior.restockId));
    }
    if (mueveStock(nuevo) && refNuevo) {
      const ref = reutiliza
        ? doc(db, ...rutaRestock(nuevo, refNuevo), anterior.restockId)
        : doc(collection(db, ...rutaRestock(nuevo, refNuevo)));
      tx.set(ref, {
        cantidadAgregada: cantidadDe(nuevo),
        nota: notaDeCompra(gasto.numeroGasto),
        fecha: serverTimestamp(),
      });
      restockId = ref.id;
    }

    // ── 4. El array de ítems del gasto ──
    const actuales = Array.isArray(snapGasto.data().items) ? snapGasto.data().items : [];
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
    tx.update(refGasto, { items });

    return { items, creoFilamento: creaFilamento, movioStock: mueveAlgo };
  });

  return resultado;
}

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
    const clave = item.categoria === "filamento"
      ? `f:${item.filamentoId}`
      : `i:${item.insumoId}|${item.tipoId}`;
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
    } else {
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
