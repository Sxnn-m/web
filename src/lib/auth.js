// ─── Mensajes de autenticación ───────────────────────────────────────
// Los textos que ve el usuario cuando Firebase Auth falla, y el documento con
// el que nace una cuenta. Sin imports: se prueban en Node pelado.

/**
 * El mensaje de "te mandamos el mail", que es SIEMPRE el mismo.
 *
 * Nunca se confirma ni se niega que el email exista. Si el formulario
 * respondiera "esa cuenta no existe", cualquiera podría usarlo para averiguar
 * qué direcciones están registradas, probando de a una. Por eso un email
 * desconocido también cae acá (ver errorDeReset con user-not-found).
 */
export const EXITO_RESET =
  "Si el email existe, te enviamos un link para restablecer tu contraseña. Revisá tu casilla.";

/**
 * Qué mostrar cuando sendPasswordResetEmail falla.
 *
 * @returns {null | string} null = tratarlo como éxito y mostrar EXITO_RESET.
 */
export function errorDeReset(code) {
  switch (code) {
    // La cuenta no existe. Firebase lo cuenta, nosotros no: se responde lo
    // mismo que en el caso bueno. Es el corazón de la protección.
    case "auth/user-not-found":
      return null;

    // Estos sí se pueden decir: hablan del texto que escribió el usuario o del
    // ritmo de los pedidos, no de si hay una cuenta detrás.
    case "auth/invalid-email":
    case "auth/missing-email":
      return "Ese email no tiene un formato válido.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
    case "auth/network-request-failed":
      return "No se pudo conectar. Revisá tu conexión y probá de nuevo.";

    // Cualquier otra cosa queda vaga a propósito: un código inesperado de
    // Firebase podría delatar el estado de la cuenta.
    default:
      return "No se pudo enviar el mail. Probá de nuevo en un rato.";
  }
}

/**
 * Qué mostrar cuando falla el login con Google.
 *
 * @returns {null | string} null = el usuario canceló, no es un error que mostrar.
 */
export function errorDeGoogle(code) {
  switch (code) {
    // Cerró el popup o abrió otro encima: no pasó nada malo.
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return null;

    // Las dos de configuración de la consola de Firebase. El texto nombra la
    // causa real en vez de un "error inesperado", porque si aparece en
    // producción es exactamente lo que hay que ir a arreglar.
    case "auth/unauthorized-domain":
      return "Este dominio no está autorizado en Firebase Authentication. " +
        "Hay que agregarlo en Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "El acceso con Google no está habilitado en Firebase. " +
        "Hay que activarlo en Authentication → Sign-in method → Google.";

    case "auth/account-exists-with-different-credential":
      return "Ya hay una cuenta con ese email creada con contraseña. " +
        "Entrá con email y contraseña.";
    case "auth/network-request-failed":
      return "No se pudo conectar. Revisá tu conexión y probá de nuevo.";
    default:
      return "No se pudo entrar con Google. Probá de nuevo.";
  }
}

/** ¿Este fallo del popup amerita reintentar con redirect? */
export function conviveConRedirect(code) {
  return code === "auth/popup-blocked"
    || code === "auth/operation-not-supported-in-this-environment";
}

/**
 * El documento con el que nace una cuenta en /users.
 *
 * role "customer" siempre: las reglas de Firestore rechazan un create que
 * traiga cualquier otro, así que nadie se autoasigna admin al registrarse.
 */
export function perfilInicial(user) {
  return {
    email: user?.email || "",
    nombre: user?.displayName?.trim() || user?.email || "",
    role: "customer",
  };
}
