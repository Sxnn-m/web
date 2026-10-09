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

export const CATEGORIAS = [
  { id: "filamento", nombre: "Filamento" },
  { id: "insumo", nombre: "Insumo" },
  { id: "envio", nombre: "Envío" },
];

/** ¿Guardar este ítem mueve stock? Envío no. */
export const mueveStock = (item) =>
  item?.categoria === "filamento" || item?.categoria === "insumo";

/** Id propio de cada ítem: sin él, editar el 3º no se distingue de editar otro. */
export const nuevoItemId = () =>
  `it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Un ítem recién agregado, en borrador. */
export function itemVacio(categoria = "filamento") {
  const base = { itemId: nuevoItemId(), categoria };
  if (categoria === "filamento") {
    return { ...base, material: "", color: "", marca: "", owner: "", cantidad: "", precioTotal: "" };
  }
  if (categoria === "insumo") {
    return { ...base, insumoId: "", insumoNombre: "", tipoId: "", tipoNombre: "", marca: "", precioUnitario: "", cantidad: "" };
  }
  return { ...base, precioTotal: "" };
}

/** Cambiar de categoría rehace el borrador: los campos son otros. */
export const cambiarCategoria = (item, categoria) =>
  ({ ...itemVacio(categoria), itemId: item?.itemId || nuevoItemId() });

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

/**
 * El monto que vale un gasto.
 *
 * Con ítems lo manda la suma, y el campo manual deja de usarse: tener los dos
 * conviviendo haría que el saldo dependa de cuál se leyó. Sin ítems —los
 * gastos anteriores a esta pantalla— sigue valiendo el monto cargado a mano.
 */
export function montoDeGasto(gasto) {
  const items = Array.isArray(gasto?.items) ? gasto.items : [];
  return items.length > 0 ? totalDeItems(items) : (Number(gasto?.monto) || 0);
}

export const tieneItems = (gasto) =>
  Array.isArray(gasto?.items) && gasto.items.length > 0;

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
    };
  }
  return { ...base, precioTotal: num(item.precioTotal) || 0 };
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
