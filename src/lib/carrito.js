// ─── Carrito de intención de compra ──────────────────────────────────
// Funciones puras. El carrito vive SOLO en el navegador del cliente
// (estado de React + localStorage): no toca Firestore ni tiene relación
// con el módulo de Pedidos del backoffice, que se sigue cargando a mano
// después de hablar por Instagram.

export const MAX_CANTIDAD = 99;

/**
 * Identidad de una línea: el mismo producto con el mismo color y el mismo
 * texto grabado es la misma línea y suma cantidad. Cambiar cualquiera de las
 * tres cosas hace una línea nueva, porque son piezas distintas de imprimir.
 */
export const claveLinea = (productoId, colorId, texto = "") =>
  `${productoId}|${colorId || ""}|${String(texto).trim().toLowerCase()}`;

const limitar = (n) => Math.max(1, Math.min(MAX_CANTIDAD, Math.round(Number(n) || 1)));

/**
 * Agrega una configuración al carrito. Si ya existe una línea igual, suma.
 *
 * Guarda un snapshot del nombre y el precio: si mañana cambia el precio del
 * producto, lo que el cliente tiene en su carrito no muta bajo sus pies.
 *
 * @returns {Array} el carrito nuevo (no muta el original)
 */
export function agregarLinea(carrito = [], producto, { color, texto = "", cantidad = 1 } = {}) {
  if (!producto?.id) return carrito;

  const clave = claveLinea(producto.id, color?.id, texto);
  const suma = limitar(cantidad);
  const existente = carrito.find(l => l.clave === clave);

  if (existente) {
    return carrito.map(l =>
      l.clave === clave ? { ...l, cantidad: limitar(l.cantidad + suma) } : l
    );
  }

  return [...carrito, {
    clave,
    productoId: producto.id,
    nombre: producto.name || "Producto",
    precioUnitario: Number(producto.price) || 0,
    img: producto.img || producto.images?.[0] || "",
    colorId: color?.id || "",
    colorNombre: color?.name || "",
    colorHex: color?.hex || "",
    texto: String(texto).trim(),
    cantidad: suma,
  }];
}

/** Cambia la cantidad de una línea. Llevarla a 0 (o menos) la elimina. */
export function cambiarCantidad(carrito = [], clave, cantidad) {
  const n = Math.round(Number(cantidad) || 0);
  if (n <= 0) return quitarLinea(carrito, clave);
  return carrito.map(l => l.clave === clave ? { ...l, cantidad: limitar(n) } : l);
}

export const quitarLinea = (carrito = [], clave) => carrito.filter(l => l.clave !== clave);

export const subtotalLinea = (linea) =>
  (Number(linea?.precioUnitario) || 0) * (Number(linea?.cantidad) || 0);

export const totalCarrito = (carrito = []) =>
  carrito.reduce((s, l) => s + subtotalLinea(l), 0);

/**
 * Lo que muestra el badge: unidades totales, no líneas distintas. Es lo que
 * hace la mayoría de las tiendas — agregar 3 del mismo producto tiene que
 * mostrar 3.
 */
export const unidadesTotales = (carrito = []) =>
  carrito.reduce((s, l) => s + (Number(l?.cantidad) || 0), 0);

/** Descarta lo que venga roto de localStorage sin tirar el carrito entero. */
export function normalizarCarrito(valor) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(l => l && l.productoId && l.clave)
    .map(l => ({
      clave: String(l.clave),
      productoId: String(l.productoId),
      nombre: String(l.nombre || "Producto"),
      precioUnitario: Number(l.precioUnitario) || 0,
      img: String(l.img || ""),
      colorId: String(l.colorId || ""),
      colorNombre: String(l.colorNombre || ""),
      colorHex: String(l.colorHex || ""),
      texto: String(l.texto || ""),
      cantidad: limitar(l.cantidad),
    }));
}

const pesos = (n) => "$ " + Math.round(n).toLocaleString("es-AR");

/**
 * Resumen del pedido en texto plano, para que el cliente lo pegue en el chat.
 *
 * Hace falta porque el deep link de Instagram (ig.me/m/usuario) NO acepta
 * texto prellenado: a diferencia de wa.me, no hay forma de mandarle contenido
 * por la URL. Abrir el chat con el carrito ya escrito es imposible, así que
 * lo mejor disponible es dejarlo copiado.
 */
export function resumenDePedido(carrito = []) {
  if (carrito.length === 0) return "";
  const lineas = carrito.map(l => {
    const partes = [`${l.cantidad}x ${l.nombre}`];
    if (l.colorNombre) partes.push(`color ${l.colorNombre}`);
    if (l.texto) partes.push(`texto "${l.texto}"`);
    return `• ${partes.join(" · ")} — ${pesos(subtotalLinea(l))}`;
  });
  return [
    "¡Hola! Quiero consultar por este pedido:",
    "",
    ...lineas,
    "",
    `Total: ${pesos(totalCarrito(carrito))}`,
  ].join("\n");
}
