// ─── Ítems de un gasto ───────────────────────────────────────────────
// Un gasto deja de ser un monto suelto y pasa a ser lo que se compró. Tres
// categorías, porque son tres cosas distintas:
//
//   - filamento e insumo MUEVEN INVENTARIO: guardarlos suma stock y deja un
//     restock en el historial del rollo o del tipo;
//   - envío no toca nada, solo suma al total.
//
// Acá vive la parte pura: qué campos pide cada categoría, si el ítem está
// completo, cuánto suma y dónde se está usando un insumo. La escritura
// transaccional está en comprasInventario.js.

import { claveDeRollo } from './transferencias.js';
import { normalizarUrl } from './url.js';

export const CATEGORIAS = [
  { id: "filamento", nombre: "Filamento" },
  { id: "insumo", nombre: "Insumo" },
  { id: "envio", nombre: "Envío" },
];

/** ¿Guardar este ítem mueve stock? Envío no. */
export const mueveStock = (item) =>
  item?.categoria === "filamento" || item?.categoria === "insumo";

/**
 * ¿Esta categoría guarda el link de dónde se compró?
 *
 * Envío no: el costo de envío no se compra en ningún lado, es lo que cuesta
 * que llegue lo que sí se compró. Un campo que nunca se llena es peor que no
 * tenerlo.
 */
export const aceptaLink = (categoria) =>
  categoria === "filamento" || categoria === "insumo";

