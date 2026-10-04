// ─── Detalle de un gasto ─────────────────────────────────────────────
// Tiene su propia URL (/admin/finanzas/gastos/:id) y se carga por ID, así que
// el link se puede guardar y abrir directo: no depende de que la lista esté
// cargada ni de haber pasado por ella.
//
// El campo grande es el motivo de que esta vista exista: la descripción de la
// lista tiene que entrar en una fila, y lo que se compró de verdad —marcas,
// cantidades, de dónde— no entra ahí.

import { useState, useEffect } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import {
  cargarGasto, actualizarGasto, guardarDetalleGasto, eliminarGasto,
  inputDesdeFecha, validarMovimiento,
} from '../../lib/finanzas.js';

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

export function DetalleGasto({ gastoId, onVolver, onCambios, setMsg }) {
  const [gasto, setGasto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState("");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ fecha: "", descripcion: "", monto: "" });
  const [errores, setErrores] = useState({});

  const cargar = async () => {
    try {
      const g = await cargarGasto(gastoId);
      setGasto(g);
      setDetalle(g?.detalle || "");
      if (g) setForm({
        fecha: inputDesdeFecha(g.fecha),
        descripcion: g.descripcion || "",
        monto: String(g.monto ?? ""),
      });
    } catch (err) {
      setMsg("Error al cargar el gasto: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [gastoId]);

  const guardarDetalle = async () => {
    setGuardando(true);
    try {
      await guardarDetalleGasto(gastoId, detalle);
      setMsg("✓ Detalle guardado.");
      await cargar();
      await onCambios?.();
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  const guardarDatos = async () => {
    const { valido, errores: errs } = validarMovimiento(form);
    setErrores(errs);
    if (!valido) return;
    setGuardando(true);
    try {
      await actualizarGasto(gastoId, form);
      setEditando(false);
      setMsg("✓ Gasto actualizado.");
      await cargar();
      await onCambios?.();
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  const borrar = async () => {
    if (!confirm(`¿Eliminar el gasto ${gasto.numeroGasto} (${gasto.descripcion})?`)) return;
    setGuardando(true);
    try {
      await eliminarGasto(gastoId);
      setMsg("✓ Gasto eliminado.");
      await onCambios?.();
      onVolver();
    } catch (err) {
      setMsg("Error: " + err.message);
      setGuardando(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, color: "var(--muted)" }}>Cargando gasto...</div>;
  }

  // Entrar por un link a un gasto borrado tiene que decir qué pasó, no quedar
  // en blanco ni volver solo: el que abrió el link merece saber por qué.
  if (!gasto) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 28, margin: 0 }}>Gasto no encontrado</h2>
          <TKButton variant="ghost" onClick={onVolver} icon={<Icon.back size={14}/>}>Volver</TKButton>
        </div>
        <div style={{ ...cardStyle, color: "var(--muted)", fontSize: 13 }}>
          Este gasto ya no existe: puede haberse eliminado desde la lista.
        </div>
      </>
    );
  }

  const fecha = typeof gasto.fecha?.toDate === "function" ? gasto.fecha.toDate() : gasto.fecha;
  const fechaTexto = fecha
    ? new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Finanzas / Gasto
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TKPill variant="outline">{gasto.numeroGasto}</TKPill>
            <h2 style={{ fontSize: 28, margin: 0 }}>{gasto.descripcion}</h2>
          </div>
        </div>
        <TKButton variant="ghost" onClick={onVolver} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap", margin: "20px 0 24px" }}>
        <div style={{ padding: "16px 22px", background: "var(--bg-alt)", borderLeft: "3px solid #B56B3E" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
            Monto
          </div>
          <div style={{ fontSize: 28 }}>{fmtARS(gasto.monto || 0)}</div>
        </div>
        <div style={{ padding: "16px 22px", background: "var(--bg-alt)", borderLeft: "3px solid var(--line)" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
            Fecha
          </div>
          <div style={{ fontSize: 28 }}>{fechaTexto}</div>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <TKButton variant="outline" onClick={() => setEditando(v => !v)} icon={<Icon.spark size={14}/>}>
            {editando ? "Cancelar edición" : "Editar datos"}
          </TKButton>
          <TKButton variant="outline" onClick={borrar} disabled={guardando}>Eliminar gasto</TKButton>
        </div>
      </div>

      {editando && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>Editar datos del gasto</div>
          {/* El número no está: es el correlativo, y editarlo lo dejaría sin
              servir para lo único que sirve, que es identificar la compra. */}
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 16 }}>
            El número {gasto.numeroGasto} no se puede cambiar: es el correlativo.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 170px", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="Fecha" type="date" value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} error={errores.fecha}/>
            <TKInput label="Descripción" value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} error={errores.descripcion}/>
            <TKInput label="Monto" type="number" value={form.monto}
              onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} error={errores.monto}/>
          </div>
          {Object.values(errores).filter(Boolean).length > 0 && (
            <div style={{ fontSize: 12, color: "#c64138", marginBottom: 12 }}>
              {Object.values(errores).filter(Boolean).join(" ")}
            </div>
          )}
          <TKButton onClick={guardarDatos} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </TKButton>
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: 18, marginBottom: 4 }}>Detalle de la compra</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12 }}>
          Qué se compró, cuánto de cada cosa y dónde. Texto libre, para lo que no entra
          en la descripción de la lista.
        </div>
        <textarea
          value={detalle}
          onChange={e => setDetalle(e.target.value)}
          rows={12}
          placeholder={"2 rollos PLA negro Grilon3 — $ 18.000 c/u\n1 kg PETG verde — $ 24.000\nComprado en ..."}
          style={{
            width: "100%", padding: "12px 14px", background: "var(--bg)",
            border: "1px solid var(--line)", borderRadius: 4, resize: "vertical",
            fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
            color: "var(--text)", outline: "none", lineHeight: 1.6,
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
          <TKButton onClick={guardarDetalle} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar detalle"}
          </TKButton>
          {/* El aviso de guardado sale por el banner del backoffice, el mismo
              que usa el resto. Acá solo se marca si quedó algo sin guardar. */}
          {detalle !== (gasto.detalle || "") && (
            <span style={{ fontSize: 12, color: "#B56B3E" }}>Hay cambios sin guardar.</span>
          )}
        </div>
      </div>
    </>
  );
}
