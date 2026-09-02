import { useState, useEffect } from 'react';
import { TKButton, TKInput, TKPill, Icon } from '../../components/UI.jsx';
import { UMBRAL_RESTOCK, necesitaRestock } from '../../lib/disponibilidad.js';
import {
  cargarGastos, cargarRestocks, registrarRestock,
  crearFilamento, actualizarFilamento, eliminarFilamento,
} from '../../lib/inventario.js';

/** Firestore Timestamp | Date | null → "12/03/2026 14:05" */
export function fmtFecha(valor) {
  if (!valor) return "—";
  const d = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

export function RestockBadge() {
  return (
    <span style={{
      display: "inline-block", padding: "4px 10px",
      background: "#c6413818", color: "#c64138",
      border: "1px solid #c6413855",
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      textTransform: "uppercase", borderRadius: 2, whiteSpace: "nowrap",
    }}>
      Hacer restock
    </span>
  );
}

// ─── Tab Inventario ──────────────────────────────────────────────────
export function InventarioTab({ filamentos, onChanged, setMsg }) {
  const [seleccionado, setSeleccionado] = useState(null); // _id del filamento abierto
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ material: "", color: "", cantidadGramos: 0 });

  const abierto = filamentos.find(f => f._id === seleccionado) || null;

  const openNuevo = () => {
    setEditando(null);
    setForm({ material: "", color: "", cantidadGramos: 0 });
    setShowForm(true);
  };

  const openEditar = (f) => {
    setEditando(f);
    setForm({ material: f.material || "", color: f.color || "", cantidadGramos: f.cantidadGramos || 0 });
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
      <FilamentoDetalle
        filamento={abierto}
        onBack={() => setSeleccionado(null)}
        onChanged={onChanged}
        setMsg={setMsg}
      />
    );
  }

  const enAlerta = filamentos.filter(necesitaRestock).length;
  const COL = "1.2fr 1fr 120px 140px 90px";

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="Material" value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} placeholder="PLA" />
            <TKInput label="Color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="Negro" />
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
            <div>Material</div><div>Color</div><div>Cantidad</div><div>Alerta</div><div>Acciones</div>
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

