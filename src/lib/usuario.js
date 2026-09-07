// ─── Datos del usuario logueado ──────────────────────────────────────
// Función pura, compartida por el header de escritorio y el de mobile.

/**
 * Qué nombre mostrar en el header.
 *
 * El registro guarda "nombre" en /users/{uid} y además lo copia al
 * displayName de Firebase Auth, pero una cuenta creada antes de eso puede
 * tener solo uno de los dos — o ninguno. La cadena termina en el email, que
 * siempre existe, así que nunca se muestra vacío teniendo sesión.
 */
export const nombreVisible = (user) =>
  String(user?.nombre || "").trim() || user?.email || "";

/** ¿Vale la pena mostrar el email debajo del nombre, o sería repetirlo? */
export const mostrarEmail = (user) =>
  Boolean(user?.email) && user.email !== nombreVisible(user);
