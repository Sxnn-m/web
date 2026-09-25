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
//
// El reparto entre owners vive acá y no en cada modal por ese mismo motivo:
// si dividir funcionara distinto al reservar que al imprimir, la reserva
// podría quedar en una forma que la impresión no sabe reproducir.

import { useMemo, useState } from 'react';
import {
  materialesDe, estadoDeMateriales, resolverMateriales,
} from '../lib/consumoPedido.js';
import { opcionesDeDescuento } from '../lib/opcionesFilamento.js';
import { agruparPorPieza } from '../lib/inventario.js';
import {
  expandirReparticiones, reparticionesPorDefecto, descuadres,
  plegarOrigen, desplegarOrigen,
} from '../lib/reparticiones.js';

/**
 * @param {Array}  plan          salida de planDeConsumo()
 * @param {Array}  filamentos    contra qué stock se evalúa. El paso de crear
 *   pasa el NETO (real − reservado); el de imprimir, el real.
 * @param {object} desperdicios  clave → gramos. Vacío al tomar el pedido.
 * @param {object} inicial       el `origen` guardado en el pedido, tal cual:
 *   por línea, un rollo único o un reparto entre varios. Es lo que precarga el
 *   modal de impresión con exactamente lo que se reservó.
 */
export function usarOrigen({ plan, filamentos, desperdicios = {}, inicial = {} }) {
  // Lo guardado se despliega una sola vez, al abrir: las reparticiones pasan a
  // ser estado editable y cada parte recupera su owner y su material.
  const [guardado] = useState(() => desplegarOrigen(inicial));

  // ── Reparto entre owners ──────────────────────────────────────────────
  // clave de la línea → partes. Ausente = la línea va entera a un rollo.
  const [reparticiones, setReparticiones] = useState(guardado.reparticiones);

  const dividir = (linea) => setReparticiones(r =>
    ({ ...r, [linea.clave]: reparticionesPorDefecto(linea) }));
  const unificar = (clave) => setReparticiones(r => {
    const copia = { ...r }; delete copia[clave]; return copia;
  });
  const cambiarParte = (clave, i, gramos) => setReparticiones(r => ({
    ...r, [clave]: r[clave].map((p, j) => j === i ? { ...p, gramos } : p),
  }));
  const agregarParte = (clave) => setReparticiones(r =>
    ({ ...r, [clave]: [...(r[clave] || []), { gramos: 0 }] }));
  // Quitar hasta quedarse con una sola parte es no estar dividido: se unifica
  // en vez de dejar una "repartición" que es toda la línea.
  const quitarParte = (clave, i) => setReparticiones(r => {
    const quedan = (r[clave] || []).filter((_, j) => j !== i);
    if (quedan.length < 2) { const copia = { ...r }; delete copia[clave]; return copia; }
    return { ...r, [clave]: quedan };
  });

  const malRepartidas = useMemo(
    () => descuadres(plan, reparticiones), [plan, reparticiones]);

  // El plan con las líneas divididas abiertas en una línea por parte. Todo lo
  // que sigue trabaja sobre ESTE plan sin enterarse de que hubo división: una
  // repartición es una línea más, que es el caso que ya sabía resolver.
  const planExpandido = useMemo(
    () => expandirReparticiones(plan, reparticiones), [plan, reparticiones]);

  // ── Material y owner de cada (sub)línea ───────────────────────────────
  const [elegido, setElegido] = useState(() => {
    const mapa = {};
    for (const [clave, o] of Object.entries(guardado.plano)) {
      if (o?.filamentoId) mapa[clave] = o.filamentoId;
    }
    return mapa;
  });
  const [materialElegido, setMaterialElegido] = useState(() => {
    const mapa = {};
    for (const [clave, o] of Object.entries(guardado.plano)) {
      if (o?.material) mapa[clave] = o.material;
    }
    return mapa;
  });

  // TODOS los materiales de la línea, con si alcanzan. Los que no llegan se
  // listan igual, deshabilitados y con el motivo: saber que falta PETG Verde
  // es justamente lo que hay que ver para reponerlo.
  const materialesPosibles = useMemo(() => {
    const mapa = {};
    for (const l of planExpandido) {
      if (l.sinVariante) continue;
      if (materialesDe(l).length <= 1) continue;   // sin alternativas no hay nada que elegir
      mapa[l.clave] = estadoDeMateriales(l, filamentos, desperdicios);
    }
    return mapa;
  }, [planExpandido, filamentos, desperdicios]);

  /** Los que se pueden elegir de verdad. */
  const queAlcanzan = (clave) =>
    (materialesPosibles[clave] || []).filter(m => m.alcanza).map(m => m.material);

  // El material efectivo de cada línea. Lo elegido a mano manda mientras siga
  // alcanzando; si dejó de alcanzar (subió el desperdicio, se gastó el rollo)
  // se cae al primero que sí, y si no queda ninguno al primero de la receta,
  // que es el que después va a reportar cuánto le falta.
  const planResuelto = useMemo(() => {
    const eleccion = {};
    for (const l of planExpandido) {
      if (!materialesPosibles[l.clave]) continue;
      const alcanzan = queAlcanzan(l.clave);
      const aMano = materialElegido[l.clave];
      eleccion[l.clave] = alcanzan.includes(aMano) ? aMano : alcanzan[0];
    }
    return resolverMateriales(planExpandido, eleccion);
  }, [planExpandido, materialesPosibles, materialElegido]);

  // Líneas con alternativas donde NINGUNA alcanza.
  const sinMaterialConStock = planResuelto.filter(
    l => materialesPosibles[l.clave] && queAlcanzan(l.clave).length === 0);

  // Las piezas se arman con el plan CRUDO: una línea dividida sigue siendo una
  // sola línea de la receta, y sus partes van anidadas adentro, no como dos
  // filas sueltas que parecerían dos materiales distintos.
  const piezasDeMaterial = useMemo(() => agruparPorPieza(plan), [plan]);

  /** Las (sub)líneas resueltas de una línea cruda. Sin dividir, es ella misma. */
  const partesDe = (clave) =>
    planResuelto.filter(l => (l.reparticionDe || l.clave) === clave);

  /** Lo que sale del rollo por esta parte. Sin desperdicio al tomar el pedido. */
  const totalPorLinea = (l) => l.cantidadConsumida + (Number(desperdicios[l.clave]) || 0);

  // Todos los owners del sistema evaluados contra lo que pide CADA parte.
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

  // De qué rollo sale cada parte. Lo elegido a mano manda SIEMPRE, incluso si
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

  /** Por sub-clave: es lo que miran los selectores y los chequeos por parte. */
  const origenPlano = useMemo(() => {
    const mapa = {};
    for (const l of planResuelto) {
      const a = asignaciones[l.clave];
      if (!a?.id) continue;
      mapa[l.clave] = { material: l.material, filamentoId: a.id, owner: a.owner || "" };
    }
    return mapa;
  }, [planResuelto, asignaciones]);

  /**
   * Lo que se guarda en el pedido: por LÍNEA, con el rollo único o el reparto.
   * Es lo que después permite reservar sobre documentos concretos y volver a
   * precargar este mismo modal con lo que se había elegido.
   */
  const origen = useMemo(
    () => plegarOrigen(planResuelto, origenPlano), [planResuelto, origenPlano]);

  return {
    plan, planResuelto, piezasDeMaterial, partesDe, totalPorLinea,
    materialesPosibles, queAlcanzan, candidatos, asignaciones,
    faltaElegir, sinOwnerConStock, sinMaterialConStock,
    origen, origenPlano,
    elegido, setElegido, materialElegido, setMaterialElegido,
    reparticiones, malRepartidas,
    dividir, unificar, cambiarParte, agregarParte, quitarParte,
  };
}
