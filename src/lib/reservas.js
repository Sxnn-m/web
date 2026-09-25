// ─── Reservas de stock por pedidos pendientes ────────────────────────
// Un pedido tomado y todavía no impreso ya comprometió su filamento: si no se
// cuenta, dos pedidos que usan el mismo rollo aparecen los dos "disponibles"
// aunque solo alcance para uno.
//
// NO hay colección "reservas". Una reserva no es un dato aparte: es la
// consecuencia de un pedido que existe y no se imprimió. Se deriva de los
// pedidos cada vez que hace falta. Por eso no hay nada que liberar: al
// imprimir, el pedido cambia de estado y deja de contar; al borrarlo,
// desaparece. Una colección aparte podría desincronizarse y dejar stock
// bloqueado por un pedido que ya no existe, sin forma obvia de notarlo.
//
// El owner y el material de cada línea se eligen AL CREAR el pedido y quedan
// en pedido.origen, así que la reserva apunta a un documento de filamento
// concreto: no hay que repartir nada entre owners ni suponer de cuál sale.

import { planDeConsumo, planDeInsumos } from './inventario.js';
import { resolverMateriales } from './consumoPedido.js';
import { tiposDe, claveTipo } from './tiposInsumo.js';

/** ¿Este pedido todavía tiene su filamento comprometido? */
export const estaPendiente = (pedido) =>
  pedido?.estadoImpresion !== "impreso";

/** El origen elegido para una línea del plan, si el pedido lo tiene. */
export const origenDeLinea = (pedido, clave) => pedido?.origen?.[clave] || null;

/**
 * Lo que los pedidos pendientes tienen comprometido, por documento.
 *
 * Sin desperdicio: se define al imprimir, y reservarlo antes sería bloquear
 * stock por una pérdida que todavía no ocurrió.
 *
 * Una línea sin origen elegido (un pedido anterior a esta función) no se puede
 * imputar a ningún rollo, así que no reserva nada. Es lo mismo que pasaba
 * antes de tener reservas: no empeora nada, y el pedido se sigue pudiendo
 * imprimir.
 *
 * @returns {{porFilamento: Object<string, number>, porInsumo: Object<string, number>}}
 */
export function reservasDePedidos(pedidos = [], productos = [], personalizados = []) {
  const porFilamento = {};
  const porInsumo = {};

  for (const pedido of pedidos) {
    if (!estaPendiente(pedido)) continue;

    const plan = planDeConsumo(pedido, productos, personalizados);
    // El material elegido manda: con [PLA, PETG] la reserva va sobre el que se
    // dijo al tomar el pedido, no sobre el primero de la receta.
    const elegidos = {};
    for (const linea of plan) {
      const origen = origenDeLinea(pedido, linea.clave);
      if (origen?.material) elegidos[linea.clave] = origen.material;
    }
    for (const linea of resolverMateriales(plan, elegidos)) {
      const origen = origenDeLinea(pedido, linea.clave);
      if (!origen?.filamentoId || linea.sinVariante) continue;
      porFilamento[origen.filamentoId] =
        (porFilamento[origen.filamentoId] || 0) + (Number(linea.cantidadConsumida) || 0);
    }

    for (const linea of planDeInsumos(pedido, productos, personalizados)) {
      if (!linea.insumoId || !linea.tipoId) continue;
      const clave = claveTipo(linea.insumoId, linea.tipoId);
      porInsumo[clave] = (porInsumo[clave] || 0) + (Number(linea.cantidad) || 0);
    }
  }

  return { porFilamento, porInsumo };
}

/**
 * El inventario tal como hay que mirarlo para decidir ALGO NUEVO: el stock
 * real menos lo que ya está comprometido.
 *
 * Devuelve la misma forma de siempre con la cantidad ajustada, así todo lo que
 * ya sabe evaluar disponibilidad —disponibilidadDeVariante, opcionesDeOwner,
 * calcularDisponibilidad— funciona sin cambiar una firma. Quien decide si mira
 * el stock real o el neto es el que llama.
 *
 * PUEDE QUEDAR NEGATIVO, y se deja así: si hay 500 g y 600 reservados, −100 es
 * la verdad y hay que resolverla (reasignando un pedido o reponiendo).
 * Recortarlo en 0 escondería la sobre-reserva.
 */
export function filamentosNetos(filamentos = [], reservas = {}) {
  const porFilamento = reservas?.porFilamento || reservas || {};
  return filamentos.map(f => {
    const reservado = Number(porFilamento[f._id]) || 0;
    return reservado === 0 ? f : {
      ...f,
      cantidadGramos: (Number(f.cantidadGramos) || 0) - reservado,
      // Se conserva el real para poder mostrar los dos números juntos.
      cantidadGramosReal: Number(f.cantidadGramos) || 0,
      reservado,
    };
  });
}

/** Lo mismo para el catálogo de insumos, donde el stock vive en cada tipo. */
export function insumosNetos(insumos = [], reservas = {}) {
  const porInsumo = reservas?.porInsumo || {};
  return insumos.map(insumo => {
    const tipos = tiposDe(insumo);
    let tocado = false;
    const nuevos = tipos.map(t => {
      const reservado = Number(porInsumo[claveTipo(insumo._id, t.tipoId)]) || 0;
      if (reservado === 0) return t;
      tocado = true;
      return {
        ...t,
        cantidadDisponible: (Number(t.cantidadDisponible) || 0) - reservado,
        cantidadDisponibleReal: Number(t.cantidadDisponible) || 0,
        reservado,
      };
    });
    return tocado ? { ...insumo, tipos: nuevos } : insumo;
  });
}

/** Cuánto queda de un rollo para comprometer en pedidos nuevos. */
export const disponibleParaNuevos = (filamento, reservas = {}) =>
  (Number(filamento?.cantidadGramos) || 0)
  - (Number((reservas?.porFilamento || {})[filamento?._id]) || 0);

/**
 * Las reservas de UN rollo, fila por fila, para la tabla "Reservado" del
 * detalle: qué pedido pendiente la tiene tomada y cuánto.
 *
 * @returns {Array<{clave, productoNombre, opcionesTexto, varianteNombre,
 *                  cantidadConsumida, numeroOrden, createdAt}>}
 */
export function reservasDeFilamento(filamentoId, pedidos = [], productos = [], personalizados = []) {
  const filas = [];
  for (const pedido of pedidos) {
    if (!estaPendiente(pedido)) continue;
    const plan = planDeConsumo(pedido, productos, personalizados);
    for (const linea of plan) {
      const origen = origenDeLinea(pedido, linea.clave);
      if (origen?.filamentoId !== filamentoId || linea.sinVariante) continue;
      filas.push({
        clave: `${pedido._id}|${linea.clave}`,
        productoNombre: linea.productoNombre,
        varianteNombre: linea.varianteNombre,
        opcionesTexto: linea.opcionesTexto,
        material: origen.material || linea.material,
        cantidadConsumida: Number(linea.cantidadConsumida) || 0,
        numeroOrden: pedido.numeroOrden,
        createdAt: pedido.createdAt,
      });
    }
  }
  return filas.sort((a, b) => (b.numeroOrden || 0) - (a.numeroOrden || 0));
}

/** Qué productos toca un pedido: para recalcular solo esos, no el catálogo entero. */
export const productosDePedido = (pedido) =>
  [...new Set((pedido?.items || []).map(i => i.productoId).filter(Boolean))];
