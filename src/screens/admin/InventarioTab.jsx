import { useState, useEffect } from 'react';
import { TKButton, TKInput, Icon } from '../../components/UI.jsx';
import { UMBRAL_RESTOCK, necesitaRestock } from '../../lib/disponibilidad.js';
import { crearFilamento, actualizarFilamento, eliminarFilamento } from '../../lib/inventario.js';
import {
  materialesUsados, coloresUsados, marcasUsadas, ownersUsados, resolverValor,
} from '../../lib/opcionesFilamento.js';
import { SelectorConAgregar } from '../../components/SelectorConAgregar.jsx';
import { cargarOcultas, ocultarOpcion, filtrarVisibles } from '../../lib/opcionesOcultas.js';
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
  const [form, setForm] = useState(
    { material: "", color: "", marca: "", owner: "", cantidadGramos: 0 });

  const abierto = filamentos.find(f => f._id === seleccionado) || null;

  // Las tres listas son un distinct sobre los filamentos: no hay colecciones
  // aparte, un valor vive mientras lo use al menos un rollo. Por eso "eliminar
  // una opción" no puede borrar nada: se guarda en settings/opcionesOcultas
  // qué valores dejan de sugerirse. Los filamentos que ya los usan quedan
  // intactos y se siguen viendo en el listado de abajo.
  const [ocultas, setOcultas] = useState({ material: [], color: [], marca: [], owner: [] });
  useEffect(() => { cargarOcultas().then(setOcultas); }, []);

  const materiales = filtrarVisibles(materialesUsados(filamentos), ocultas.material);
  const colores = filtrarVisibles(coloresUsados(filamentos), ocultas.color);
  const marcas = filtrarVisibles(marcasUsadas(filamentos), ocultas.marca);
  const owners = filtrarVisibles(ownersUsados(filamentos), ocultas.owner);

  /**
   * Saca un valor de las sugerencias. Se avisa cuántos filamentos lo usan y
   * que NO se van a tocar: es lo que distingue esto de un borrado real.
   */
  const eliminarOpcion = async (campo, valor, { seleccionada }) => {
    const enUso = filamentos.filter(
      f => String(f?.[campo] || "").trim().toLowerCase() === valor.trim().toLowerCase()
    ).length;
    const detalle = enUso > 0
      ? `\n\n${enUso} filamento(s) lo usan: van a conservarlo y se siguen viendo en el listado, ` +
        `solo deja de sugerirse para los nuevos.`
      : "";
    const usando = seleccionada ? `\n\nLo estás usando en este formulario.` : "";
    if (!confirm(`¿Eliminar "${valor}" de las opciones de ${campo}?${detalle}${usando}`)) return;

    try {
      setOcultas(await ocultarOpcion(campo, valor, ocultas));
      setMsg(`✓ "${valor}" ya no se sugiere como ${campo}.`);
    } catch (err) {
      setMsg("No se pudo eliminar la opción: " + err.message);
    }
  };

  const openNuevo = () => {
    setEditando(null);
    setForm({ material: "", color: "", marca: "", owner: "", cantidadGramos: 0 });
    setShowForm(true);
  };

  const openEditar = (f) => {
    setEditando(f);
    setForm({
      material: f.material || "", color: f.color || "", marca: f.marca || "",
      owner: f.owner || "", cantidadGramos: f.cantidadGramos || 0,
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
        subtitulo={["Inventario / Filamento", abierto.marca, abierto.owner]
          .filter(Boolean).join(" · ")}
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
  const COL = "1.1fr 1fr 1fr 1fr 110px 140px 90px";

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 140px", gap: 16, marginBottom: 16 }} className="form-layout">
            {/* Los cuatro campos usan el mismo combobox. Material y color
                arman la clave con la que las recetas encuentran el filamento,
                así que elegirlos de una lista evita que un typo deje un rollo
                huérfano; resolverValor además pega lo tipeado a la grafía
                existente cuando ya hay una. */}
            <SelectorConAgregar
              label="Material"
              value={form.material}
              opciones={materiales}
              onChange={material => setForm(f => ({ ...f, material }))}
              resolver={resolverValor}
              onEliminarOpcion={(v, info) => eliminarOpcion("material", v, info)}
              placeholder="Nuevo material..."
              hint="Elegí una de la lista o agregá una nueva."
            />
            <SelectorConAgregar
              label="Color"
              value={form.color}
              opciones={colores}
              onChange={color => setForm(f => ({ ...f, color }))}
              resolver={resolverValor}
              onEliminarOpcion={(v, info) => eliminarOpcion("color", v, info)}
              placeholder="Nuevo color..."
              hint="Elegí una de la lista o agregá una nueva."
            />
            <SelectorConAgregar
              label="Marca"
              value={form.marca}
              opciones={marcas}
              onChange={marca => setForm(f => ({ ...f, marca }))}
              resolver={resolverValor}
              onEliminarOpcion={(v, info) => eliminarOpcion("marca", v, info)}
              placeholder="Nueva marca..."
              hint="Elegí una de la lista o agregá una nueva."
            />
            {/* Owner: de quién es el rollo. Opcional y descriptivo, como la
                marca: no participa del matcheo con las recetas. */}
            <SelectorConAgregar
              label="Owner"
              value={form.owner}
              opciones={owners}
              onChange={owner => setForm(f => ({ ...f, owner }))}
              resolver={resolverValor}
              onEliminarOpcion={(v, info) => eliminarOpcion("owner", v, info)}
              placeholder="Nuevo owner..."
              hint="Opcional. Quién del equipo lo tiene."
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
        <div style={{ minWidth: 820 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Material</div><div>Color</div><div>Marca</div><div>Owner</div>
            <div>Cantidad</div><div>Alerta</div><div>Acciones</div>
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
                <div style={{ color: f.owner ? "var(--text)" : "var(--muted)" }}>{f.owner || "—"}</div>
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
