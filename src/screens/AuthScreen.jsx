import { useState, useEffect } from 'react';
import { TKButton, TKInput, Icon } from '../components/UI.jsx';
import { auth, db } from '../firebase.js';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, signInWithPopup, signInWithRedirect, getRedirectResult,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import {
  EXITO_RESET, errorDeReset, errorDeGoogle, conviveConRedirect, perfilInicial,
} from '../lib/auth.js';

export function AuthScreen({ go, onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  // Restablecer contraseña: null = cerrado, string = el email tipeado.
  const [emailReset, setEmailReset] = useState(null);
  const [avisoReset, setAvisoReset] = useState("");
  const [errorReset, setErrorReset] = useState("");
  const [enviandoReset, setEnviandoReset] = useState(false);

  /**
   * Crea /users/{uid} si todavía no existe. Se usa en los tres caminos de
   * entrada (email, Google por popup y Google por redirect): una cuenta sin su
   * documento no tiene rol, y App.jsx la trataría como no-admin para siempre.
   */
  const asegurarPerfil = async (user) => {
    const ref = doc(db, "users", user.uid);
    if ((await getDoc(ref)).exists()) return;
    await setDoc(ref, { ...perfilInicial(user), createdAt: serverTimestamp() });
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, pwd);
        // Por si la cuenta se creó antes de que existiera la colección users.
        await asegurarPerfil(cred.user);
        go("home");
      } else {
        if (!nombre.trim()) throw new Error("Debes ingresar un nombre");
        const userCredential = await createUserWithEmailAndPassword(auth, email, pwd);
        await updateProfile(userCredential.user, { displayName: nombre });
        // Create user document in Firestore
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: userCredential.user.email,
          nombre,
          role: "customer",
          createdAt: serverTimestamp(),
        });
        go("home");
      }
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-credential") setError("Email o contraseña incorrectos.");
      else if (err.code === "auth/email-already-in-use") setError("El email ya está registrado.");
      else if (err.code === "auth/weak-password") setError("La contraseña debe tener al menos 6 caracteres.");
      else setError(err.message || "Ocurrió un error en la autenticación.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google ────────────────────────────────────────────────────────────
  // El botón no tenía onClick: nunca estuvo implementado, no era algo que se
  // hubiera roto. Se hace por popup, que no pierde el estado de la página, y
  // se cae a redirect solo si el navegador bloquea la ventana.
  const entrarConGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const proveedor = new GoogleAuthProvider();
      // Que Google pregunte siempre con qué cuenta entrar, en vez de reusar en
      // silencio la última: es una pantalla de backoffice y la máquina puede
      // estar compartida.
      proveedor.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(auth, proveedor);
      await asegurarPerfil(cred.user);
      go("home");
    } catch (err) {
      console.error(err);
      if (conviveConRedirect(err.code)) {
        // El popup no se pudo abrir: se sale de la página y se vuelve. Lo que
        // pase después lo levanta el useEffect de abajo.
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return;
        } catch (err2) {
          console.error(err2);
          setError(errorDeGoogle(err2.code) || "");
        }
      } else {
        // null = el usuario cerró el popup; no es un error que valga mostrar.
        setError(errorDeGoogle(err.code) || "");
      }
    } finally {
      setLoading(false);
    }
  };

  // Cierre del camino por redirect. Devuelve null en una carga normal, así que
  // en el 99% de las veces no hace nada.
  useEffect(() => {
    let vivo = true;
    getRedirectResult(auth)
      .then(async (cred) => {
        if (!cred?.user || !vivo) return;
        await asegurarPerfil(cred.user);
        go("home");
      })
      .catch(err => {
        console.error(err);
        if (vivo) setError(errorDeGoogle(err.code) || "");
      });
    return () => { vivo = false; };
  }, []);

  // ── Restablecer contraseña ────────────────────────────────────────────
  const abrirReset = () => {
    setAvisoReset("");
    setErrorReset("");
    // Arranca con lo que ya haya escrito arriba, que suele ser su email.
    setEmailReset(email);
  };

  const enviarReset = async () => {
    setErrorReset("");
    setEnviandoReset(true);
    try {
      await sendPasswordResetEmail(auth, emailReset.trim());
      setAvisoReset(EXITO_RESET);
    } catch (err) {
      console.error(err);
      const mensaje = errorDeReset(err.code);
      // mensaje null = el email no está registrado. Se responde exactamente lo
      // mismo que si existiera, para no delatar qué cuentas hay.
      if (mensaje === null) setAvisoReset(EXITO_RESET);
      else setErrorReset(mensaje);
    } finally {
      setEnviandoReset(false);
    }
  };

  return (
    <div style={{ padding: "40px 0 80px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, textAlign: "center" }}>
        Acceso al backoffice
      </div>
      <h1 style={{ fontSize: 44, letterSpacing: -1, margin: "0 0 10px", color: "var(--text)", textAlign: "center" }}>
        {mode === "login" ? "Bienvenido de vuelta." : "Creá tu cuenta."}
      </h1>
      <p style={{ color: "var(--muted)", textAlign: "center", marginBottom: 36 }}>
        {mode === "login" ? "Iniciá sesión para administrar el catálogo." : "Creá una cuenta de acceso al backoffice."}
      </p>

      <TKButton variant="outline" full size="lg" icon={<Icon.google/>}
        onClick={entrarConGoogle} disabled={loading}>
        Continuar con Google
      </TKButton>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0", color: "var(--muted)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",  }}>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }}/> o con email <div style={{ flex: 1, height: 1, background: "var(--line)" }}/>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {mode === "register" && (
          <TKInput label="Nombre completo" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="María López"/>
        )}
        <TKInput label="Email" type="email" icon={<Icon.mail size={16}/>} value={email} onChange={e => setEmail(e.target.value)}/>
        <div style={{ display: "block", width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Contraseña
          </div>
          <div style={{ position: "relative" }}>
            <input
              type={showPwd ? "text" : "password"}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder=""
              style={{
                width: "100%", padding: "12px 44px 12px 14px",
                background: "var(--bg)", border: "1px solid var(--line)",
                borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 14, color: "var(--text)", outline: "none",
                transition: "border-color .15s", boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--line)")}
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              title={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
              style={{
                position: "absolute", right: 0, top: 0, bottom: 0,
                width: 42, background: "transparent", border: "none",
                cursor: "pointer", color: "var(--muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
            >
              {showPwd ? <Icon.eyeOff size={17}/> : <Icon.eye size={17}/>}
            </button>
          </div>
        </div>
        {/* El texto va en rojo, no en var(--accent): estaba azul sobre el fondo
            rojo del error, que se leía como un aviso cualquiera. */}
        {error && <div style={{ color: "#C64138", fontSize: 13, fontWeight: 500, background: "#C6413815", padding: "10px 12px", borderRadius: 8 }}>{error}</div>}
        {mode === "login" && (
          <button
            type="button"
            onClick={abrirReset}
            style={{
              alignSelf: "flex-end", background: "none", border: "none", padding: 0,
              fontSize: 12, color: "var(--accent)", fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}
        <TKButton size="lg" full onClick={submit} disabled={loading}>
          {loading ? "Cargando..." : (mode === "login" ? "Iniciar sesión" : "Crear cuenta y continuar")}
        </TKButton>
      </div>

      <div style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: "var(--muted)" }}>
        {mode === "login" ? "¿No tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
        <button onClick={() => setMode(mode === "login" ? "register" : "login")} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
        </button>
      </div>

      {emailReset !== null && (
        <ModalReset
          email={emailReset}
          onEmail={setEmailReset}
          aviso={avisoReset}
          error={errorReset}
          enviando={enviandoReset}
          onEnviar={enviarReset}
          onCerrar={() => setEmailReset(null)}
        />
      )}
    </div>
  );
}

/**
 * Pide el email y manda el link de restablecimiento.
 *
 * Cuando sale bien reemplaza el formulario por la confirmación en vez de
 * dejarlo abierto: el mensaje es a propósito el mismo exista o no la cuenta
 * (ver EXITO_RESET), y volver a mostrar el campo invita a reintentar con otra
 * dirección para ver si cambia la respuesta. No cambia.
 */
function ModalReset({ email, onEmail, aviso, error, enviando, onEnviar, onCerrar }) {
  const puedeEnviar = email.trim().length > 0 && !enviando;
  return (
    <>
      <div onClick={onCerrar} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 190,
      }}/>
      <div
        role="dialog"
        aria-label="Restablecer contraseña"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 191, width: "min(420px, calc(100vw - 32px))",
          background: "var(--bg)", border: "1px solid var(--line)",
          boxShadow: "0 20px 60px rgba(0,0,0,.22)", padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 20, letterSpacing: -0.3, color: "var(--text)" }}>
            Restablecer contraseña
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", padding: 2, display: "flex",
          }}>
            <Icon.close size={18}/>
          </button>
        </div>

        {aviso ? (
          <div style={{
            marginTop: 18, padding: "12px 14px",
            background: "var(--accent-suave)", borderLeft: "3px solid var(--accent)",
            color: "var(--accent)", fontSize: 13, fontWeight: 600, lineHeight: 1.5,
          }}>
            {aviso}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "10px 0 18px" }}>
              Escribí el email de tu cuenta y te mandamos un link para elegir una
              contraseña nueva.
            </p>
            <TKInput
              label="Email"
              type="email"
              icon={<Icon.mail size={16}/>}
              value={email}
              onChange={e => onEmail(e.target.value)}
            />
            {error && (
              <div style={{
                marginTop: 12, color: "#C64138", fontSize: 13, fontWeight: 500,
                background: "#C6413815", padding: "10px 12px", borderRadius: 8,
              }}>
                {error}
              </div>
            )}
            <div style={{ marginTop: 18 }}>
              <TKButton size="lg" full onClick={onEnviar} disabled={!puedeEnviar}>
                {enviando ? "Enviando..." : "Enviar link"}
              </TKButton>
            </div>
          </>
        )}
      </div>
    </>
  );
}
