import { useState } from 'react';
import { TKButton, TKInput, Icon, fmtARS } from '../../components/UI.jsx';
import {
  UMBRAL_RESTOCK_INSUMO, necesitaRestockInsumo, insumoEnAlerta,
} from '../../lib/disponibilidad.js';
import {
  crearInsumo, actualizarInsumo, eliminarInsumo, agregarTipo, eliminarTipo,
} from '../../lib/insumos.js';
import {
  tiposDe, esMultiTipo, nuevoIdTipo, NOMBRE_TIPO_BASE,
} from '../../lib/tiposInsumo.js';
import { DetalleHistorial, RestockBadge } from './DetalleHistorial.jsx';

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

const inputChico = {
  width: "100%", padding: "8px 10px", background: "var(--bg)",
  border: "1px solid var(--line)", color: "var(--text)",
  fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", borderRadius: 4,
};

// ─── Tab Insumos ─────────────────────────────────────────────────────
// Catálogo de componentes que no son filamento: imanes, tornillos, LEDs.
//
// Cada insumo tiene uno o más TIPOS, y el precio y el stock viven en el tipo.
// Con un tipo la fila se ve como siempre (precio, stock y alerta inline); con
// varios muestra "N tipos" y se despliega para verlos uno por uno. El historial
// también es por tipo: cada uno tiene sus gastos y sus restocks.
export function InsumosTab({ insumos, onChanged, setMsg }) {
  // Qué tipo está abierto en el detalle de historial: { insumoId, tipoId }.
  const [abierto, setAbierto] = useState(null);
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(null);
  // Alta rápida de un tipo sobre un insumo ya existente.
  const [nuevoTipo, setNuevoTipo] = useState(null);

  const alternar = (id) => setExpandidos(previos => {
    const nuevos = new Set(previos);
    if (nuevos.has(id)) nuevos.delete(id); else nuevos.add(id);
    return nuevos;
  });

  const filaTipo = (t = {}) => ({
    tipoId: t.tipoId || nuevoIdTipo(),
    nombre: t.nombre ?? "",
    precioUnidad: t.precioUnidad ?? 0,
    cantidadDisponible: t.cantidadDisponible ?? 0,
  });

  const openNuevo = () => {
    setEditando(null);
    setForm({ nombre: "", tipos: [filaTipo({ nombre: NOMBRE_TIPO_BASE })] });
    setShowForm(true);
  };

  const openEditar = (i) => {
    setEditando(i);
    setForm({ nombre: i.nombre || "", tipos: tiposDe(i).map(filaTipo) });
    setShowForm(true);
  };

  const upTipo = (j, patch) => setForm(f => ({
    ...f, tipos: f.tipos.map((t, k) => k === j ? { ...t, ...patch } : t),
  }));
  const quitarTipoDelForm = (j) => setForm(f => ({
    ...f, tipos: f.tipos.filter((_, k) => k !== j),
  }));
  const agregarTipoAlForm = () => setForm(f => ({
    ...f, tipos: [...f.tipos, filaTipo()],
  }));

  const guardar = async () => {
    if (!form.nombre.trim()) return alert("El nombre es obligatorio.");
    if (form.tipos.length === 0) return alert("El insumo necesita al menos un tipo.");
    if (form.tipos.some(t => !String(t.nombre).trim())) {
      return alert("Cada tipo necesita un nombre.");
    }
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

  const guardarNuevoTipo = async () => {
    if (!String(nuevoTipo.nombre).trim()) return alert("El tipo necesita un nombre.");
    try {
      await agregarTipo(nuevoTipo.insumoId, nuevoTipo);
      setExpandidos(previos => new Set(previos).add(nuevoTipo.insumoId));
      setNuevoTipo(null);
      setMsg("✓ Tipo agregado.");
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const borrarTipo = async (insumo, tipo) => {
    if (!confirm(
      `¿Eliminar el tipo "${tipo.nombre}" de "${insumo.nombre}"?\n\n` +
      `Los productos que lo usen —como insumo fijo o como opción de variante— ` +
      `van a quedar NO disponibles hasta que elijas otro tipo.`
    )) return;
    try {
      await eliminarTipo(insumo._id, tipo.tipoId);
      setMsg("✓ Tipo eliminado.");
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const borrar = async (i) => {
    if (!confirm(
      `¿Eliminar el insumo "${i.nombre}"?\n\n` +
      `Se van sus ${tiposDe(i).length} tipo(s). Los productos que lo usen van a quedar ` +
      `NO disponibles hasta que les saques la línea.`
    )) return;
    try {
      await eliminarInsumo(i._id);
      if (abierto?.insumoId === i._id) setAbierto(null);
      setMsg("✓ Insumo eliminado.");
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  // ── Detalle de historial de UN tipo ──
  const insumoAbierto = abierto && insumos.find(i => i._id === abierto.insumoId);
  const tipoAbierto = insumoAbierto
    && tiposDe(insumoAbierto).find(t => t.tipoId === abierto.tipoId);

  if (insumoAbierto && tipoAbierto) {
    return (
      <DetalleHistorial
        coleccion="insumos"
        item={insumoAbierto}
        tipoId={tipoAbierto.tipoId}
        titulo={esMultiTipo(insumoAbierto)
          ? `${insumoAbierto.nombre} — ${tipoAbierto.nombre}`
          : insumoAbierto.nombre}
        subtitulo="Insumos / Detalle"
        cantidad={tipoAbierto.cantidadDisponible}
        unidad="u."
        alerta={necesitaRestockInsumo(tipoAbierto)}
        onBack={() => setAbierto(null)}
        onChanged={onChanged}
        setMsg={setMsg}
      />
    );
  }

  const tiposEnAlerta = insumos.reduce(
    (n, i) => n + tiposDe(i).filter(necesitaRestockInsumo).length, 0);
  // Nombre | Precio unidad | Disponible | Alerta | Acciones
  const COL = "2fr 150px 130px 180px 120px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Catálogo de insumos</h2>
        <TKButton onClick={openNuevo} icon={<Icon.plus size={14}/>}>Nuevo insumo</TKButton>
      </div>

      {showForm && form && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>
            {editando ? "Editar insumo" : "Nuevo insumo"}
          </div>
          <div style={{ marginBottom: 16 }}>
            <TKInput label="Nombre" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Imán neodimio 10mm" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Tipos
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
            Cada tipo tiene su <strong>precio</strong> y su <strong>stock</strong> propios
            (ej. "Led": Monocolor y RGB). Un insumo siempre tiene al menos uno.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {form.tipos.map((t, j) => (
              <div key={t.tipoId} style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 36px", gap: 10, alignItems: "end" }}>
                <div>
                  {j === 0 && <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", marginBottom: 4 }}>Nombre del tipo</div>}
                  <input value={t.nombre} placeholder="Ej: RGB" style={inputChico}
                    onChange={e => upTipo(j, { nombre: e.target.value })} />
                </div>
                <div>
                  {j === 0 && <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", marginBottom: 4 }}>Precio unidad</div>}
                  <input type="number" value={t.precioUnidad} style={inputChico}
                    onChange={e => upTipo(j, { precioUnidad: e.target.value })} />
                </div>
                <div>
                  {j === 0 && <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", marginBottom: 4 }}>Disponible</div>}
                  <input type="number" value={t.cantidadDisponible} style={inputChico}
                    onChange={e => upTipo(j, { cantidadDisponible: e.target.value })} />
                </div>
                <button
                  onClick={() => quitarTipoDelForm(j)}
                  disabled={form.tipos.length <= 1}
                  title={form.tipos.length <= 1
                    ? "El insumo no puede quedarse sin tipos"
                    : "Quitar tipo"}
                  style={{ ...actionBtn, color: "#c64138", justifyContent: "center",
                    height: 36, opacity: form.tipos.length <= 1 ? 0.35 : 1,
                    cursor: form.tipos.length <= 1 ? "not-allowed" : "pointer" }}
                >
                  <Icon.trash size={14}/>
                </button>
              </div>
            ))}
          </div>
          <button onClick={agregarTipoAlForm} style={{
            background: "none", border: "1px dashed var(--line-strong)",
            padding: "6px 12px", cursor: "pointer", color: "var(--muted)",
            fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
          }}>
            <Icon.plus size={12}/> Agregar tipo
          </button>

          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Para sumar unidades usá "Registrar restock" en el detalle de cada tipo: queda asentado
            en su historial. El precio se copia al producto cuando lo agregás a su receta.
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
        {tiposEnAlerta > 0 && <> · <span style={{ color: "#c64138", fontWeight: 700 }}>
          {tiposEnAlerta} tipo{tiposEnAlerta !== 1 ? "s" : ""} en {UMBRAL_RESTOCK_INSUMO} unidades o menos
        </span></>}
      </div>

      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 760 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Nombre</div><div>Precio unidad</div>
            <div>Disponible</div><div>Alerta</div><div>Acciones</div>
          </div>

          {insumos.map(i => {
            const tipos = tiposDe(i);
            const multi = tipos.length > 1;
            const unico = multi ? null : tipos[0];
            const alerta = insumoEnAlerta(i);
            const expandido = expandidos.has(i._id);
            const negativo = !multi && Number(unico?.cantidadDisponible || 0) < 0;
            return (
              <div key={i._id}>
                <div style={{
                  display: "grid", gridTemplateColumns: COL,
                  gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
                  fontSize: 13, alignItems: "center",
                  background: alerta ? "#c6413808" : "transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {multi && (
                      <button
                        onClick={() => alternar(i._id)}
                        title={expandido ? "Contraer" : "Expandir"}
                        aria-expanded={expandido}
                        style={{ ...actionBtn, padding: "2px 4px", border: "none" }}
                      >
                        <span style={{
                          color: "var(--muted)", display: "flex",
                          transform: expandido ? "none" : "rotate(-90deg)",
                          transition: "transform .15s",
                        }}>
                          <Icon.chevron size={14}/>
                        </span>
                      </button>
                    )}
                    <span
                      onClick={() => multi
                        ? alternar(i._id)
                        : setAbierto({ insumoId: i._id, tipoId: unico.tipoId })}
                      style={{ fontWeight: 600, cursor: "pointer", color: "var(--accent)" }}
                      title={multi ? "Ver tipos" : "Ver historial"}
                    >
                      {i.nombre}
                    </span>
                  </div>
                  {multi ? (
                    // Con varios tipos, cada uno tiene su precio y su stock:
                    // un precio suelto acá sería el de cuál. Los números van
                    // en las filas de abajo; acá solo cuántos son.
                    <>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        {tipos.length} tipos
                      </div>
                      <div/>
                    </>
                  ) : (
                    <>
                      <div>{fmtARS(unico.precioUnidad || 0)}</div>
                      <div style={{ fontWeight: 700, color: alerta ? "#c64138" : "var(--text)" }}>
                        {Number(unico.cantidadDisponible || 0)} u.
                        {negativo && (
                          <div style={{ fontSize: 10, fontWeight: 400 }}>faltan unidades</div>
                        )}
                      </div>
                    </>
                  )}
                  {/* La alerta es la misma para los dos casos: con varios
                      tipos dice además cuántos hay que reponer. */}
                  <div>
                    {alerta
                      ? <RestockBadge detalle={multi
                          ? `${tipos.filter(necesitaRestockInsumo).length} de ${tipos.length}`
                          : ""}/>
                      : <span style={{ color: "var(--muted)", fontSize: 12 }}>OK</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {!multi && (
                      <button onClick={() => setAbierto({ insumoId: i._id, tipoId: unico.tipoId })}
                        style={actionBtn} title="Ver detalle"><Icon.list size={14}/></button>
                    )}
                    <button
                      onClick={() => setNuevoTipo({
                        insumoId: i._id, nombre: "", precioUnidad: 0, cantidadDisponible: 0,
                      })}
                      style={actionBtn} title="Agregar tipo"><Icon.plus size={14}/></button>
                    <button onClick={() => openEditar(i)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
                    <button onClick={() => borrar(i)} style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"><Icon.trash size={14}/></button>
                  </div>
                </div>

                {/* Alta rápida de un tipo sobre este insumo */}
                {nuevoTipo?.insumoId === i._id && (
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 160px 160px auto",
                    gap: 10, alignItems: "end", padding: "12px 12px 16px 32px",
                    borderBottom: "1px solid var(--line)", background: "var(--bg-alt)",
                  }}>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", marginBottom: 4 }}>
                        Nombre del tipo nuevo
                      </div>
                      <input autoFocus value={nuevoTipo.nombre} placeholder="Ej: RGB" style={inputChico}
                        onChange={e => setNuevoTipo(t => ({ ...t, nombre: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", marginBottom: 4 }}>Precio unidad</div>
                      <input type="number" value={nuevoTipo.precioUnidad} style={inputChico}
                        onChange={e => setNuevoTipo(t => ({ ...t, precioUnidad: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", marginBottom: 4 }}>Disponible</div>
                      <input type="number" value={nuevoTipo.cantidadDisponible} style={inputChico}
                        onChange={e => setNuevoTipo(t => ({ ...t, cantidadDisponible: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <TKButton onClick={guardarNuevoTipo}>Agregar</TKButton>
                      <TKButton variant="outline" onClick={() => setNuevoTipo(null)}>Cancelar</TKButton>
                    </div>
                  </div>
                )}

                {/* Los tipos, uno por fila */}
                {multi && expandido && tipos.map(t => {
                  const alertaTipo = necesitaRestockInsumo(t);
                  return (
                    <div key={t.tipoId} style={{
                      display: "grid", gridTemplateColumns: COL,
                      gap: 12, padding: "10px 12px 10px 32px",
                      borderBottom: "1px solid var(--line)",
                      fontSize: 13, alignItems: "center",
                      background: alertaTipo ? "#c6413808" : "var(--bg-alt)",
                    }}>
                      <div
                        onClick={() => setAbierto({ insumoId: i._id, tipoId: t.tipoId })}
                        style={{ cursor: "pointer", color: "var(--accent)" }}
                        title="Ver historial de este tipo"
                      >
                        {t.nombre}
                      </div>
                      <div>{fmtARS(t.precioUnidad || 0)}</div>
                      <div style={{ fontWeight: 700, color: alertaTipo ? "#c64138" : "var(--text)" }}>
                        {Number(t.cantidadDisponible || 0)} u.
                        {Number(t.cantidadDisponible || 0) < 0 && (
                          <div style={{ fontSize: 10, fontWeight: 400 }}>faltan unidades</div>
                        )}
                      </div>
                      <div>{alertaTipo ? <RestockBadge/> : <span style={{ color: "var(--muted)", fontSize: 12 }}>OK</span>}</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => setAbierto({ insumoId: i._id, tipoId: t.tipoId })}
                          style={actionBtn} title="Ver detalle"><Icon.list size={14}/></button>
                        <button onClick={() => openEditar(i)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
                        <button onClick={() => borrarTipo(i, t)}
                          style={{ ...actionBtn, color: "#c64138" }} title="Eliminar tipo">
                          <Icon.trash size={14}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
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
