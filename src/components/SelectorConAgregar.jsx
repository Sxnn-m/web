import { useState, useEffect } from 'react';
import { TKButton, TKInput, Icon } from './UI.jsx';

// ─── Selector con opción de agregar ──────────────────────────────────
// Desplegable de valores ya usados + la posibilidad de cargar uno nuevo sin
// salir del formulario, y de sacar una opción del catálogo.
//
// NO usa un <select> nativo: no admite botones dentro de sus <option>, y la
// papelera de borrado tiene que estar dentro de cada fila de la lista. Es un
// dropdown propio con la misma apariencia, más el manejo de Escape y de clic
// afuera que el nativo daba gratis.
//
// No reutiliza el bloque de materiales del tab Costos porque ese resuelve
// otro problema: edita un mapa material → precio, con una fila y un valor
// por material. Acá se elige UN valor de una lista.

const cajaStyle = {
  width: "100%", padding: "12px 14px",
  background: "var(--bg)", border: "1px solid var(--line)",
  borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 14, color: "var(--text)", outline: "none",
  boxSizing: "border-box", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  textAlign: "left",
};

const opcionStyle = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  width: "100%", padding: "9px 12px", background: "none", border: "none",
  fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
  color: "var(--text)", cursor: "pointer", textAlign: "left",
};

/**
 * @param {string}   value      valor elegido ("" = ninguno)
 * @param {string[]} opciones   valores existentes, ya deduplicados
 * @param {Function} onChange   recibe el valor final (string)
 * @param {Function} [resolver] (texto, opciones) => {valor, existente}; permite
 *                              que el llamador normalice lo que se escribe a
 *                              mano contra lo que ya existe
 * @param {Function} [onAgregar] avisa cuando se creó un valor que NO existía,
 *                              para que el llamador lo persista en su catálogo.
 *                              Los catálogos derivados de un distinct no lo
 *                              necesitan: el valor aparece solo.
 * @param {Function} [onEliminarOpcion] (valor, {seleccionada}) => void. Si
 *                              viene, cada opción de la lista muestra su
 *                              papelera. La confirmación la hace el llamador,
 *                              que es quien sabe qué se lleva puesto el
 *                              borrado (cuántos productos usan ese tag, por
 *                              ejemplo); "seleccionada" avisa si es el valor
 *                              cargado en el formulario abierto.
 */
export function SelectorConAgregar({
  label, value = "", opciones = [], onChange,
  placeholder = "Nuevo...", vacio = "— Sin especificar —",
  hint, resolver, onAgregar, onEliminarOpcion,
}) {
  const [abierto, setAbierto] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");

  // Un valor guardado que ya no está en la lista (su última referencia se
  // borró, o se ocultó la opción) igual tiene que poder verse y conservarse
  // al editar.
  const lista = value && !opciones.includes(value) ? [...opciones, value] : opciones;

  // Escape cierra, como en el select nativo.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const elegir = (v) => { setAviso(""); onChange(v); setAbierto(false); };

  const confirmar = () => {
    const crudo = texto.trim();
    if (!crudo) return;
    const { valor, existente } = resolver
      ? resolver(crudo, opciones)
      : { valor: crudo, existente: opciones.includes(crudo) };
    onChange(valor);
    if (!existente) onAgregar?.(valor);
    setAgregando(false);
    setTexto("");
    // Si escribió "eryone" y ya existía "Eryone", se queda la grafía vieja:
    // conviene decirlo, si no parece que el formulario le cambió lo tipeado.
    setAviso(existente && valor !== crudo ? `Ya existía como "${valor}".` : "");
  };

  const cancelar = () => { setAgregando(false); setTexto(""); };

  const eliminar = (e, opcion) => {
    // Sin esto, el clic en la papelera también elegiría la opción.
    e.stopPropagation();
    setAbierto(false);
    onEliminarOpcion(opcion, { seleccionada: opcion === value });
  };

  const etiqueta = label ? (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
      textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
    }}>{label}</div>
  ) : null;

  if (agregando) {
    return (
      <div>
        {etiqueta}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TKInput
              placeholder={placeholder}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); confirmar(); }
                if (e.key === "Escape") cancelar();
              }}
            />
          </div>
          <TKButton variant="outline" onClick={confirmar} icon={<Icon.plus size={14}/>}>
            Agregar
          </TKButton>
        </div>
        <button
          onClick={cancelar}
          style={{
            background: "none", border: "none", padding: "6px 0 0",
            color: "var(--muted)", fontSize: 11, cursor: "pointer",
          }}
        >
          Cancelar y elegir de la lista
        </button>
      </div>
    );
  }

  return (
    <div>
      {etiqueta}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => { setAviso(""); setAbierto(v => !v); }}
          style={{ ...cajaStyle, borderColor: abierto ? "var(--accent)" : "var(--line)" }}
          aria-haspopup="listbox"
          aria-expanded={abierto}
        >
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: value ? "var(--text)" : "var(--muted)",
          }}>
            {value || vacio}
          </span>
          <span style={{ color: "var(--muted)", flexShrink: 0, fontSize: 9 }}>▼</span>
        </button>

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
                maxHeight: 260, overflowY: "auto",
              }}
            >
              <button type="button" onClick={() => elegir("")}
                style={{ ...opcionStyle, color: "var(--muted)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                {vacio}
              </button>

              {lista.map(o => (
                <div
                  key={o}
                  role="option"
                  aria-selected={o === value}
                  onClick={() => elegir(o)}
                  style={{
                    ...opcionStyle,
                    background: o === value ? "var(--bg-alt)" : "none",
                    fontWeight: o === value ? 600 : 400,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
                  onMouseLeave={e => (e.currentTarget.style.background = o === value ? "var(--bg-alt)" : "none")}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o}
                  </span>
                  {onEliminarOpcion && (
                    <button
                      type="button"
                      onClick={(e) => eliminar(e, o)}
                      title={`Eliminar "${o}" de las opciones`}
                      aria-label={`Eliminar ${o} de las opciones`}
                      style={{
                        background: "none", border: "none", padding: 2, cursor: "pointer",
                        color: "var(--muted)", display: "flex", alignItems: "center", flexShrink: 0,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#c64138")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
                    >
                      <Icon.trash size={13}/>
                    </button>
                  )}
                </div>
              ))}

              <button type="button"
                onClick={() => { setAviso(""); setAbierto(false); setAgregando(true); }}
                style={{ ...opcionStyle, borderTop: "1px solid var(--line)", color: "var(--accent)", fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                + Agregar nueva...
              </button>
            </div>
          </>
        )}
      </div>

      {(aviso || hint) && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          {aviso || hint}
        </div>
      )}
    </div>
  );
}
