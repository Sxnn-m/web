// ─── De qué rollo sale cada línea: la lógica compartida ──────────────
// La usan los DOS momentos en que hay que resolver material y owner:
//
//   1. al TOMAR el pedido, para saber qué reservar y de dónde (sin desperdicio,
//      y contra el stock ya neteado de las reservas de otros pedidos);
//   2. al marcarlo IMPRESO, para descontar de verdad (con desperdicio, y
//      contra el stock físico).
//
// Es un hook y no un componente a propósito: los dos modales muestran cosas
// distintas —uno pide desperdicio, el otro no— pero la lógica de qué se puede
// elegir y qué bloquea tiene que ser exactamente la misma, o el paso de crear
// aceptaría un pedido que después no se puede imprimir.

import { useMemo, useState } from 'react';
import {
  materialesDe, estadoDeMateriales, resolverMateriales,
} from '../lib/consumoPedido.js';
import { opcionesDeDescuento } from '../lib/opcionesFilamento.js';
import { agruparPorPieza } from '../lib/inventario.js';

/**
 * @param {Array}  plan          salida de planDeConsumo()
 * @param {Array}  filamentos    contra qué stock se evalúa. El paso de crear
 *   pasa el NETO (real − reservado); el de imprimir, el real.
 * @param {object} desperdicios  clave → gramos. Vacío al tomar el pedido.
 * @param {object} inicial       origen ya elegido, para precargar:
 *   { [clave]: {material, filamentoId, owner} }
 */
export function usarOrigen({ plan, filamentos, desperdicios = {}, inicial = {} }) {
  // Lo elegido a mano arranca de lo que ya venga guardado en el pedido: al
  // imprimir, el owner y el material salen precargados de cuando se tomó.
  const [elegido, setElegido] = useState(() => {
    const mapa = {};
    for (const [clave, o] of Object.entries(inicial || {})) {
      if (o?.filamentoId) mapa[clave] = o.filamentoId;
    }
    return mapa;
  });
  const [materialElegido, setMaterialElegido] = useState(() => {
    const mapa = {};
    for (const [clave, o] of Object.entries(inicial || {})) {
      if (o?.material) mapa[clave] = o.material;
    }
    return mapa;
  });

  // TODOS los materiales de la línea, con si alcanzan. Los que no llegan se
  // listan igual, deshabilitados y con el motivo: saber que falta PETG Verde
  // es justamente lo que hay que ver para reponerlo.
  const materialesPosibles = useMemo(() => {
    const mapa = {};
    for (const l of plan) {
      if (l.sinVariante) continue;
      if (materialesDe(l).length <= 1) continue;   // sin alternativas no hay nada que elegir
      mapa[l.clave] = estadoDeMateriales(l, filamentos, desperdicios);
    }
    return mapa;
  }, [plan, filamentos, desperdicios]);

  /** Los que se pueden elegir de verdad. */
  const queAlcanzan = (clave) =>
    (materialesPosibles[clave] || []).filter(m => m.alcanza).map(m => m.material);

  // El material efectivo de cada línea. Lo elegido a mano manda mientras siga
  // alcanzando; si dejó de alcanzar (subió el desperdicio, se gastó el rollo)
  // se cae al primero que sí, y si no queda ninguno al primero de la receta,
  // que es el que después va a reportar cuánto le falta.
  const planResuelto = useMemo(() => {
    const eleccion = {};
    for (const l of plan) {
      if (!materialesPosibles[l.clave]) continue;
      const alcanzan = queAlcanzan(l.clave);
      const aMano = materialElegido[l.clave];
      eleccion[l.clave] = alcanzan.includes(aMano) ? aMano : alcanzan[0];
    }
    return resolverMateriales(plan, eleccion);
  }, [plan, materialesPosibles, materialElegido]);

  // Líneas con alternativas donde NINGUNA alcanza.
  const sinMaterialConStock = planResuelto.filter(
    l => materialesPosibles[l.clave] && queAlcanzan(l.clave).length === 0);

  // Las filas se agrupan por pieza: una receta de dos materiales es UN bloque
  // con dos filas, no dos bloques que parecen dos productos distintos.
  const piezasDeMaterial = useMemo(() => agruparPorPieza(planResuelto), [planResuelto]);

  /** Lo que sale del rollo por esta línea. Sin desperdicio al tomar el pedido. */
  const totalPorLinea = (l) => l.cantidadConsumida + (Number(desperdicios[l.clave]) || 0);

  // Todos los owners del sistema evaluados contra lo que pide CADA línea.
  const candidatos = useMemo(() => {
    const mapa = {};
    for (const l of planResuelto) {
      if (l.sinVariante) continue;
      mapa[l.clave] = opcionesDeDescuento(
        filamentos, l.material, l.color,
        l.cantidadConsumida + (Number(desperdicios[l.clave]) || 0));
    }
    return mapa;
  }, [planResuelto, filamentos, desperdicios]);

  // De qué rollo sale cada línea. Lo elegido a mano manda SIEMPRE, incluso si
  // dejó de alcanzar: ahí el bloqueo dice exactamente cuánto le falta a ese
  // owner, que es más útil que deseleccionarlo en silencio.
  const asignaciones = useMemo(() => {
    const mapa = {};
    for (const l of planResuelto) {
      const opciones = candidatos[l.clave] || [];
      if (opciones.length === 0) continue;   // ni un rollo: "no está cargado"
      const elegida = opciones.find(o => o.id === elegido[l.clave] && o.tiene);
      const posibles = opciones.filter(o => o.alcanza);
      if (elegida) mapa[l.clave] = { id: elegida.id, owner: elegida.owner };
      else if (posibles.length === 1) mapa[l.clave] = { id: posibles[0].id, owner: posibles[0].owner };
      else if (posibles.length === 0) mapa[l.clave] = { pendiente: true, sinStock: true };
      else mapa[l.clave] = { pendiente: true };
    }
    return mapa;
  }, [planResuelto, candidatos, elegido]);

  const faltaElegir = planResuelto.filter(
    l => asignaciones[l.clave]?.pendiente && !asignaciones[l.clave].sinStock);
  const sinOwnerConStock = planResuelto.filter(l => asignaciones[l.clave]?.sinStock);

  /**
   * Lo que se guarda en el pedido: por línea, con qué material y de qué rollo.
   * Es lo que después permite reservar sobre un documento concreto y precargar
   * el modal de impresión.
   */
  const origen = useMemo(() => {
    const mapa = {};
    for (const l of planResuelto) {
      const a = asignaciones[l.clave];
      if (!a?.id) continue;
      mapa[l.clave] = { material: l.material, filamentoId: a.id, owner: a.owner || "" };
    }
    return mapa;
  }, [planResuelto, asignaciones]);

  return {
    planResuelto, piezasDeMaterial, totalPorLinea,
    materialesPosibles, queAlcanzan, candidatos, asignaciones,
    faltaElegir, sinOwnerConStock, sinMaterialConStock, origen,
    elegido, setElegido, materialElegido, setMaterialElegido,
  };
}