/** Id propio de cada ítem: sin él, editar el 3º no se distingue de editar otro. */
export const nuevoItemId = () =>
  `it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Un ítem recién agregado, en borrador. */
export function itemVacio(categoria = "filamento") {
  const base = { itemId: nuevoItemId(), categoria, ...(aceptaLink(categoria) ? { link: "" } : {}) };
  if (categoria === "filamento") {
    return { ...base, material: "", color: "", marca: "", owner: "", cantidad: "", precioTotal: "" };
  }
  if (categoria === "insumo") {
    return { ...base, insumoId: "", insumoNombre: "", tipoId: "", tipoNombre: "", marca: "", precioUnitario: "", cantidad: "" };
  }
  return { ...base, precioTotal: "" };
}

/**
 * Cambiar de categoría rehace el borrador: los campos son otros.
 *
 * El link sobrevive entre filamento e insumo porque en los dos significa lo
 * mismo —dónde se compró— y volver a pegarlo sería un castigo por haberse
 * equivocado de categoría. Hacia envío se descarta: ahí no existe.
 */
export const cambiarCategoria = (item, categoria) => ({
  ...itemVacio(categoria),
  itemId: item?.itemId || nuevoItemId(),
  ...(aceptaLink(categoria) && aceptaLink(item?.categoria) && item?.link
    ? { link: item.link }
    : {}),
});

/** ¿Pasar a esta categoría se lleva puesto un link ya cargado? */
export const pierdeLink = (item, categoria) =>
  Boolean(item?.link) && aceptaLink(item?.categoria) && !aceptaLink(categoria);

const num = (v) => {
  const t = String(v ?? "").trim();
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Lo que cuesta este ítem. En insumos sale de precio unitario × cantidad. */
export function totalDeItem(item) {
  if (item?.categoria === "insumo") {
    const p = num(item.precioUnitario), c = num(item.cantidad);
    return (Number.isNaN(p) || Number.isNaN(c)) ? 0 : p * c;
  }
  const t = num(item?.precioTotal);
  return Number.isNaN(t) ? 0 : t;
}

export const totalDeItems = (items = []) =>
  items.reduce((acc, i) => acc + totalDeItem(i), 0);

export const tieneItems = (gasto) =>
  Array.isArray(gasto?.items) && gasto.items.length > 0;

/**
 * ¿El monto de este gasto lo escribió una persona, o sale de los ítems?
 *
 * El campo manda cuando está. Cuando no está —los gastos cargados antes de
 * que existiera el interruptor— se deduce: sin ítems, el número lo escribió
 * alguien; con ítems, valía su suma. Deducirlo en vez de asumir un default
 * evita que un gasto viejo cambie de monto solo por haber agregado el campo.
 *
 * Que un gasto viejo no se vuelva automático al recibir su primer ítem no
 * depende de esta función: al guardarlo, la transacción le sella el campo.
 */
export function esMontoManual(gasto) {
  if (typeof gasto?.montoManual === "boolean") return gasto.montoManual;
  return !tieneItems(gasto);
}

/**
 * El monto que vale un gasto: el que usan el saldo y los totales.
 *
 * En automático lo manda la suma de los ítems y el campo guardado se ignora,
 * aunque la escritura lo mantenga al día: si alguna vez quedaran peleados,
 * gana lo que el usuario ve en la lista de ítems.
 */
export function montoDeGasto(gasto) {
  if (esMontoManual(gasto)) return Number(gasto?.monto) || 0;
  return totalDeItems(Array.isArray(gasto?.items) ? gasto.items : []);
}

/**
 * Qué le falta a un ítem para poder guardarse.
 *
 * La marca puede quedar vacía en los dos casos, igual que en Inventario: hay
 * rollos sin marca anotada y obligar a inventarla sería peor que no tenerla.
 *
 * @returns {{valido: boolean, errores: object}}
 */
export function validarItem(item, { insumos = [] } = {}) {
  const errores = {};
  const exigeNumero = (campo, etiqueta) => {
    const n = num(item?.[campo]);
    if (Number.isNaN(n) || n <= 0) errores[campo] = `${etiqueta} tiene que ser mayor a 0.`;
  };

  if (item?.categoria === "filamento") {
    if (!String(item.material || "").trim()) errores.material = "Elegí el material.";
    if (!String(item.color || "").trim()) errores.color = "Elegí el color.";
    if (!String(item.owner || "").trim()) errores.owner = "Elegí el owner.";
    exigeNumero("cantidad", "La cantidad en gramos");
    exigeNumero("precioTotal", "El precio total");
  } else if (item?.categoria === "insumo") {
    if (!String(item.insumoId || "").trim()) errores.insumoId = "Elegí el insumo.";
    // El tipo solo se pide cuando el insumo tiene más de uno: con uno solo no
    // hay nada que elegir y pedirlo sería un clic sin decisión.
    const insumo = insumos.find(i => i._id === item.insumoId);
    const tipos = insumo?.tipos || [];
    if (tipos.length > 1 && !String(item.tipoId || "").trim()) {
      errores.tipoId = "Elegí el tipo.";
    }
    exigeNumero("precioUnitario", "El precio unitario");
    exigeNumero("cantidad", "La cantidad");
  } else {
    exigeNumero("precioTotal", "El precio");
  }

  // El link es opcional, pero si está escrito tiene que poder abrirse: un
  // href roto se descubre recién al hacer clic, cuando ya no está el contexto
  // de qué se quiso pegar.
  if (aceptaLink(item?.categoria)) {
    const { valida, error } = normalizarUrl(item?.link);
    if (!valida) errores.link = error;
  }

  return { valido: Object.keys(errores).length === 0, errores };
}

/** El ítem listo para guardar: números como números y textos recortados. */
export function normalizarItem(item, { insumos = [] } = {}) {
  const base = { itemId: item.itemId || nuevoItemId(), categoria: item.categoria };
  const txt = (v) => String(v ?? "").trim();

  if (item.categoria === "filamento") {
    return {
      ...base,
      material: txt(item.material), color: txt(item.color),
      marca: txt(item.marca), owner: txt(item.owner),
      cantidad: num(item.cantidad) || 0,
      precioTotal: num(item.precioTotal) || 0,
      // Dónde terminó el stock. Sin esto, editar o borrar el ítem no sabría
      // qué revertir y habría que adivinarlo por material+color+marca+owner,
      // que son justo los campos que la edición puede cambiar.
      filamentoId: item.filamentoId || null,
      restockId: item.restockId || null,
      // Ya normalizado: lo que se guarda es lo que se va a poner en el href.
      link: normalizarUrl(item.link).url,
    };
  }
  if (item.categoria === "insumo") {
    const insumo = insumos.find(i => i._id === item.insumoId);
    const tipos = insumo?.tipos || [];
    return {
      ...base,
      insumoId: txt(item.insumoId),
      insumoNombre: txt(item.insumoNombre) || txt(insumo?.nombre),
      // Con un solo tipo se resuelve solo: el selector ni se mostró.
      tipoId: tipos.length > 1 ? txt(item.tipoId) : (tipos[0]?.tipoId || txt(item.tipoId)),
      // El nombre del tipo se guarda solo cuando hubo algo que elegir: con un
      // tipo único ponerlo en la línea es ruido. Va junto al id, como el
      // nombre del insumo, para que el ítem se siga leyendo si el catálogo
      // cambia después.
      tipoNombre: tipos.length > 1
        ? (tipos.find(t => t.tipoId === txt(item.tipoId))?.nombre || txt(item.tipoNombre))
        : "",
      marca: txt(item.marca),
      precioUnitario: num(item.precioUnitario) || 0,
      cantidad: num(item.cantidad) || 0,
      restockId: item.restockId || null,
      link: normalizarUrl(item.link).url,
    };
  }
  // Envío no lleva link: no se escribe el campo, ni siquiera vacío.
  return { ...base, precioTotal: num(item.precioTotal) || 0 };
}

/**
 * Qué documento de inventario toca este ítem, como clave agrupable.
 *
 * Es lo que permite que dos ítems del mismo rollo se sumen sobre un solo
 * documento en vez de pisarse, y que un rollo que todavía no existe se cree
 * UNA vez para los dos. Un ítem que no mueve stock no tiene destino.
 *
 * Para el filamento la clave son sus características, no su id: en un gasto
 * recién cargado todavía no hay id, y dos ítems iguales tienen que caer en el
 * mismo grupo igual.
 */
export function claveDeDestino(item) {
  if (!mueveStock(item)) return null;
  if (item.categoria === "filamento") {
    if (item.filamentoId) return `f:${item.filamentoId}`;
    return `f?:${claveDeRollo(item)}|${String(item.owner || "").trim().toLowerCase()}`;
  }
  return `i:${item.insumoId}|${item.tipoId || ""}`;
}

/** ¿Los dos ítems apuntan al MISMO lugar del inventario? */
export function mismoDestino(a, b) {
  if (!a || !b || a.categoria !== b.categoria) return false;
  if (a.categoria === "filamento") {
    // Por el id cuando los dos lo tienen; si no, por las características, que
    // es lo que define el rollo.
    if (a.filamentoId && b.filamentoId) return a.filamentoId === b.filamentoId;
    return claveDeRollo(a) === claveDeRollo(b)
      && String(a.owner || "").trim().toLowerCase() === String(b.owner || "").trim().toLowerCase();
  }
  if (a.categoria === "insumo") {
    return a.insumoId === b.insumoId && (a.tipoId || "") === (b.tipoId || "");
  }
  return false;
}

/**
 * Dónde se está usando un insumo. Borrarlo del catálogo se lleva su historial
 * de gastos y restocks, así que primero hay que saber quién lo nombra.
 *
 * Los tres lugares son distintos y hay que mirar los tres: un insumo puede no
 * estar en ninguna receta y sin embargo figurar en una compra ya cargada.
 *
 * @returns {Array<{tipo: string, donde: string}>}
 */
export function usosDeInsumo(insumoId, { productos = [], personalizados = [], gastos = [] } = {}) {
  const usos = [];
  if (!insumoId) return usos;

  for (const p of [...productos, ...personalizados]) {
    const nombre = p.name || p.clienteNombre || p.id || "(sin nombre)";
    if ((p.insumos || []).some(l => l?.insumoId === insumoId)) {
      usos.push({ tipo: "producto", donde: `${nombre} (insumo fijo)` });
    }
    for (const grupo of (p.variantesInsumo || [])) {
      if ((grupo?.opciones || []).some(o => o?.insumoId === insumoId)) {
        usos.push({ tipo: "variante", donde: `${nombre} · ${grupo.nombre || "grupo"}` });
      }
    }
  }

  for (const g of gastos) {
    if ((g.items || []).some(i => i?.categoria === "insumo" && i.insumoId === insumoId)) {
      usos.push({ tipo: "gasto", donde: g.numeroGasto || "(gasto sin número)" });
    }
  }
  return usos;
}
