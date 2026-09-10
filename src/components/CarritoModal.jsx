import { useState } from 'react';
import { TKButton, Icon, fmtARS, ProductImage } from './UI.jsx';
import { CONTACT } from '../data.js';
import { useCarrito } from '../context/CarritoContext.jsx';
import { subtotalLinea, resumenDePedido, MAX_CANTIDAD } from '../lib/carrito.js';

// ─── Carrito ─────────────────────────────────────────────────────────
// Panel lateral con el detalle del pedido que el cliente armó. El cierre
// del flujo sigue siendo Instagram: acá no se cobra ni se registra nada.

const qtyBtn = {
  background: "none", border: "none", padding: "6px 10px", cursor: "pointer",
  color: "var(--text)", display: "flex", alignItems: "center",
};

export function CarritoModal() {
  const { lineas, total, unidades, cambiar, quitar, abierto, cerrar } = useCarrito();
  const [aviso, setAviso] = useState("");

  if (!abierto) return null;

  /**
   * El deep link de Instagram (ig.me/m/usuario) NO admite texto prellenado:
   * no hay ningún parámetro para pasarle el pedido, a diferencia de wa.me.
   * Se abre el mismo link de siempre y el resumen se deja copiado, para que
   * el cliente lo pegue en vez de reescribir todo de memoria.
   */
  const consultar = async () => {
    const resumen = resumenDePedido(lineas);
    try {
      await navigator.clipboard.writeText(resumen);
      setAviso("Resumen copiado — pegalo en el chat de Instagram.");
    } catch {
      setAviso("Copiá el resumen de abajo y pegalo en el chat.");
    }
    window.open(CONTACT.instagramDmUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div
        onClick={cerrar}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 190,
        }}
      />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 191,
        width: "min(440px, 100vw)", background: "var(--bg)",
        borderLeft: "1px solid var(--line)", boxShadow: "-12px 0 40px rgba(0,0,0,.18)",
        display: "flex", flexDirection: "column",
      }}>
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 24px", borderBottom: "1px solid var(--line)",
        }}>
          <div>
            <div style={{ fontSize: 20, letterSpacing: -0.3 }}>Tu pedido</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {unidades} {unidades === 1 ? "unidad" : "unidades"}
            </div>
          </div>
          <button onClick={cerrar} aria-label="Cerrar carrito" style={{
            background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4,
          }}>
            <Icon.close size={20}/>
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }}>
          {lineas.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              Todavía no agregaste nada.
            </div>
          ) : lineas.map(l => (
            <div key={l.clave} style={{
              display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 14,
              padding: "18px 0", borderBottom: "1px solid var(--line)", alignItems: "start",
            }}>
              <div style={{ width: 64 }}>
                <ProductImage src={l.img} alt={l.nombre}/>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{l.nombre}</div>

                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, color: "var(--muted)", marginTop: 4,
                }}>
                  {l.colorHex && (
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: l.colorHex, border: "1px solid var(--line-strong)", flexShrink: 0,
                    }}/>
                  )}
                  {l.colorNombre || "Sin color elegido"}
                </div>

                {/* Qué se eligió en cada grupo de variante de insumo: es lo
                    que explica por qué esta línea sale distinto que otra del
                    mismo producto. */}
                {l.opcionesTexto && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    {l.opcionesTexto}
                  </div>
                )}

                {l.texto && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    Texto: <strong style={{ color: "var(--text)" }}>"{l.texto}"</strong>
                  </div>
                )}

                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  {fmtARS(l.precioUnitario)} c/u
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-strong)" }}>
                    <button onClick={() => cambiar(l.clave, l.cantidad - 1)}
                      aria-label="Restar uno" style={qtyBtn}>
                      <Icon.minus size={13}/>
                    </button>
                    <span style={{ padding: "0 12px", fontSize: 14, minWidth: 20, textAlign: "center" }}>
                      {l.cantidad}
                    </span>
                    <button onClick={() => cambiar(l.clave, l.cantidad + 1)}
                      disabled={l.cantidad >= MAX_CANTIDAD}
                      aria-label="Sumar uno" style={qtyBtn}>
                      <Icon.plus size={13}/>
                    </button>
                  </div>
                  <button onClick={() => quitar(l.clave)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", padding: 4, display: "flex",
                  }} title="Quitar del pedido" aria-label={`Quitar ${l.nombre}`}>
                    <Icon.trash size={14}/>
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>
                {fmtARS(subtotalLinea(l))}
              </div>
            </div>
          ))}
        </div>

        {lineas.length > 0 && (
          <footer style={{ padding: "20px 24px", borderTop: "1px solid var(--line)" }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", marginBottom: 16,
            }}>
              <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)" }}>
                Total
              </span>
              <strong style={{ fontSize: 26, color: "var(--accent)", letterSpacing: -0.5 }}>
                {fmtARS(total)}
              </strong>
            </div>

            <TKButton size="lg" full icon={<Icon.ig size={16}/>} onClick={consultar}>
              Consultar por Instagram — {fmtARS(total)}
            </TKButton>

            {aviso && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
                {aviso}
              </div>
            )}

            {/* Instagram no acepta texto prellenado en el link, así que el
                resumen queda acá a mano para copiarlo si el portapapeles
                falló o el navegador lo bloqueó. */}
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
                Ver resumen para copiar
              </summary>
              <pre style={{
                marginTop: 8, padding: 12, background: "var(--bg-alt)",
                border: "1px solid var(--line)", borderRadius: 4,
                fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap",
                fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--text)",
                maxHeight: 180, overflowY: "auto",
              }}>
                {resumenDePedido(lineas)}
              </pre>
            </details>

            <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, margin: "12px 0 0" }}>
              El pedido se cierra por Instagram. Todavía no es una compra:
              coordinamos plazo y entrega por chat.
            </p>
          </footer>
        )}
      </aside>
    </>
  );
}
