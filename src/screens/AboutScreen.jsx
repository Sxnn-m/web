import { useState } from 'react';
import { TKButton, Icon } from '../components/UI.jsx';
import aboutUsImg from '../assets/about-us.jpg';
import { enviarMensaje } from '../lib/mensajes.js';
import { validarConsulta, LIMITES } from '../lib/consultas.js';

export function AboutScreen({ go, categories = [] }) {
  return (
    <div style={{ padding: "60px 0 80px" }}>
      <section style={{ marginBottom: 80 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
          Sobre nosotros
        </div>
        <h1 style={{ fontSize: "clamp(48px, 8vw, 110px)", letterSpacing: -2, lineHeight: 0.95, margin: 0, maxWidth: 900 }}>
          Diseñamos e<br/>imprimimos en<br/><span style={{ color: "var(--accent)" }}>Buenos Aires.</span>
        </h1>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginBottom: 80 }} className="about-grid">
        <div>
          <p style={{ fontSize: 17, color: "var(--text)", lineHeight: 1.6, marginBottom: 20 }}>
            TKPrints nació con la idea de acercar la impresión 3D al uso cotidiano. Hacemos objetos que se usan todos los días, funcionales, decorativos.
          </p>
          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7 }}>
            Trabajamos con distintos materiales (PLA, PETG, TPU) según la función de cada pieza. Diseñamos en casa, prototipamos, iteramos, y recién entonces pasa al catálogo. Cada producto es impreso bajo pedido: no hay stock muerto, cada pieza tiene un destino.
          </p>
        </div>
        <div style={{ background: "var(--beige)", aspectRatio: "4/3", position: "relative", overflow: "hidden" }}>
          <img src={aboutUsImg} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Impresión 3D"/>
        </div>
      </section>

      <section style={{ borderTop: "2px solid var(--anchor)", paddingTop: 40, marginBottom: 80 }}>
        {/* Tres columnas: la grilla es fija, no auto-fit, así que el número
            acompaña a la cantidad de datos o queda un hueco a la derecha. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }} className="about-stats">
          {[
            { n: "500+", l: "Piezas impresas" },
            { n: Math.max(categories.length, 3).toString(), l: "Categorías" },
            { n: "3", l: "Materiales" },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 56, color: "var(--accent)", letterSpacing: -1, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginTop: 8 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "var(--anchor)", color: "#fff", padding: "60px", margin: "0 -24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60 }} className="about-grid">
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--beige)", marginBottom: 16 }}>
              Contacto
            </div>
            <h2 style={{ fontSize: 48, letterSpacing: -1, margin: "0 0 24px", lineHeight: 1 }}>
              ¿Charlamos tu<br/>proyecto?
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, color: "rgba(255,255,255,.85)", fontSize: 15 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Icon.mail/> tk.prints.ok@hotmail.com
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Icon.ig/> @tk.prints.3d
              </div>
            </div>
          </div>
          <FormularioContacto />
        </div>
      </section>
    </div>
  );
}

const contactInput = {
  padding: 14, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
  color: "#fff", fontSize: 14, outline: "none",
};

const errorTexto = { fontSize: 12, color: "#FFB4AE", marginTop: -8 };

// ─── Formulario de contacto ──────────────────────────────────────────
// Antes los inputs no estaban controlados y el submit solo hacía
// preventDefault: lo que se escribía se descartaba en silencio. Ahora cada
// envío crea un documento en "mensajes", que el backoffice lee desde el tab
// Mensajería.
function FormularioContacto() {
  const [form, setForm] = useState({ nombre: "", email: "", mensaje: "" });
  const [errores, setErrores] = useState({});
  const [estado, setEstado] = useState("editando");   // editando | enviando | enviado | error
  const [errorEnvio, setErrorEnvio] = useState("");

  const up = (campo) => (e) => {
    setForm(f => ({ ...f, [campo]: e.target.value }));
    // El error se limpia al corregir, no recién al reintentar el envío.
    if (errores[campo]) setErrores(er => ({ ...er, [campo]: undefined }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    const { valido, errores: errs } = validarConsulta(form);
    setErrores(errs);
    if (!valido) return;

    setEstado("enviando");
    try {
      await enviarMensaje(form);
      setForm({ nombre: "", email: "", mensaje: "" });
      setEstado("enviado");
    } catch (err) {
      setErrorEnvio(err.message);
      setEstado("error");
    }
  };

  if (estado === "enviado") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        gap: 14, padding: 28, border: "1px solid rgba(255,255,255,.25)",
      }}>
        <div style={{ fontSize: 22, letterSpacing: -0.5 }}>¡Gracias! Recibimos tu mensaje.</div>
        <p style={{ color: "rgba(255,255,255,.85)", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          Te vamos a contestar al email que dejaste. Si es urgente, escribinos
          directo a tk.prints.ok@hotmail.com.
        </p>
        <div>
          <TKButton variant="beige" onClick={() => setEstado("editando")}>
            Enviar otro mensaje
          </TKButton>
        </div>
      </div>
    );
  }

  const enviando = estado === "enviando";

  return (
    <form style={{ display: "grid", gap: 14 }} onSubmit={enviar} noValidate>
      <input
        placeholder="Nombre"
        value={form.nombre}
        onChange={up("nombre")}
        maxLength={LIMITES.nombre}
        disabled={enviando}
        style={{ ...contactInput, borderColor: errores.nombre ? "#FFB4AE" : "rgba(255,255,255,.2)" }}
      />
      {errores.nombre && <div style={errorTexto}>{errores.nombre}</div>}

      <input
        placeholder="Email"
        type="email"
        value={form.email}
        onChange={up("email")}
        maxLength={LIMITES.email}
        disabled={enviando}
        style={{ ...contactInput, borderColor: errores.email ? "#FFB4AE" : "rgba(255,255,255,.2)" }}
      />
      {errores.email && <div style={errorTexto}>{errores.email}</div>}

      <textarea
        placeholder="Contanos sobre tu proyecto..."
        rows={5}
        value={form.mensaje}
        onChange={up("mensaje")}
        maxLength={LIMITES.mensaje}
        disabled={enviando}
        style={{
          ...contactInput, resize: "vertical",
          borderColor: errores.mensaje ? "#FFB4AE" : "rgba(255,255,255,.2)",
        }}
      />
      {errores.mensaje && <div style={errorTexto}>{errores.mensaje}</div>}

      <TKButton variant="beige" size="lg" disabled={enviando}>
        {enviando ? "Enviando..." : <>Enviar mensaje <Icon.arrow/></>}
      </TKButton>

      {estado === "error" && (
        <div style={{ fontSize: 13, color: "#FFB4AE", lineHeight: 1.5 }}>
          No se pudo enviar el mensaje ({errorEnvio}). Probá de nuevo, o
          escribinos a tk.prints.ok@hotmail.com.
        </div>
      )}
    </form>
  );
}
