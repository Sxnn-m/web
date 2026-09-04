import { useState } from 'react';
import { TKButton, TKInput, Icon } from '../../components/UI.jsx';
import { UMBRAL_RESTOCK, necesitaRestock } from '../../lib/disponibilidad.js';
import { crearFilamento, actualizarFilamento, eliminarFilamento } from '../../lib/inventario.js';
import { marcasDeFilamentos, resolverMarca } from '../../lib/marcas.js';
import { SelectorConAgregar } from '../../components/SelectorConAgregar.jsx';
import { DetalleHistorial, RestockBadge, fmtFecha } from './DetalleHistorial.jsx';

// Se reexportan para no romper a quien ya los importaba desde acá.
export { RestockBadge, fmtFecha };

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

// ─── Tab Inventario ──────────────────────────────────────────────────
export function InventarioTab({ filamentos, onChanged, setMsg }) {
  const [seleccionado, setSeleccionado] = useState(null); // _id del filamento abierto
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ material: "", color: "", marca: "", cantidadGramos: 0 });

  const abierto = filamentos.find(f => f._id === seleccionado) || null;

  // La lista de marcas es un distinct sobre los filamentos: no hay colección
  // aparte, una marca vive mientras la use al menos un rollo.
  const marcas = marcasDeFilamentos(filamentos);

  const openNuevo = () => {
    setEditando(null);
    setForm({ material: "", color: "", marca: "", cantidadGramos: 0 });
    setShowForm(true);
  };

  const openEditar = (f) => {
    setEditando(f);
    setForm({
      material: f.material || "", color: f.color || "",
      marca: f.marca || "", cantidadGramos: f.cantidadGramos || 0,
    });
    setShowForm(true);
  };

  const guardar = async () => {
    if (!form.material.trim() || !form.color.trim()) {
      return alert("Material y color son obligatorios.");
    }
    try {
      if (editando) {
        await actualizarFilamento(editando._id, form);
        setMsg("✓ Filamento actualizado.");
      } else {
        await crearFilamento(form);
        setMsg("✓ Filamento creado.");
      }
      setShowForm(false);
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const borrar = async (f) => {
    if (!confirm(`¿Eliminar el filamento "${f.material} ${f.color}"? Se pierde su historial.`)) return;
    try {
      await eliminarFilamento(f._id);
      if (seleccionado === f._id) setSeleccionado(null);
      setMsg("✓ Filamento eliminado.");
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  if (abierto) {
    return (
      <DetalleHistorial
        coleccion="filamentos"
        item={abierto}
        titulo={`${abierto.material} · ${abierto.color}`}
        subtitulo={abierto.marca ? `Inventario / Filamento · ${abierto.marca}` : "Inventario / Filamento"}
        cantidad={abierto.cantidadGramos}
        unidad="g"
        alerta={necesitaRestock(abierto)}
        conDesperdicio
        onBack={() => setSeleccionado(null)}
        onChanged={onChanged}
        setMsg={setMsg}
      />
    );
  }

  const enAlerta = filamentos.filter(necesitaRestock).length;
  const COL = "1.2fr 1fr 1fr 120px 140px 90px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Inventario de filamento</h2>
        <TKButton onClick={openNuevo} icon={<Icon.plus size={14}/>}>Nuevo filamento</TKButton>
      </div>

      {showForm && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>
            {editando ? "Editar filamento" : "Nuevo filamento"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 160px", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="Material" value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} placeholder="PLA" />
            <TKInput label="Color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="Negro" />
            <SelectorConAgregar
              label="Marca"
              value={form.marca}
              opciones={marcas}
              onChange={marca => setForm(f => ({ ...f, marca }))}
              resolver={resolverMarca}
              placeholder="Nueva marca..."
              hint="Elegí una de la lista o agregá una nueva."
            />
            <TKInput label="Cantidad (g)" type="number" value={form.cantidadGramos} onChange={e => setForm(f => ({ ...f, cantidadGramos: e.target.value }))} />
          </div>
          {editando && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
              Para sumar material usá "Registrar restock" en el detalle: queda asentado en el historial.
            </div>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <TKButton onClick={guardar}>{editando ? "Guardar cambios" : "Crear"}</TKButton>
            <TKButton variant="outline" onClick={() => setShowForm(false)}>Cancelar</TKButton>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {filamentos.length} filamento{filamentos.length !== 1 ? "s" : ""}
        {enAlerta > 0 && <> · <span style={{ color: "#c64138", fontWeight: 700 }}>{enAlerta} por debajo de {UMBRAL_RESTOCK} g</span></>}
      </div>

      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 700 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Material</div><div>Color</div><div>Marca</div><div>Cantidad</div><div>Alerta</div><div>Acciones</div>
          </div>

          {filamentos.map(f => {
            const alerta = necesitaRestock(f);
            return (
              <div key={f._id} style={{
                display: "grid", gridTemplateColumns: COL,
                gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
                fontSize: 13, alignItems: "center",
                background: alerta ? "#c6413808" : "transparent",
              }}>
                <div
                  onClick={() => setSeleccionado(f._id)}
                  style={{ fontWeight: 600, cursor: "pointer", color: "var(--accent)" }}
                  title="Ver historial"
                >
                  {f.material}
                </div>
                <div onClick={() => setSeleccionado(f._id)} style={{ cursor: "pointer" }}>{f.color}</div>
                <div style={{ color: f.marca ? "var(--text)" : "var(--muted)" }}>{f.marca || "—"}</div>
                <div style={{ fontWeight: 700, color: alerta ? "#c64138" : "var(--text)" }}>
                  {Number(f.cantidadGramos || 0).toLocaleString("es-AR")} g
                </div>
                <div>{alerta ? <RestockBadge/> : <span style={{ color: "var(--muted)", fontSize: 12 }}>OK</span>}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setSeleccionado(f._id)} style={actionBtn} title="Ver detalle"><Icon.list size={14}/></button>
                  <button onClick={() => openEditar(f)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
                  <button onClick={() => borrar(f)} style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"><Icon.trash size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filamentos.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No hay filamentos cargados. Creá el primero para empezar a controlar el stock.
        </div>
      )}
    </>
  );
}
