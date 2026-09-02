import { useState } from 'react';
import { TKButton, TKInput, Icon } from '../components/UI.jsx';
import { auth, db } from '../firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

export function AuthScreen({ go, onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, pwd);
        // Ensure user doc exists (in case they registered before Firestore was set up)
        const userRef = doc(db, "users", cred.user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: cred.user.email,
            nombre: cred.user.displayName || cred.user.email,
            role: "customer",
            createdAt: serverTimestamp(),
          });
        }
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

      <TKButton variant="outline" full size="lg" icon={<Icon.google/>}>
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
        {error && <div style={{ color: "var(--accent)", fontSize: 13, fontWeight: 500, background: "#C6413815", padding: "10px 12px", borderRadius: 8 }}>{error}</div>}
        {mode === "login" && (
          <a href="#" style={{ fontSize: 12, color: "var(--accent)", textAlign: "right", textDecoration: "none", fontWeight: 600 }}>¿Olvidaste tu contraseña?</a>
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
    </div>
  );
}
