import { TKLogo, Icon } from '../components/UI.jsx';
import { CONTACT } from '../data.js';

/**
 * La pantalla que ve un visitante sin sesión de admin mientras el sitio está
 * clausurado desde el Dashboard.
 *
 * Reemplaza al shell completo —Nav, Footer, carrito, botón flotante— y no solo
 * a la zona central: dejar el menú y el carrito de una tienda cerrada invita a
 * navegar algo que no está. Por eso repite acá el logo y la línea del header,
 * con los mismos tokens de index.css, para que se lea como el mismo sitio y no
 * como una página de error de otro lado.
 *
 * El acceso "¿Sos vos?" de abajo no es un adorno: la navegación del sitio es
 * estado de React, no URLs, así que sin este enlace un admin que llega sin
 * sesión no tiene forma de llegar al login —ni, por lo tanto, al Dashboard
 * para desactivar el mantenimiento—. Es deliberadamente discreto, pero no
 * secreto: no protege nada, el login que abre pide credenciales igual.
 */
export function MantenimientoScreen({ go }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div
        className="app-wrap"
        style={{
          maxWidth: 1240, margin: "0 auto", padding: "0 24px",
          width: "100%", flex: 1, display: "flex", flexDirection: "column",
        }}
      >
        {/* Mismo alto y misma línea beige que el header real. */}
        <header style={{ padding: "18px 0", borderBottom: "1px solid var(--line)" }}>
          <TKLogo size={22}/>
        </header>

        <main style={{ flex: 1, display: "flex", alignItems: "center", padding: "60px 0 80px" }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{
              fontSize: 11, color: "var(--muted)", letterSpacing: 2,
              textTransform: "uppercase", marginBottom: 16,
            }}>
              Volvemos enseguida
            </div>

            <h1 style={{
              fontSize: "clamp(40px, 7vw, 92px)", letterSpacing: -2,
              lineHeight: 0.98, margin: "0 0 28px",
            }}>
              Estamos poniendo<br/>la tienda <span style={{ color: "var(--accent)" }}>a punto.</span>
            </h1>

            <p style={{ fontSize: 17, color: "var(--text)", lineHeight: 1.6, margin: "0 0 12px" }}>
              Volvé a intentarlo en un rato: estamos actualizando el catálogo y
              preferimos no mostrarlo a medias.
            </p>
            <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, margin: "0 0 36px" }}>
              Si necesitás algo ahora, escribinos por Instagram y te
              respondemos igual.
            </p>

            <a
              href={CONTACT.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                background: "var(--accent)", color: "#fff",
                padding: "14px 24px", textDecoration: "none",
                fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
              }}
            >
              <Icon.ig size={18}/> @{CONTACT.instagramHandle}
            </a>
          </div>
        </main>

        <footer style={{ borderTop: "1px solid var(--line)", padding: "20px 0 28px" }}>
          <button
            onClick={() => go("auth")}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 12, color: "var(--muted)", letterSpacing: 0.2,
              textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            ¿Sos del equipo? Ingresá acá
          </button>
        </footer>
      </div>
    </div>
  );
}
