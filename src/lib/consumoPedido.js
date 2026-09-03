// ─── Consumo de un pedido y validación de stock ──────────────────────
// Funciones puras. Las usan DOS lugares y tiene que ser exactamente la
// misma lógica en ambos, o el botón diría una cosa y la escritura otra:
//   1. el modal de impresión, para habilitar/bloquear el botón en vivo;
//   2. la transacción de marcarPedidoImpreso(), como validación final
//      contra las cantidades leídas dentro de la propia transacción.

import { claveFilamento } from './disponibilidad.js';

/**
 * Agrupa el consumo total del pedido.
 *
 * Un pedido puede tener dos productos que usan el mismo filamento o el mismo
 * insumo: hay que validar el TOTAL combinado, no línea por línea, o cada una
 * pasaría el chequeo por separado y entre las dos vaciarían el stock.
 *
 * @param {Array}  plan         salida de planDeConsumo()
 * @param {object} desperdicios mapa clave-del-plan → gramos desperdiciados
 * @param {Array}  planInsumos  salida de planDeInsumos()
 * @returns {{filamentos: Array, insumos: Array}} totales por recurso
 */
export function agruparConsumo(plan = [], desperdicios = {}, planInsumos = []) {
  const filamentos = new Map();
  for (const linea of plan) {
    const clave = claveFilamento(linea.material, linea.color);
    const desperdiciada = Number(desperdicios[linea.clave]) || 0;
    const total = (Number(linea.cantidadConsumida) || 0) + desperdiciada;
    const previo = filamentos.get(clave);
    if (previo) {
      previo.total += total;
      previo.consumida += Number(linea.cantidadConsumida) || 0;
      previo.desperdiciada += desperdiciada;
    } else {
      filamentos.set(clave, {
        clave,
        material: linea.material,
        color: linea.color,
        etiqueta: `${linea.material} ${linea.color}`.trim(),
        total,
        consumida: Number(linea.cantidadConsumida) || 0,
        desperdiciada,
        unidad: "g",
      });
    }
  }

  const insumos = new Map();
  for (const linea of planInsumos) {
    const previo = insumos.get(linea.insumoId);
    const total = Number(linea.unidadesConsumidas) || 0;
    if (previo) previo.total += total;
    else insumos.set(linea.insumoId, {
      insumoId: linea.insumoId,
      etiqueta: linea.nombre,
      total,
      unidad: "u.",
    });
  }

  return { filamentos: [...filamentos.values()], insumos: [...insumos.values()] };
}

/**
 * Compara el consumo agrupado contra el stock REAL disponible.
 *
 * Ojo: acá NO se aplica el criterio 2x del badge de disponibilidad del
 * catálogo. Ese sirve para decidir si conviene ofrecer el producto; acá
 * estamos descontando de verdad, así que alcanza con que haya lo que se
 * consume.
 *
 * Un recurso que no existe en inventario cuenta como 0 disponible, no como
 * un error aparte: aparece en la misma lista de faltantes.
 *
 * @param {object} consumo      salida de agruparConsumo()
 * @param {Function} stockFilamento (item) => {id, disponible} | null
 * @param {Function} stockInsumo    (item) => {id, disponible} | null
 * @returns {{ok: boolean, faltantes: Array, filamentos: Array, insumos: Array}}
 */
export function validarStock(consumo, stockFilamento, stockInsumo) {
  const faltantes = [];

  const filamentos = consumo.filamentos.map(f => {
    const encontrado = stockFilamento(f) || null;
    const disponible = encontrado ? Number(encontrado.disponible) || 0 : 0;
    const item = {
      ...f,
      id: encontrado?.id || null,
      existe: Boolean(encontrado),
      disponible,
      alcanza: Boolean(encontrado) && disponible >= f.total,
    };
    if (!item.alcanza) faltantes.push(item);
    return item;
  });

  const insumos = consumo.insumos.map(i => {
    const encontrado = stockInsumo(i) || null;
    const disponible = encontrado ? Number(encontrado.disponible) || 0 : 0;
    const item = {
      ...i,
      id: encontrado?.id || i.insumoId,
      existe: Boolean(encontrado),
      disponible,
      alcanza: Boolean(encontrado) && disponible >= i.total,
    };
    if (!item.alcanza) faltantes.push(item);
    return item;
  });

  return { ok: faltantes.length === 0, faltantes, filamentos, insumos };
}

/**
 * "PLA Negro (necesitás 145g, hay 90g disponibles)"
 * "Imán neodimio 10mm (necesitás 8 unidades, hay 3 disponibles)"
 */
export function textoFaltante(item) {
  const necesita = item.unidad === "g"
    ? `${item.total}g`
    : `${item.total} ${item.total === 1 ? "unidad" : "unidades"}`;
  const hay = item.unidad === "g" ? `${item.disponible}g` : `${item.disponible}`;
  return `${item.etiqueta} (necesitás ${necesita}, hay ${hay} disponibles)`;
}

/** Mensaje único con TODOS los faltantes, no de a uno. */
export function mensajeFaltantes(faltantes = []) {
  if (faltantes.length === 0) return "";
  const partes = faltantes.map(textoFaltante);
  const lista = partes.length === 1
    ? partes[0]
    : partes.slice(0, -1).join(", ") + " y de " + partes[partes.length - 1];
  return `No se puede marcar como impreso: falta stock de ${lista}.`;
}

/** Error que corta la transacción cuando el stock no alcanza. */
export class StockInsuficienteError extends Error {
  constructor(faltantes) {
    super(mensajeFaltantes(faltantes));
    this.name = "StockInsuficienteError";
    this.faltantes = faltantes;
  }
}
