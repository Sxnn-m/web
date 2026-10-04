// ─── Finanzas: ganancias, gastos y saldo ─────────────────────────────
// Dos colecciones y un saldo que es su resta. Lo que tiene miga es de dónde
// sale cada número:
//
//   - Las ganancias de un pedido NO se cargan a mano: aparecen cuando el
//     pedido se marca pagado y desaparecen si se vuelve atrás. El documento
//     se guarda CON EL ID DEL PEDIDO, así que marcar pagado dos veces, o
//     recargar la página en el medio, escribe el mismo documento en vez de
//     crear otro: el duplicado no se evita con un chequeo, no se puede dar.
//   - El correlativo de los gastos sale de un contador, no del máximo de los
//     que existen. Es la diferencia con ORD y CON: aquellos reusan el número
//     del último borrado, y en un comprobante de compra repetir un número es
//     peor que saltearlo.

import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  runTransaction, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase.js';

export const COL_GANANCIAS = "ganancias";
export const COL_GASTOS = "gastos";
export const PREFIJO_GASTO = "GAS";

/** El documento que lleva los correlativos. Vive en settings, ya admin-only. */
const refContadores = () => doc(db, "settings", "contadores");

// ── Fechas ────────────────────────────────────────────────────────────
// El input date da "2026-10-04". `new Date("2026-10-04")` lo lee como
// medianoche UTC, que en Argentina es el 3 a las 21: el día se corre uno para
// atrás solo. Se arma al mediodía local, que no se cae de día con ningún huso.

/** "2026-10-04" → Date local del 4 al mediodía. Null si no es una fecha válida. */
export function fechaDesdeInput(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || "").trim());
  if (!m) return null;
  const [, a, mes, d] = m;
  const fecha = new Date(Number(a), Number(mes) - 1, Number(d), 12, 0, 0);
  // Un 31 de febrero se desborda a marzo en vez de fallar: se verifica que el
  // día que quedó sea el que se pidió.
  if (fecha.getDate() !== Number(d) || fecha.getMonth() !== Number(mes) - 1) return null;
  return fecha;
}

