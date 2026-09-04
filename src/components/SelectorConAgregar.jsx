import { useState } from 'react';
import { TKButton, TKInput, Icon } from './UI.jsx';

// ─── Selector con opción de agregar ──────────────────────────────────
// Desplegable de valores ya usados + la posibilidad de cargar uno nuevo sin
// salir del formulario. Pensado para catálogos que no tienen colección
// propia y se derivan de los datos existentes (marcas de filamento, por
// ejemplo): la lista se arma con un distinct y crece sola.
//
// No reutiliza el bloque de materiales del tab Costos porque ese resuelve
// otro problema: edita un mapa material → precio, con una fila y un valor
// por material. Acá se elige UN valor de una lista. Mismo aspecto, otra
// estructura de datos.

const selectStyle = {
  width: "100%", padding: "12px 14px",
  background: "var(--bg)", border: "1px solid var(--line)",
  borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 14, color: "var(--text)", outline: "none",
  boxSizing: "border-box", cursor: "pointer",
};

const NUEVO = "__nuevo__";

/**
 * @param {string}   value      valor elegido ("" = ninguno)
 * @param {string[]} opciones   valores existentes, ya deduplicados
 * @param {Function} onChange   recibe el valor final (string)
 * @param {Function} [resolver] (texto, opciones) => {valor, existente}; permite
 *                              que el llamador normalice lo que se escribe a
 *                              mano contra lo que ya existe
 */
export function SelectorConAgregar({
  label, value = "", opciones = [], onChange,
  placeholder = "Nuevo...", vacio = "— Sin especificar —",
  hint, resolver,
}) {
  const [agregando, setAgregando] = useState(false);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");

  // Un valor guardado que ya no está en la lista (su último filamento se
  // borró) igual tiene que poder verse y conservarse al editar.
  const lista = value && !opciones.includes(value) ? [...opciones, value] : opciones;

  const confirmar = () => {
    const crudo = texto.trim();
    if (!crudo) return;
    const { valor, existente } = resolver
      ? resolver(crudo, opciones)
      : { valor: crudo, existente: opciones.includes(crudo) };
    onChange(valor);
    setAgregando(false);
    setTexto("");
    // Si escribió "eryone" y ya existía "Eryone", se queda la grafía vieja:
    // conviene decirlo, si no parece que el formulario le cambió lo tipeado.
    setAviso(existente && valor !== crudo ? `Ya existía como "${valor}".` : "");
  };

  const cancelar = () => { setAgregando(false); setTexto(""); };

  if (agregando) {
    return (
      <div>
        {label && (
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
            textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
          }}>{label}</div>
        )}
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
      {label && (
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
          textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
        }}>{label}</div>
      )}
      <select
        value={value}
        onChange={e => {
          if (e.target.value === NUEVO) { setAviso(""); setAgregando(true); return; }
          setAviso("");
          onChange(e.target.value);
        }}
        style={selectStyle}
      >
        <option value="">{vacio}</option>
        {lista.map(o => <option key={o} value={o}>{o}</option>)}
        <option value={NUEVO}>+ Agregar nueva...</option>
      </select>
      {(aviso || hint) && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          {aviso || hint}
        </div>
      )}
    </div>
  );
}
