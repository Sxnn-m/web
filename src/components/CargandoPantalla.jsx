// ─── Lo que se ve mientras baja un chunk ─────────────────────────────
// El fallback de los Suspense. Es a propósito el MISMO que el splash que ya
// usa App.jsx mientras resuelve la bandera de mantenimiento y la sesión: el
// fondo del sitio y el logo, nada más. Si fueran distintos, entrar al
// backoffice mostraría dos pantallas de espera seguidas con dos estéticas
// diferentes, que se lee como un salto y no como una carga.
//
// Sin texto ni spinner: el chunk del backoffice pesa unos cientos de kB y en
// una conexión normal esto aparece por menos de un segundo. Un "Cargando..."
// que parpadea molesta más de lo que informa.

import { TKLogo } from './UI.jsx';

export function CargandoPantalla({ alto = "100vh" }) {
  return (
    <div
      // role y aria-label porque para un lector de pantalla esto es una
      // región que aparece y desaparece sola: sin el aviso, el foco cae en
      // algo vacío y no hay forma de saber que está esperando.
      role="status"
      aria-label="Cargando"
      style={{
        minHeight: alto, background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <TKLogo size={26}/>
    </div>
  );
}
