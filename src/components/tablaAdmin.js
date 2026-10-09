// ─── El aspecto de las tablas del backoffice ─────────────────────────
// Productos, Pedidos y los ítems de un gasto son la misma tabla: una banda
// gris de encabezado, filas separadas por una línea fina y dos botones chicos
// de acción al final. Hasta ahora cada una tenía esos valores escritos a mano
// —Pedidos es una copia literal de Productos— así que cambiar el aspecto
// significaba acordarse de los tres lugares.
//
// Son objetos de estilo y no un componente a propósito: cada tabla arma su
// propio grid y sus propias celdas, que es donde de verdad se diferencian
// (Productos tiene una fila que se despliega, los ítems tienen un formulario
// embebido). Lo que se comparte es lo que tiene que verse igual.
//
// Las columnas (`gridTemplateColumns`) las pone cada tabla: son lo único que
// no puede ser común.

/** Scroll horizontal propio, sangrado para que la tabla llegue a los bordes. */
export const envolturaTabla = {
  overflowX: "auto", margin: "0 -16px", padding: "0 16px",
};

/** La banda gris con los títulos de columna. */
export const encabezadoTabla = {
  display: "grid", gap: 10, padding: "9px 10px",
  background: "var(--bg-alt)",
  fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2,
  color: "var(--muted)", fontWeight: 700,
};

/** Una fila de datos. La línea que la separa de la siguiente va aparte. */
export const filaTabla = {
  display: "grid", gap: 10, padding: "12px 10px",
  fontSize: 12.5, alignItems: "center",
};

/** La línea entre filas. Va en el contenedor, no en la fila. */
export const bordeFila = { borderBottom: "1px solid var(--line)" };

/**
 * El resaltado al pasar el mouse. Es una clase y no un estilo porque :hover
 * no existe en los estilos inline de React.
 */
export const CLASE_FILA = "fila-admin";

/** Los botones chicos del final de cada fila. */
export const botonAccion = {
  background: "none", border: "1px solid var(--line)", padding: "5px 7px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

/** El de borrar, que va en rojo. */
export const botonBorrar = { ...botonAccion, color: "#c64138" };
