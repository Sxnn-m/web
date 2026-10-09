// ─── El monto de un gasto ────────────────────────────────────────────
// Por defecto no se escribe: es la suma de los ítems y se recalcula sola
// mientras se cargan. El interruptor lo desengancha, igual que el precio
// manual de un producto en el formulario del catálogo.
//
// Vive en su propio archivo porque lo usan las dos pantallas —el alta y
// "Editar datos" del detalle— y tiene una regla que no se puede duplicar sin
// que se desincronicen: al apagar el modo manual, lo escrito a mano se
// descarta y vuelve a mandar la suma.

import { TKInput, fmtARS } from '../../components/UI.jsx';

const rotulo = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

/**
 * @param {boolean} manual      si el monto lo escribe una persona
 * @param {string}  valor       lo escrito a mano (solo cuenta con manual)
 * @param {number}  suma        lo que suman los ítems ahora mismo
 * @param {boolean} hayItems    para no prometer una suma que no existe
 */
export function MontoDeGasto({ manual, valor, suma, hayItems, error, onToggle, onChange }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ ...rotulo, marginBottom: 0 }}>Monto</div>
        <label style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 11,
          color: "var(--muted)", cursor: "pointer", whiteSpace: "nowrap",
        }}>
          <input
            type="checkbox"
            checked={manual}
            onChange={e => onToggle(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer" }}
          />
          Editar monto manualmente
        </label>
      </div>

      {manual ? (
        <>
          <TKInput type="number" value={valor} onChange={e => onChange(e.target.value)}
            error={error} placeholder="15000"/>
          {/* Referencia, no advertencia: que el manual no coincida con los
              ítems es una decisión válida —un descuento, un redondeo— y no
              algo que haya que marcar en rojo. */}
          {hayItems && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>
              Los ítems suman {fmtARS(suma)}.
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{
            padding: "12px 14px", background: "var(--bg)",
            border: "1px dashed var(--line)", borderRadius: 4,
            fontSize: 14, fontWeight: 600,
          }}>
            {fmtARS(suma)}
          </div>
          <div style={{ fontSize: 11, color: error ? "#c64138" : "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>
            {error || (hayItems
              ? "(calculado desde los ítems)"
              : "(calculado desde los ítems) Agregá ítems, o activá el monto manual.")}
          </div>
        </>
      )}
    </div>
  );
}
