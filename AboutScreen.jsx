import { TKButton, Icon } from '../components/UI.jsx';
import aboutUsImg from '../assets/about-us.jpg';

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
            Trabajamos con distintos materiales (PLA, PETG, TPU, resina) según la función de cada pieza. Diseñamos en casa, prototipamos, iteramos, y recién entonces pasa al catálogo. Cada producto es impreso bajo pedido: no hay stock muerto, cada pieza tiene un destino.
          </p>
        </div>
        <div style={{ background: "var(--beige)", aspectRatio: "4/3", position: "relative", overflow: "hidden" }}>
          <img src={aboutUsImg} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Impresión 3D"/>
        </div>
      </section>

      <section style={{ borderTop: "2px solid var(--anchor)", paddingTop: 40, marginBottom: 80 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }} className="about-stats">
          {[
            { n: "500+", l: "Piezas impresas" },
            { n: Math.max(categories.length, 3).toString(), l: "Categorías" },
            { n: "4", l: "Materiales" },
            { n: "48h", l: "Despacho" },
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
          <form style={{ display: "grid", gap: 14 }} onSubmit={e => e.preventDefault()}>
            <input placeholder="Nombre" style={contactInput}/>
            <input placeholder="Email" style={contactInput}/>
            <textarea placeholder="Contanos sobre tu proyecto..." rows={5} style={{...contactInput, resize: "vertical"}}/>
            <TKButton variant="beige" size="lg">Enviar mensaje <Icon.arrow/></TKButton>
          </form>
        </div>
      </section>
    </div>
  );
}

const contactInput = {
  padding: 14, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
  color: "#fff", fontSize: 14, outline: "none",
};
