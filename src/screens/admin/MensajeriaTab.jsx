import { useState } from 'react';
import { TKButton, Icon } from '../../components/UI.jsx';
import { fmtFecha } from './InventarioTab.jsx';
import { marcarLeido, eliminarMensaje } from '../../lib/mensajes.js';
import { contarNoLeidos } from '../../lib/consultas.js';

// ─── Tab Mensajería ──────────────────────────────────────────────────
// Bandeja de las consultas que entran por el formulario público. No se
// responde desde acá: el email queda a la vista para contestar por fuera.

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const COL = "110px 1.2fr 1.6fr 150px 44px";

export function MensajeriaTab({ mensajes = [], onChanged, setMsg }) {
  const [abierto, setAbierto] = useState(null);   // _id del mensaje abierto
  const noLeidos = contarNoLeidos(mensajes);

  /**
   * Abrir un mensaje lo marca como leído. La lista se recarga después de
   * escribir, para que el punto desaparezca sin depender de un estado local
   * que podría desincronizarse del documento real.
   */
  const abrir = async (m) => {
    setAbierto(m._id);
    if (m.leido === true) return;
    try {
      await marcarLeido(m._id);
      await onChanged?.();
    } catch (err) {
      setMsg("No se pudo marcar como leído: " + err.message);
    }
  };

  const borrar = async (m) => {
    if (!confirm(
      `¿Eliminar la consulta ${m.numeroConsulta || ""} de ${m.nombre}?\n\nNo se puede deshacer.`
    )) return;
    try {
      await eliminarMensaje(m._id);
      if (abierto === m._id) setAbierto(null);
      setMsg("✓ Mensaje eliminado.");
      await onChanged?.();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  };

  const mensajeAbierto = mensajes.find(m => m._id === abierto) || null;
  if (mensajeAbierto) {
    return (
      <DetalleMensaje
        mensaje={mensajeAbierto}
        onVolver={() => setAbierto(null)}
        onBorrar={() => borrar(mensajeAbierto)}
        setMsg={setMsg}
      />
    );
  }

  return (
    <>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 12, marginBottom: 20, flexWrap: "wrap",
      }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Mensajería</h2>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {mensajes.length} consulta{mensajes.length !== 1 ? "s" : ""}
          {noLeidos > 0 && (
            <> · <strong style={{ color: "var(--accent)" }}>{noLeidos} sin leer</strong></>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
        Consultas del formulario de contacto del sitio público, de la más reciente
        a la más vieja. Abrir una la marca como leída.
      </p>

      {mensajes.length === 0 ? (
        <div style={{
          padding: 48, textAlign: "center", color: "var(--muted)",
          border: "1px solid var(--line)", background: "var(--bg-alt)",
        }}>
          Todavía no entró ninguna consulta.
        </div>
      ) : (
        <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
          <div style={{ minWidth: 760 }}>
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
              color: "var(--muted)", fontWeight: 700,
            }}>
              <div>Consulta</div><div>Nombre</div><div>Email</div><div>Fecha</div><div></div>
            </div>

            {mensajes.map(m => {
              const sinLeer = m.leido !== true;
              return (
                <div
                  key={m._id}
                  style={{
                    display: "grid", gridTemplateColumns: COL, gap: 12,
                    padding: "14px 12px", borderBottom: "1px solid var(--line)",
                    fontSize: 13, alignItems: "center",
                    // Igual que una bandeja de mail: lo no leído pesa más.
                    background: sinLeer ? "var(--bg-alt)" : "transparent",
                    fontWeight: sinLeer ? 700 : 400,
                    cursor: "pointer",
                  }}
                  onClick={() => abrir(m)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: sinLeer ? "var(--accent)" : "transparent",
                    }} title={sinLeer ? "Sin leer" : "Leído"} />
                    <span style={{ fontSize: 12, color: sinLeer ? "var(--text)" : "var(--muted)" }}>
                      {m.numeroConsulta || "—"}
                    </span>
                  </div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.nombre}
                  </div>
                  <div style={{
                    color: "var(--muted)", fontWeight: 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {m.email}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>
                    {fmtFecha(m.createdAt)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); borrar(m); }}
                    style={{ ...actionBtn, color: "#c64138", justifyContent: "center" }}
                    title="Eliminar mensaje"
                  >
                    <Icon.trash size={14}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Detalle ─────────────────────────────────────────────────────────

function DetalleMensaje({ mensaje, onVolver, onBorrar, setMsg }) {
  const copiarEmail = async () => {
    try {
      await navigator.clipboard.writeText(mensaje.email);
      setMsg("✓ Email copiado al portapapeles.");
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS) el email igual está a la
      // vista y se puede seleccionar a mano.
      setMsg("No se pudo copiar. Seleccionalo a mano: " + mensaje.email);
    }
  };

  return (
    <>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 12, marginBottom: 20, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)" }}>
            Mensajería / {mensaje.numeroConsulta || "Sin número"}
          </div>
          <h2 style={{ fontSize: 26, margin: "6px 0 0" }}>{mensaje.nombre}</h2>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TKButton variant="outline" onClick={onBorrar} icon={<Icon.trash size={14}/>}>
            Eliminar
          </TKButton>
          <TKButton variant="outline" onClick={onVolver} icon={<Icon.back size={14}/>}>
            Volver
          </TKButton>
        </div>
      </div>

      <div style={{ padding: 24, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)",
        }}>
          <Dato etiqueta="Email">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <a href={`mailto:${mensaje.email}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                {mensaje.email}
              </a>
              <button
                onClick={copiarEmail}
                style={{ ...actionBtn, fontSize: 11, padding: "4px 8px" }}
                title="Copiar email"
              >
                Copiar
              </button>
            </div>
          </Dato>
          <Dato etiqueta="Recibido">{fmtFecha(mensaje.createdAt)}</Dato>
          <Dato etiqueta="Estado">
            {mensaje.leido === true ? "Leído" : "Sin leer"}
          </Dato>
        </div>

        <div style={{ paddingTop: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            textTransform: "uppercase", color: "var(--muted)", marginBottom: 10,
          }}>
            Mensaje
          </div>
          {/* pre-wrap: el texto llega tal cual lo escribieron, con sus saltos
              de línea, y se renderiza como texto — nunca como HTML. */}
          <div style={{
            fontSize: 15, lineHeight: 1.7, color: "var(--text)",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {mensaje.mensaje}
          </div>
        </div>
      </div>
    </>
  );
}

function Dato({ etiqueta, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
        textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
      }}>
        {etiqueta}
      </div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}
