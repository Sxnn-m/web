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
import { tiposDe, claveTipo } from './tiposInsumo.js';
import { filamentosDeVariantes } from './variantes.js';
import { claveFilamento } from './disponibilidad.js';

/** ¿Este pedido todavía tiene su filamento comprometido? */
export const estaPendiente = (pedido) =>
  pedido?.estadoImpresion !== "impreso";

/** El origen elegido para una línea del plan, si el pedido lo tiene. */
export const origenDeLinea = (pedido, clave) => pedido?.origen?.[clave] || null;

/**
 * De qué rollos sale una línea, SIEMPRE como lista.
 *
 * Una línea sin dividir es el caso de una sola parte que se lleva todo el
 * consumo; una dividida trae sus reparticiones con los gramos de cada una.
 * Verlas igual es lo que deja que reservar, listar y sumar no tengan que
 * preguntar por el formato.
 */
export function partesDeOrigen(origen, cantidadConsumida = 0) {
  if (!origen) return [];
  if (Array.isArray(origen.reparticiones)) {
    return origen.reparticiones.filter(r => r?.filamentoId);
  }
  return origen.filamentoId ? [{ ...origen, gramos: cantidadConsumida }] : [];
}

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

    // No hace falta resolver el material de la línea: los gramos que se
    // reservan no dependen de con cuál se imprima, y el rollo viene nombrado
    // por su id. Con la línea dividida, cada parte tiene su rollo y su cifra.
    for (const linea of planDeConsumo(pedido, productos, personalizados)) {
      if (linea.sinVariante) continue;
      const partes = partesDeOrigen(origenDeLinea(pedido, linea.clave), linea.cantidadConsumida);
      for (const parte of partes) {
        porFilamento[parte.filamentoId] =
          (porFilamento[parte.filamentoId] || 0) + (Number(parte.gramos) || 0);
      }
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
    for (const linea of planDeConsumo(pedido, productos, personalizados)) {
      if (linea.sinVariante) continue;
      const partes = partesDeOrigen(origenDeLinea(pedido, linea.clave), linea.cantidadConsumida);
      // Una línea repartida entre dos rollos aporta una fila a cada historial,
      // con los gramos de SU parte: la suma de la columna tiene que dar lo
      // reservado sobre este rollo, no el consumo entero de la pieza.
      partes.forEach((parte, i) => {
        if (parte.filamentoId !== filamentoId) return;
        filas.push({
          clave: `${pedido._id}|${linea.clave}|${i}`,
          productoNombre: linea.productoNombre,
          varianteNombre: linea.varianteNombre,
          opcionesTexto: linea.opcionesTexto,
          material: parte.material || linea.material,
          // Con la línea dividida se dice cuál de las partes es, o "450 g" a
          // secas no explicaría por qué no es el consumo completo.
          reparticion: partes.length > 1 ? `${i + 1} de ${partes.length}` : "",
          cantidadConsumida: Number(parte.gramos) || 0,
          numeroOrden: pedido.numeroOrden,
          createdAt: pedido.createdAt,
        });
      });
    }
  }
  return filas.sort((a, b) => (b.numeroOrden || 0) - (a.numeroOrden || 0));
}

/** Los productos que el pedido nombra en sus líneas. */
export const productosDePedido = (pedido) =>
  [...new Set((pedido?.items || []).map(i => i.productoId).filter(Boolean))];

/**
 * Qué productos hay que recalcular cuando este pedido aparece o desaparece.
 *
 * NO alcanza con los del propio pedido. Reservar 560 g del PLA Marrón de
 * Maidi le cambia la disponibilidad a CUALQUIER producto que se imprima en
 * ese rollo, aunque no tenga nada que ver con este pedido: era el agujero de
 * recalcular solo `productosDePedido`.
 *
 * El criterio es material+color y no el documento puntual porque así se
 * evalúa la disponibilidad: cada owner por separado, y basta con que alguno
 * cumpla. Si baja el de Maidi, un producto que solo cumplía por Maidi cambia.
 *
 * Se incluyen los del pedido como piso, aunque su receta no toque ninguno de
 * esos rollos: nunca recalcula menos que antes.
 */
export function productosAfectados(pedido, productos = [], filamentos = []) {
  const claves = new Set();
  for (const o of Object.values(pedido?.origen || {})) {
    for (const parte of partesDeOrigen(o, 0)) {
      const f = filamentos.find(x => x._id === parte.filamentoId);
      if (f) claves.add(claveFilamento(f.material, f.color));
    }
  }

  const ids = new Set(productosDePedido(pedido));
  if (claves.size > 0) {
    for (const p of productos) {
      if (!p?._id || ids.has(p._id)) continue;
      // Todos los materiales que la receta acepta, no solo el que hoy se usa:
      // si la línea se puede imprimir en PLA o PETG Marrón, que baje
      // cualquiera de los dos le cambia la respuesta.
      const usa = filamentosDeVariantes(p.receta || [], p.variantes || [])
        .some(f => claves.has(claveFilamento(f.material, f.color)));
      if (usa) ids.add(p._id);
    }
  }
  return [...ids];
}
