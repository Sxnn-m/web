// ─── Red de contención ───────────────────────────────────────────────
// React desmonta TODO el árbol cuando un render tira una excepción: sin esto,
// un solo dato mal formado —una categoría sin nombre, un producto sin
// imagen— dejaba la pantalla en blanco, sin un texto que explicara nada.
//
// Va envolviendo a la app entera, por encima del ruteo y del modo
// mantenimiento. No los interfiere: solo se muestra cuando algo ya falló, y
// mientras no falle nada es transparente. En particular, las rutas que el
// mantenimiento deja abiertas (auth y admin) siguen funcionando igual.
//
// Es un componente de clase porque componentDidCatch no tiene equivalente en
// hooks: es la única forma que da React de capturar un error de render.

import { Component } from 'react';
import { manejarErrorDeChunk } from '../lib/recargaPorChunk.js';
import { CargandoPantalla } from './CargandoPantalla.jsx';

const caja = {
  minHeight: "100dvh",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 24, background: "var(--bg)", color: "var(--text)",
  fontFamily: "'DM Sans', system-ui, sans-serif",
  textAlign: "center",
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { fallo: false, recargando: false };
  }

  static getDerivedStateFromError() {
    // Sin efectos acá: React exige que esto sea puro. Lo de recargar va en
    // componentDidCatch, que es donde están permitidos.
    return { fallo: true };
  }

  componentDidCatch(error, info) {
    // Primero, el caso que NO es un bug de la app: el navegador no pudo bajar
    // un chunk. Pasa típicamente con una pestaña vieja abierta después de un
    // deploy nuevo, porque el archivo que esa pestaña va a pedir ya cambió de
    // hash. Recargar lo arregla, y se hace una sola vez.
    const resultado = manejarErrorDeChunk(error);

    if (resultado === "recargando") {
      // La recarga ya está pedida. Se muestra el splash en vez de "algo salió
      // mal" para no hacer parpadear un error que se arregla solo.
      this.setState({ recargando: true });
      return;
    }

    // Al visitante no se le muestra nada técnico —un stack no lo ayuda y
    // puede filtrar nombres de archivos— pero sí queda en la consola para
    // poder diagnosticarlo con la pestaña abierta.
    if (resultado === "no-es-de-chunk") {
      console.error("Error no capturado en el árbol de React:", error, info?.componentStack);
    } else {
      // "ya-se-intento" o "sin-almacen": el problema es real y no lo arregla
      // otra recarga automática. Queda la pantalla con el botón, que la
      // aprieta una persona y por lo tanto no se repite solo.
      console.error(
        `No se pudo cargar una parte de la aplicación (${resultado}):`, error
      );
    }
  }

  render() {
    if (this.state.recargando) return <CargandoPantalla/>;
    if (!this.state.fallo) return this.props.children;

    return (
      <div style={caja}>
        <div style={{ maxWidth: 420 }}>
          <div style={{
            fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
            color: "var(--muted)", marginBottom: 14,
          }}>
            TKPrints
          </div>
          <h1 style={{
            fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.1,
            letterSpacing: -1, margin: "0 0 14px",
          }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 28px" }}>
            Probá recargar la página.
          </p>
          {/* window.location.reload() y no un reintento en React: si el estado
              que rompió el render sigue en memoria, remontar vuelve a fallar. */}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "var(--accent)", color: "#fff", border: "none",
              padding: "14px 32px", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer", borderRadius: 4,
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
