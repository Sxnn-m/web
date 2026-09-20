// ─── Transferencia de filamento entre owners ─────────────────────────
// La parte pura: a quién le corresponde el stock que se mueve y si el
// movimiento es válido. La escritura transaccional vive en inventario.js.
//
// No mueve documentos ni cambia de dueño uno existente: descuenta del rollo de
// origen y suma al del destino. Son dos rollos físicos distintos, y un rollo
// que cambia de owner perdería su historial de gastos y restocks.

import { claveFilamento } from './disponibilidad.js';

/** La identidad de un rollo a los efectos de la transferencia. */
export const claveDeRollo = (f) =>
  `${claveFilamento(f?.material, f?.color)}|${String(f?.marca || "").trim().toLowerCase()}`;

/**
 * El rollo del owner destino que tiene EXACTAMENTE el mismo material, color y
 * marca que el de origen. null si no existe: ahí hay que crearlo.
 *
 * La marca entra en la comparación a propósito. Dos rollos del mismo material
 * y color pero de marcas distintas no son intercambiables —cambian el precio y
 * hasta el resultado de impresión— así que sumarlos en un solo documento
 * perdería esa diferencia.
 */
export function buscarDestino(filamentos = [], origen, ownerDestino) {
  if (!origen) return null;
  const clave = claveDeRollo(origen);
  const owner = String(ownerDestino || "").trim().toLowerCase();
  return filamentos.find(f =>
    f._id !== origen._id &&
    claveDeRollo(f) === clave &&
    String(f.owner || "").trim().toLowerCase() === owner
  ) || null;
}

/**
 * ¿Se puede hacer esta transferencia?
 *
 * @returns {{ok: boolean, error?: string, cantidad?: number}}
 */
export function validarTransferencia({ origen, ownerDestino, cantidad }) {
  if (!origen) return { ok: false, error: "No se encontró el filamento de origen." };

  const destino = String(ownerDestino || "").trim();
  if (!destino) return { ok: false, error: "Elegí a qué owner se transfiere." };

  const owner = String(origen.owner || "").trim();
  if (destino.toLowerCase() === owner.toLowerCase()) {
    return { ok: false, error: "El owner destino es el mismo que el de origen." };
  }

  const n = Number(cantidad);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "La cantidad a transferir debe ser mayor a 0." };
  }

  const disponible = Number(origen.cantidadGramos) || 0;
  if (n > disponible) {
    return {
      ok: false,
      error: `No alcanza: ${owner || "el origen"} tiene ${disponible} g y se quieren transferir ${n} g.`,
    };
  }

  return { ok: true, cantidad: n };
}

/**
 * Las notas que quedan en el historial de cada lado.
 *
 * Dicen "Movimiento" y no "Restock" a propósito: en el historial tiene que
 * verse de un vistazo que el filamento cambió de manos y no que entró material
 * nuevo al taller ni que se gastó imprimiendo.
 */
export const notaDeSalida = (ownerDestino) =>
  `Movimiento: transferido a ${String(ownerDestino || "").trim() || "(sin owner)"}`;
export const notaDeEntrada = (ownerOrigen) =>
  `Movimiento: recibido de ${String(ownerOrigen || "").trim() || "(sin owner)"}`;