/** Timestamp | Date | null → "2026-10-04", para precargar el input. */
export function inputDesdeFecha(valor) {
  if (!valor) return "";
  const d = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoy, para el valor por defecto de los formularios. */
export const hoyEnInput = () => inputDesdeFecha(new Date());

/** Milisegundos de una fecha de Firestore, para ordenar. 0 si no hay. */
export function msDe(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

// ── Validación ────────────────────────────────────────────────────────

/**
 * Los dos campos que no pueden entrar mal: un monto que no sea un número
 * mayor a 0 rompe el saldo en silencio, y una fecha inválida deja una fila
 * que no se puede ordenar.
 *
 * @returns {{valido: boolean, errores: object, datos: object}}
 */
export function validarMovimiento({ fecha, monto, descripcion }, { pideDescripcion = true } = {}) {
  const errores = {};
  const f = fechaDesdeInput(fecha);
  if (!f) errores.fecha = "Poné una fecha válida.";

  // Number("") es 0 y Number(" ") también: se chequea el texto antes, o un
  // campo vacío pasaría como monto cero.
  const texto = String(monto ?? "").trim();
  const n = texto === "" ? NaN : Number(texto);
  if (!Number.isFinite(n) || n <= 0) errores.monto = "El monto tiene que ser un número mayor a 0.";

  const desc = String(descripcion || "").trim();
  if (pideDescripcion && desc.length === 0) errores.descripcion = "Escribí una descripción.";

  return {
    valido: Object.keys(errores).length === 0,
    errores,
    datos: { fecha: f, monto: n, descripcion: desc },
  };
}

// ── Totales ───────────────────────────────────────────────────────────

/**
 * Lo único que se muestra arriba de las dos listas. El saldo PUEDE ser
 * negativo y se devuelve así: gastar más de lo que entró es un estado real
 * del emprendimiento, no un error de cálculo que haya que recortar en 0.
 */
export function totales(ganancias = [], gastos = []) {
  const suma = (filas) => filas.reduce((acc, f) => acc + (Number(f?.monto) || 0), 0);
  const ingresos = suma(ganancias);
  const egresos = suma(gastos);
  return { ingresos, egresos, saldo: ingresos - egresos };
}

/** Más reciente primero, con el createdAt como desempate. */
const porFechaDesc = (a, b) =>
  (msDe(b.fecha) - msDe(a.fecha)) || (msDe(b.createdAt) - msDe(a.createdAt));

export const ordenarPorFecha = (filas = []) => [...filas].sort(porFechaDesc);

// ── Lectura ───────────────────────────────────────────────────────────

const leer = async (col) => {
  const snap = await getDocs(collection(db, col));
  return ordenarPorFecha(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
};

export const cargarGanancias = () => leer(COL_GANANCIAS);
export const cargarGastos = () => leer(COL_GASTOS);

// ── Ganancias automáticas (las gobierna Pedidos) ──────────────────────

/** El documento de la ganancia de un pedido. Su ID ES el del pedido. */
export const refGananciaDePedido = (pedidoId) => doc(db, COL_GANANCIAS, pedidoId);

/**
 * Lo que se guarda cuando un pedido se marca pagado.
 *
 * @param {*} fecha cuándo se cobró. Al marcarlo pagado es el serverTimestamp()
 *   de la misma transacción, así la ganancia y el pagadoAt del pedido son el
 *   mismo instante y no dos lecturas distintas del reloj.
 */
export const datosGananciaDePedido = (pedido, fecha) => ({
  tipo: "pedido",
  pedidoId: pedido._id,
  numeroOrden: pedido.numeroOrden || "",
  monto: Number(pedido.precioTotal) || 0,
  fecha,
  createdAt: serverTimestamp(),
});

/** ¿Es de las que se gobiernan desde Pedidos y no se tocan a mano? */
export const esAutomatica = (ganancia) => ganancia?.tipo === "pedido";

// ── Red de seguridad: pedidos pagados de antes de esta sección ────────

/**
 * Qué pedidos pagados todavía no tienen su ganancia.
 *
 * Los que no guardaron pagadoAt se separan en vez de inventarles una fecha:
 * poner "hoy" en una venta de hace tres meses ensucia el histórico y después
 * no hay forma de saber cuáles se inventaron.
 *
 * @returns {{aCrear: Array, sinFecha: Array}}
 */
export function gananciasFaltantes(pedidos = [], ganancias = []) {
  const yaTienen = new Set(ganancias.filter(esAutomatica).map(g => g.pedidoId));
  const aCrear = [];
  const sinFecha = [];
  for (const p of pedidos) {
    if (p?.estadoPago !== "pagado" || !p._id || yaTienen.has(p._id)) continue;
    (p.pagadoAt ? aCrear : sinFecha).push(p);
  }
  return { aCrear, sinFecha };
}

/**
 * Crea las que faltan, con el pagadoAt de cada pedido. Idempotente: el ID del
 * documento es el del pedido, así que correrla dos veces no duplica nada.
 */
export async function crearGananciasFaltantes(pedidos = []) {
  if (pedidos.length === 0) return 0;
  const batch = writeBatch(db);
  for (const p of pedidos) {
    batch.set(refGananciaDePedido(p._id), datosGananciaDePedido(p, p.pagadoAt));
  }
  await batch.commit();
  return pedidos.length;
}

/** La ganancia de un pedido pagado sin fecha, con la que se elija a mano. */
export async function crearGananciaDePedidoConFecha(pedido, fechaTexto) {
  const fecha = fechaDesdeInput(fechaTexto);
  if (!fecha) throw new Error("Poné una fecha válida.");
  await setDoc(refGananciaDePedido(pedido._id), datosGananciaDePedido(pedido, fecha));
}

// ── Ganancias manuales ────────────────────────────────────────────────

export async function crearGananciaManual({ fecha, monto, descripcion }) {
  const { valido, errores, datos } = validarMovimiento({ fecha, monto, descripcion });
  if (!valido) throw new Error(Object.values(errores).join(" "));
  await addDoc(collection(db, COL_GANANCIAS), {
    tipo: "manual",
    descripcion: datos.descripcion,
    monto: datos.monto,
    fecha: datos.fecha,
    createdAt: serverTimestamp(),
  });
}

export async function actualizarGananciaManual(id, { fecha, monto, descripcion }) {
  const { valido, errores, datos } = validarMovimiento({ fecha, monto, descripcion });
  if (!valido) throw new Error(Object.values(errores).join(" "));
  await updateDoc(doc(db, COL_GANANCIAS, id), {
    descripcion: datos.descripcion, monto: datos.monto, fecha: datos.fecha,
  });
}

export const eliminarGanancia = (id) => deleteDoc(doc(db, COL_GANANCIAS, id));

// ── Gastos ────────────────────────────────────────────────────────────

/** 7 → "GAS-0007". */
export const formatearNumeroGasto = (n) =>
  `${PREFIJO_GASTO}-${String(Math.max(0, Number(n) || 0)).padStart(4, "0")}`;

/**
 * El correlativo sale de un contador y no del máximo de los gastos que
 * existen, que es como funcionan ORD y CON: ahí, borrar el último hace que el
 * siguiente reuse su número. Para un comprobante de compra eso es peor que
 * saltearse uno, porque dos papeles distintos terminan con el mismo número.
 *
 * El incremento va en la MISMA transacción que escribe el gasto: dos altas a
 * la vez leen el mismo valor, pero solo una commitea y la otra reintenta.
 */
export async function crearGasto({ fecha, descripcion, monto, detalle = "" }) {
  const { valido, errores, datos } = validarMovimiento({ fecha, monto, descripcion });
  if (!valido) throw new Error(Object.values(errores).join(" "));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(refContadores());
    const siguiente = (Number(snap.exists() ? snap.data().gastos : 0) || 0) + 1;
    const numeroGasto = formatearNumeroGasto(siguiente);

    // merge para no pisar otros contadores que puedan vivir en el documento.
    tx.set(refContadores(), { gastos: siguiente }, { merge: true });
    tx.set(doc(collection(db, COL_GASTOS)), {
      numeroGasto,
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      monto: datos.monto,
      detalle: String(detalle || ""),
      createdAt: serverTimestamp(),
    });
    return numeroGasto;
  });
}

/** El número NO se toca: es el correlativo, y editarlo rompería su sentido. */
export async function actualizarGasto(id, { fecha, descripcion, monto }) {
  const { valido, errores, datos } = validarMovimiento({ fecha, monto, descripcion });
  if (!valido) throw new Error(Object.values(errores).join(" "));
  await updateDoc(doc(db, COL_GASTOS, id), {
    fecha: datos.fecha, descripcion: datos.descripcion, monto: datos.monto,
  });
}

export const guardarDetalleGasto = (id, detalle) =>
  updateDoc(doc(db, COL_GASTOS, id), { detalle: String(detalle || "") });

export const eliminarGasto = (id) => deleteDoc(doc(db, COL_GASTOS, id));

/** Un gasto puntual, para la vista de detalle entrando por URL. */
export async function cargarGasto(id) {
  const snap = await getDoc(doc(db, COL_GASTOS, id));
  return snap.exists() ? { _id: snap.id, ...snap.data() } : null;
}
