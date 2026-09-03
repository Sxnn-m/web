import { useState, useEffect } from 'react';
import { TKButton, TKInput, TKPill, Icon } from '../../components/UI.jsx';
import { cargarGastosDe, cargarRestocksDe, registrarRestockEn } from '../../lib/historial.js';

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

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

/**
 * Detalle con los dos historiales (gastos y restocks) de un filamento o de un
 * insumo. Mismo componente para las dos colecciones: cambia el rótulo, la
 * unidad y si los gastos llevan columna de desperdicio.
 *
 * @param {string} coleccion       "filamentos" | "insumos"
 * @param {object} item            documento (necesita _id)
 * @param {string} titulo          encabezado principal
 * @param {string} subtitulo       migaja de pan ("Inventario / Filamento")
 * @param {number} cantidad        stock actual
 * @param {string} unidad          "g" | "u."
 * @param {boolean} alerta         si está por debajo del umbral de restock
 * @param {boolean} conDesperdicio si los gastos tienen cantidadDesperdiciada
 */
export function DetalleHistorial({
  coleccion, item, titulo, subtitulo, cantidad, unidad,
  alerta, conDesperdicio = false, onBack, onChanged, setMsg,
}) {
  const [gastos, setGastos] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRestock, setShowRestock] = useState(false);
  const [restockForm, setRestockForm] = useState({ cantidadAgregada: "", nota: "" });

  const cargarHistoriales = async () => {
    try {
      const [g, r] = await Promise.all([
        cargarGastosDe(coleccion, item._id),
        cargarRestocksDe(coleccion, item._id),
      ]);
      setGastos(g);
      setRestocks(r);
    } catch (err) {
      console.error(err);
      setMsg("Error al cargar historiales: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { cargarHistoriales(); /* eslint-disable-next-line */ }, [coleccion, item._id]);

  const guardarRestock = async () => {
    const n = Number(restockForm.cantidadAgregada);
    if (!n || n <= 0) return alert("Ingresá una cantidad mayor a 0.");
    try {
      await registrarRestockEn(coleccion, item._id, n, restockForm.nota);
      setRestockForm({ cantidadAgregada: "", nota: "" });
      setShowRestock(false);
      setMsg(`✓ Restock de ${n} ${unidad} registrado.`);
      await cargarHistoriales();
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const totalConsumido = gastos.reduce((s, g) => s + (Number(g.cantidadConsumida) || 0), 0);
  const totalDesperdiciado = gastos.reduce((s, g) => s + (Number(g.cantidadDesperdiciada) || 0), 0);
  const totalRepuesto = restocks.reduce((s, r) => s + (Number(r.cantidadAgregada) || 0), 0);

  const COL_GASTOS = conDesperdicio
    ? "1.6fr 90px 90px 90px 1fr"
    : "1.8fr 100px 100px 1fr";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            {subtitulo}
          </div>
          <h2 style={{ fontSize: 28, margin: 0 }}>{titulo}</h2>
        </div>
        <TKButton variant="ghost" onClick={onBack} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "20px 0 24px" }}>
        <div style={{ padding: "16px 22px", background: "var(--bg-alt)", borderLeft: `3px solid ${alerta ? "#c64138" : "#4a7a52"}` }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
            En stock
          </div>
          <div style={{ fontSize: 28, color: alerta ? "#c64138" : "var(--text)" }}>
            {Number(cantidad || 0).toLocaleString("es-AR")} {unidad}
          </div>
        </div>
        {alerta && <RestockBadge/>}
        <div style={{ flex: 1 }}/>
        <TKButton onClick={() => setShowRestock(v => !v)} icon={<Icon.plus size={14}/>}>Registrar restock</TKButton>
      </div>

      {showRestock && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>Nuevo restock</div>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label={`Cantidad agregada (${unidad})`} type="number" value={restockForm.cantidadAgregada}
              onChange={e => setRestockForm(f => ({ ...f, cantidadAgregada: e.target.value }))}
              placeholder={unidad === "g" ? "1000" : "50"} />
            <TKInput label="Nota (opcional)" value={restockForm.nota}
              onChange={e => setRestockForm(f => ({ ...f, nota: e.target.value }))}
              placeholder="Compra nueva, proveedor X..." />
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
              Se generan solos al marcar un pedido como impreso · {totalConsumido} {unidad} consumidas
              {conDesperdicio && ` + ${totalDesperdiciado} ${unidad} desperdiciadas`}
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: COL_GASTOS,
              gap: 10, padding: "10px 12px", background: "var(--bg-alt)",
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2,
              color: "var(--muted)", fontWeight: 700,
            }}>
              <div>Producto</div>
              <div>Consumido</div>
              {conDesperdicio && <div>Desperdicio</div>}
              <div>Orden</div>
              <div>Fecha</div>
            </div>
            {gastos.map(g => (
              <div key={g._id} style={{
                display: "grid", gridTemplateColumns: COL_GASTOS,
                gap: 10, padding: "12px", borderBottom: "1px solid var(--line)", fontSize: 12,
              }}>
                <div style={{ fontWeight: 600 }}>{g.producto}</div>
                <div>{g.cantidadConsumida} {unidad}</div>
                {conDesperdicio && (
                  <div style={{ color: (g.cantidadDesperdiciada || 0) > 0 ? "#B56B3E" : "var(--muted)" }}>
                    {g.cantidadDesperdiciada || 0} {unidad}
                  </div>
                )}
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
              Carga manual · {totalRepuesto} {unidad} repuestas en total
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "100px 1fr 1fr",
              gap: 10, padding: "10px 12px", background: "var(--bg-alt)",
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2,
              color: "var(--muted)", fontWeight: 700,
            }}>
              <div>Agregado</div><div>Fecha</div><div>Nota</div>
            </div>
            {restocks.map(r => (
              <div key={r._id} style={{
                display: "grid", gridTemplateColumns: "100px 1fr 1fr",
                gap: 10, padding: "12px", borderBottom: "1px solid var(--line)", fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, color: "#4a7a52" }}>+{r.cantidadAgregada} {unidad}</div>
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
