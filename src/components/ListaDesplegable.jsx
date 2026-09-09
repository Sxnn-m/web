import { useState, useEffect, useRef } from 'react';

// ─── Lista desplegable ───────────────────────────────────────────────
// El desplegable estilizado del backoffice, con o sin buscador. Nació dentro
// del selector de producto del formulario de pedidos y se extrajo para que la
// variante de color y los grupos de variante de insumo usen exactamente el
// mismo control: con <select> nativos la fila mezclaba dos estéticas, y el
// nativo no deja pintar cada fila (una opción sin stock, una aclaración).
//
// No reemplaza a SelectorConAgregar: ese resuelve otra cosa —elegir de un
// distinct y poder CREAR un valor nuevo ahí mismo— sobre listas que el
// usuario administra. Acá las opciones son fijas (los productos que existen,
// las variantes que tiene el producto) y no hay nada que agregar.

const cajaStyle = {
  width: "100%", padding: "12px 14px",
  background: "var(--bg)", border: "1px solid var(--line)",
  borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 13, color: "var(--text)", outline: "none",
  boxSizing: "border-box", cursor: "pointer", textAlign: "left",
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
};

/**
 * @param {Array} opciones  [{ id, nombre, etiqueta?, detalle?, nota?, deshabilitada? }]
 *   - detalle: segunda línea en gris dentro de la fila
 *   - nota: se muestra al lado del nombre (ej. "· sin stock")
 *   - etiqueta: qué mostrar en la caja YA elegida, si no alcanza con el
 *     nombre. En la fila el nombre y el detalle se ven juntos, pero cerrada
 *     queda una sola línea y puede hacer falta más (ej. el código del producto,
 *     que en la lista vive en el detalle)
 * @param {string}  valor          id elegido ("" = ninguno)
 * @param {Function} onElegir      recibe el id
 * @param {string}  [vacio]        qué mostrar sin nada elegido
 * @param {boolean} [conBuscador]  filtra por texto mientras se escribe
 * @param {Function} [coincide]    (opcion, textoEnMinúsculas) => boolean
 * @param {boolean} [invalido]     borde rojo: falta elegir
 * @param {boolean} [deshabilitado]
 * @param {boolean} [permiteVaciar] agrega una fila para volver a "sin elegir"
 */
export function ListaDesplegable({
  opciones = [], valor = "", onElegir, vacio = "— Elegir —",
  conBuscador = false, coincide, placeholder, titulo,
  invalido = false, deshabilitado = false, permiteVaciar = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const entrada = useRef(null);

  const elegida = opciones.find(o => o.id === valor) || null;

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // Al abrir con buscador, el foco va al campo: se puede tipear de una.
  useEffect(() => {
    if (abierto && conBuscador) entrada.current?.focus();
  }, [abierto, conBuscador]);

  const q = texto.trim().toLowerCase();
  const filtro = coincide || ((o, t) =>
    `${o.nombre || ""} ${o.detalle || ""}`.toLowerCase().includes(t));
  const visibles = conBuscador && q ? opciones.filter(o => filtro(o, q)) : opciones;

  const elegir = (o) => {
    if (o?.deshabilitada) return;
    onElegir(o ? o.id : "");
    setTexto("");
    setAbierto(false);
  };

  const abrir = () => {
    if (deshabilitado) return;
    setTexto("");
    setAbierto(v => !v);
  };

  return (
    <div style={{ position: "relative" }}>
      {abierto && conBuscador ? (
        <input
          ref={entrada}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder={placeholder || "Buscar..."}
          style={{ ...cajaStyle, borderColor: "var(--accent)", display: "block", cursor: "text" }}
        />
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={deshabilitado}
          title={titulo}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          style={{
            ...cajaStyle,
            borderColor: abierto ? "var(--accent)" : invalido ? "#c64138" : "var(--line)",
            opacity: deshabilitado ? 0.55 : 1,
            cursor: deshabilitado ? "not-allowed" : "pointer",
          }}
        >
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: elegida ? "var(--text)" : "var(--muted)",
          }}>
            {elegida ? (elegida.etiqueta || elegida.nombre) : vacio}
          </span>
          <span style={{ color: "var(--muted)", flexShrink: 0, fontSize: 9 }}>▼</span>
        </button>
      )}

      {abierto && (
        <>
          {/* Capa para cerrar al tocar afuera, como hace el select nativo. */}
          <div onClick={() => setAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 78 }}/>
          <div
            role="listbox"
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 79,
              background: "var(--bg)", border: "1px solid var(--line-strong)",
              borderRadius: 4, boxShadow: "0 12px 32px rgba(0,0,0,.16)",
              maxHeight: 260, overflowY: "auto", minWidth: 180,
            }}
          >
            {permiteVaciar && (
              <div
                role="option"
                aria-selected={!valor}
                onMouseDown={() => elegir(null)}
                style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13,
                  color: "var(--muted)", borderBottom: "1px solid var(--line)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {vacio}
              </div>
            )}

            {visibles.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)" }}>
                Sin coincidencias
              </div>
            ) : visibles.map(o => (
              <div
                key={o.id}
                role="option"
                aria-selected={o.id === valor}
                aria-disabled={o.deshabilitada || undefined}
                // mousedown y no click: con buscador, el blur del input llega
                // antes que el click y se perdería la elección.
                onMouseDown={() => elegir(o)}
                style={{
                  padding: "10px 12px", fontSize: 13,
                  cursor: o.deshabilitada ? "not-allowed" : "pointer",
                  opacity: o.deshabilitada ? 0.5 : 1,
                  borderBottom: "1px solid var(--line)",
                  background: o.id === valor ? "var(--bg-alt)" : "transparent",
                  fontWeight: o.id === valor ? 600 : 400,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
                onMouseLeave={e => (e.currentTarget.style.background =
                  o.id === valor ? "var(--bg-alt)" : "transparent")}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.nombre}
                  </span>
                  {o.nota && (
                    <span style={{ fontSize: 11, color: "#B56B3E", whiteSpace: "nowrap" }}>
                      {o.nota}
                    </span>
                  )}
                </div>
                {o.detalle && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{o.detalle}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