// ─── Detalle de un filamento: gastos + restocks ──────────────────────
function FilamentoDetalle({ filamento, onBack, onChanged, setMsg }) {
  const [gastos, setGastos] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRestock, setShowRestock] = useState(false);
  const [restockForm, setRestockForm] = useState({ cantidadAgregada: "", nota: "" });

  const cargarHistoriales = async () => {
    try {
      const [g, r] = await Promise.all([
        cargarGastos(filamento._id),
        cargarRestocks(filamento._id),
      ]);
      setGastos(g);
      setRestocks(r);
    } catch (err) {
      console.error(err);
      setMsg("Error al cargar historiales: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { cargarHistoriales(); /* eslint-disable-next-line */ }, [filamento._id]);

  const guardarRestock = async () => {
    const cantidad = Number(restockForm.cantidadAgregada);
    if (!cantidad || cantidad <= 0) return alert("Ingresá una cantidad mayor a 0.");
    try {
      await registrarRestock(filamento._id, cantidad, restockForm.nota);
      setRestockForm({ cantidadAgregada: "", nota: "" });
      setShowRestock(false);
      setMsg(`✓ Restock de ${cantidad} g registrado.`);
      await cargarHistoriales();
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const alerta = necesitaRestock(filamento);
  const totalConsumido = gastos.reduce((s, g) => s + (Number(g.cantidadConsumida) || 0), 0);
  const totalDesperdiciado = gastos.reduce((s, g) => s + (Number(g.cantidadDesperdiciada) || 0), 0);
  const totalRepuesto = restocks.reduce((s, r) => s + (Number(r.cantidadAgregada) || 0), 0);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Inventario / Filamento
          </div>
          <h2 style={{ fontSize: 28, margin: 0 }}>
            {filamento.material} <span style={{ color: "var(--muted)" }}>·</span> {filamento.color}
          </h2>
        </div>
        <TKButton variant="ghost" onClick={onBack} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "20px 0 24px" }}>
        <div style={{ padding: "16px 22px", background: "var(--bg-alt)", borderLeft: `3px solid ${alerta ? "#c64138" : "#4a7a52"}` }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
            En stock
          </div>
          <div style={{ fontSize: 28, color: alerta ? "#c64138" : "var(--text)" }}>
            {Number(filamento.cantidadGramos || 0).toLocaleString("es-AR")} g
          </div>
        </div>
        {alerta && <RestockBadge/>}
        <div style={{ flex: 1 }}/>
        <TKButton onClick={() => setShowRestock(v => !v)} icon={<Icon.plus size={14}/>}>Registrar restock</TKButton>
      </div>

      {showRestock && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>Nuevo restock</div>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="Cantidad agregada (g)" type="number" value={restockForm.cantidadAgregada}
              onChange={e => setRestockForm(f => ({ ...f, cantidadAgregada: e.target.value }))} placeholder="1000" />
            <TKInput label="Nota (opcional)" value={restockForm.nota}
              onChange={e => setRestockForm(f => ({ ...f, nota: e.target.value }))} placeholder="Bobina nueva, proveedor X..." />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <TKButton onClick={guardarRestock}>Guardar restock</TKButton>
            <TKButton variant="outline" onClick={() => setShowRestock(false)}>Cancelar</TKButton>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: "var(--muted)" }}>Cargando historiales...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "start" }} className="form-layout">
          {/* Gastos */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
              Gastos
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
              Se generan solos al marcar un pedido como impreso · {totalConsumido} g consumidos + {totalDesperdiciado} g desperdiciados
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1.6fr 90px 90px 90px 1fr",
              gap: 10, padding: "10px 12px", background: "var(--bg-alt)",
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2,
              color: "var(--muted)", fontWeight: 700,
            }}>
              <div>Producto</div><div>Consumido</div><div>Desperdicio</div><div>Orden</div><div>Fecha</div>
            </div>
            {gastos.map(g => (
              <div key={g._id} style={{
                display: "grid", gridTemplateColumns: "1.6fr 90px 90px 90px 1fr",
                gap: 10, padding: "12px", borderBottom: "1px solid var(--line)", fontSize: 12,
              }}>
                <div style={{ fontWeight: 600 }}>{g.producto}</div>
                <div>{g.cantidadConsumida} g</div>
                <div style={{ color: (g.cantidadDesperdiciada || 0) > 0 ? "#B56B3E" : "var(--muted)" }}>
                  {g.cantidadDesperdiciada || 0} g
                </div>
                <div><TKPill variant="outline">{g.numeroOrden}</TKPill></div>
                <div style={{ color: "var(--muted)" }}>{fmtFecha(g.fecha)}</div>
              </div>
            ))}
            {gastos.length === 0 && (
              <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>Sin gastos registrados.</div>
            )}
          </div>

          {/* Restocks */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
              Restocks
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
              Carga manual · {totalRepuesto} g repuestos en total
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "90px 1fr 1fr",
              gap: 10, padding: "10px 12px", background: "var(--bg-alt)",
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2,
              color: "var(--muted)", fontWeight: 700,
            }}>
              <div>Agregado</div><div>Fecha</div><div>Nota</div>
            </div>
            {restocks.map(r => (
              <div key={r._id} style={{
                display: "grid", gridTemplateColumns: "90px 1fr 1fr",
                gap: 10, padding: "12px", borderBottom: "1px solid var(--line)", fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, color: "#4a7a52" }}>+{r.cantidadAgregada} g</div>
                <div style={{ color: "var(--muted)" }}>{fmtFecha(r.fecha)}</div>
                <div style={{ color: "var(--muted)" }}>{r.nota || "—"}</div>
              </div>
            ))}
            {restocks.length === 0 && (
              <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>Sin restocks registrados.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
