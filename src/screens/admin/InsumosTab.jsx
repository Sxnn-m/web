import { useState } from 'react';
import { TKButton, TKInput, Icon, fmtARS } from '../../components/UI.jsx';
import { UMBRAL_RESTOCK_INSUMO, necesitaRestockInsumo } from '../../lib/disponibilidad.js';
import { crearInsumo, actualizarInsumo, eliminarInsumo } from '../../lib/insumos.js';
import { RestockBadge } from './InventarioTab.jsx';

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

// ─── Tab Insumos ─────────────────────────────────────────────────────
// Catálogo de componentes que no son filamento: imanes, tornillos, LEDs.
// Mismo patrón visual que el tab Inventario, pero el stock se cuenta en
// unidades y la alerta salta en <= UMBRAL_RESTOCK_INSUMO.
export function InsumosTab({ insumos, onChanged, setMsg }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", precioUnidad: 0, cantidadDisponible: 0 });

  const openNuevo = () => {
    setEditando(null);
    setForm({ nombre: "", precioUnidad: 0, cantidadDisponible: 0 });
    setShowForm(true);
  };

  const openEditar = (i) => {
    setEditando(i);
    setForm({
      nombre: i.nombre || "",
      precioUnidad: i.precioUnidad ?? 0,
      cantidadDisponible: i.cantidadDisponible ?? 0,
    });
    setShowForm(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return alert("El nombre es obligatorio.");
    try {
      if (editando) {
        await actualizarInsumo(editando._id, form);
        setMsg("✓ Insumo actualizado.");
      } else {
        await crearInsumo(form);
        setMsg("✓ Insumo creado.");
      }
      setShowForm(false);
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const borrar = async (i) => {
    if (!confirm(
      `¿Eliminar el insumo "${i.nombre}"?\n\n` +
      `Los productos que lo usen van a quedar NO disponibles hasta que les saques la línea.`
    )) return;
    try {
      await eliminarInsumo(i._id);
      setMsg("✓ Insumo eliminado.");
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const enAlerta = insumos.filter(necesitaRestockInsumo).length;
  const COL = "2fr 120px 120px 140px 90px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Catálogo de insumos</h2>
        <TKButton onClick={openNuevo} icon={<Icon.plus size={14}/>}>Nuevo insumo</TKButton>
      </div>

      {showForm && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>
            {editando ? "Editar insumo" : "Nuevo insumo"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 160px 160px", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="Nombre" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Imán neodimio 10mm" />
            <TKInput label="Precio por unidad (ARS)" type="number" value={form.precioUnidad}
              onChange={e => setForm(f => ({ ...f, precioUnidad: e.target.value }))} />
            <TKInput label="Cantidad disponible" type="number" value={form.cantidadDisponible}
              onChange={e => setForm(f => ({ ...f, cantidadDisponible: e.target.value }))} />
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
            El precio por unidad se copia al producto cuando lo agregás a su receta de insumos.
            Cambiarlo acá <strong>no</strong> recalcula los productos ya guardados: cada producto
            conserva el precio que tenía al momento de guardarse.
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <TKButton onClick={guardar}>{editando ? "Guardar cambios" : "Crear"}</TKButton>
            <TKButton variant="outline" onClick={() => setShowForm(false)}>Cancelar</TKButton>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {insumos.length} insumo{insumos.length !== 1 ? "s" : ""}
        {enAlerta > 0 && <> · <span style={{ color: "#c64138", fontWeight: 700 }}>
          {enAlerta} en {UMBRAL_RESTOCK_INSUMO} unidades o menos
        </span></>}
      </div>

      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 700 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Nombre</div><div>Precio unidad</div><div>Disponible</div><div>Alerta</div><div>Acciones</div>
          </div>

          {insumos.map(i => {
            const alerta = necesitaRestockInsumo(i);
            const negativo = Number(i.cantidadDisponible || 0) < 0;
            return (
              <div key={i._id} style={{
                display: "grid", gridTemplateColumns: COL,
                gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
                fontSize: 13, alignItems: "center",
                background: alerta ? "#c6413808" : "transparent",
              }}>
                <div style={{ fontWeight: 600 }}>{i.nombre}</div>
                <div>{fmtARS(i.precioUnidad || 0)}</div>
                <div style={{ fontWeight: 700, color: alerta ? "#c64138" : "var(--text)" }}>
                  {Number(i.cantidadDisponible || 0)} u.
                  {negativo && (
                    <div style={{ fontSize: 10, fontWeight: 400 }}>faltan unidades</div>
                  )}
                </div>
                <div>{alerta ? <RestockBadge/> : <span style={{ color: "var(--muted)", fontSize: 12 }}>OK</span>}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => openEditar(i)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
                  <button onClick={() => borrar(i)} style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"><Icon.trash size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {insumos.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No hay insumos cargados. Creá el primero para poder usarlo en las recetas de productos.
        </div>
      )}
    </>
  );
}
