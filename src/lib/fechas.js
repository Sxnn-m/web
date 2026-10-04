// ─── Fechas para mostrar ─────────────────────────────────────────────
// Dos formatos y un solo lugar donde viven, porque la misma fecha se muestra
// distinto según la tabla y tenerlos duplicados ya hizo que una lista llevara
// hora y la de al lado no.

/** Firestore Timestamp | Date | null → Date, o null si no se puede leer. */
function aFecha(valor) {
  if (!valor) return null;
  const d = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "16/09/2026 14:05". Para donde la hora importa, como el detalle de un pedido. */
export function fmtFecha(valor) {
  const d = aFecha(valor);
  if (!d) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * "16/09/2026". El de las tablas: la hora gasta media columna y nunca es el
 * dato que se busca. El ORDEN sigue saliendo del timestamp completo, así que
 * dos registros del mismo día no se mezclan por dejar de mostrarla.
 */
export function fmtDia(valor) {
  const d = aFecha(valor);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
