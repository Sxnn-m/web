import { useState, useEffect, useMemo } from 'react';
import { fmtARS } from '../../components/UI.jsx';
import { cargarGastosDeTodos } from '../../lib/historial.js';
import {
  indiceDeProductos, mesesDisponibles, etiquetaMes, kpisDelMes,
  serieVentasPorMes, ventasPorCategoria, ventasSinFecha, claveMes,
} from '../../lib/estadisticas.js';

// ─── Tab Estadísticas ────────────────────────────────────────────────
// Todo se calcula en el cliente a partir de los pedidos ya cargados: no hay
// colección de estadísticas ni agregados guardados. Los costos son los
// VIGENTES (settings/costos), no hay costos históricos.
//
// Los gráficos son SVG a mano, sin librería: son dos, con pocos puntos, y así
// heredan las variables de tema del resto del backoffice.

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
};

const tituloBloque = {
  fontSize: 13, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: 1, color: "var(--muted)",
};

const selectStyle = {
  padding: "9px 12px", border: "1px solid var(--line-strong)",
  background: "var(--bg)", color: "var(--text)", fontSize: 14,
  fontWeight: 600, borderRadius: 4, cursor: "pointer", minWidth: 190,
};

/** Paleta del donut. Se cicla si hay más categorías que colores. */
const PALETA = ["#345C83", "#4a7a52", "#B56B3E", "#8A6BA8", "#C64138", "#3E8A8A", "#9A8F3E"];
const colorDe = (i) => PALETA[i % PALETA.length];

const fmtGramos = (g) =>
  `${(Math.round(g * 10) / 10).toLocaleString("es-AR")} g`;

export function EstadisticasTab({
  pedidos = [], productos = [], personalizados = [], filamentos = [],
  categories = [], costs,
}) {
  const [gastos, setGastos] = useState([]);
  const [cargandoGastos, setCargandoGastos] = useState(true);
  const [errorGastos, setErrorGastos] = useState("");

  // Los gastos viven en filamentos/{id}/gastos: una lectura por filamento.
  // Solo hacen falta acá, así que no se cargan en el arranque del backoffice.
  useEffect(() => {
    let vigente = true;
    setCargandoGastos(true);
    cargarGastosDeTodos("filamentos", filamentos)
      .then(list => { if (vigente) { setGastos(list); setErrorGastos(""); } })
      .catch(err => { if (vigente) setErrorGastos(err.message); })
      .finally(() => { if (vigente) setCargandoGastos(false); });
    return () => { vigente = false; };
  }, [filamentos]);

  const hoy = useMemo(() => new Date(), []);
  const indice = useMemo(
    () => indiceDeProductos(productos, personalizados),
    [productos, personalizados]
  );
  const meses = useMemo(() => mesesDisponibles(pedidos, hoy), [pedidos, hoy]);
  const [mes, setMes] = useState(() => claveMes(hoy));

  // Si el mes elegido dejó de existir en la lista (cambió el filtro de datos),
  // se vuelve al más reciente en vez de quedar en un mes fantasma.
  useEffect(() => {
    if (meses.length > 0 && !meses.includes(mes)) setMes(meses[0]);
  }, [meses, mes]);

  const kpis = useMemo(
    () => kpisDelMes(pedidos, gastos, mes, indice, costs),
    [pedidos, gastos, mes, indice, costs]
  );
  const serie = useMemo(
    () => serieVentasPorMes(pedidos, indice, costs, hoy, 12),
    [pedidos, indice, costs, hoy]
  );
  const categorias = useMemo(
    () => ventasPorCategoria(kpis.ventas, indice, categories),
    [kpis.ventas, indice, categories]
  );
  const huerfanas = useMemo(() => ventasSinFecha(pedidos), [pedidos]);

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        gap: 16, flexWrap: "wrap", marginBottom: 20,
      }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Estadísticas</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
            Solo pedidos <strong>entregados y pagados</strong>, agrupados por el mes de entrega.
          </p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...tituloBloque, fontSize: 11 }}>Mes</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)} style={selectStyle}>
            {meses.map(m => (
              <option key={m} value={m}>{etiquetaMes(m)}</option>
            ))}
          </select>
        </label>
      </div>

      {errorGastos && (
        <Aviso tono="error">
          No se pudo leer el historial de gastos: {errorGastos}. Los dos KPIs de
          desperdicio quedan en cero.
        </Aviso>
      )}
      {huerfanas.length > 0 && (
        <Aviso>
          {huerfanas.length} pedido(s) entregados y pagados no tienen fecha de
          entrega y no entran en ningún mes:{" "}
          {huerfanas.map(p => p.numeroOrden).join(", ")}.
        </Aviso>
      )}
      {kpis.sinCosto.length > 0 && (
        <Aviso>
          {kpis.sinCosto.length} línea(s) de este mes sin costo calculable — no
          suman al costo, así que la ganancia está sobreestimada:{" "}
          {kpis.sinCosto.slice(0, 4).map(l => `${l.numeroOrden} · ${l.producto} (${l.motivo})`).join("; ")}
          {kpis.sinCosto.length > 4 ? ` y ${kpis.sinCosto.length - 4} más.` : "."}
        </Aviso>
      )}
      {kpis.desperdicio.materialesSinCosto.length > 0 && (
        <Aviso>
          Sin costo por gramo configurado para{" "}
          {kpis.desperdicio.materialesSinCosto.join(", ")}: esos gramos cuentan
          en el desperdicio pero no en la plata perdida.
        </Aviso>
      )}

      {/* ── KPIs ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14, marginBottom: 24,
      }}>
        <Kpi
          label="Ventas"
          valor={kpis.cantidadVentas.toLocaleString("es-AR")}
          detalle={`${kpis.unidades.toLocaleString("es-AR")} unidad(es) · ${fmtARS(kpis.ingresos)} facturados`}
          color="#345C83"
        />
        <Kpi
          label="Ganancia total"
          valor={fmtARS(kpis.ganancia)}
          detalle={`${fmtARS(kpis.ingresos)} − ${fmtARS(kpis.costo)} de fabricación · margen ${kpis.margen.toFixed(1)}%`}
          color={kpis.ganancia >= 0 ? "#4a7a52" : "#C64138"}
        />
        <Kpi
          label="Material desperdiciado"
          valor={cargandoGastos ? "…" : fmtGramos(kpis.desperdicio.gramos)}
          detalle="Gramos descartados en los pedidos del mes"
          color="#B56B3E"
        />
        <Kpi
          label="Plata perdida en desperdicio"
          valor={cargandoGastos ? "…" : fmtARS(kpis.desperdicio.dinero)}
          detalle="Cada gramo al costo de su propio material"
          color="#C64138"
        />
      </div>

      {/* ── Gráficos ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
        gap: 14, alignItems: "stretch",
      }} className="cart-layout">
        <div style={cardStyle}>
          <div style={tituloBloque}>Ventas por mes</div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 16px" }}>
            Monto facturado en los últimos 12 meses. No depende del mes seleccionado.
          </p>
          <GraficoVentas serie={serie} mesActivo={mes} />
        </div>

        <div style={cardStyle}>
          <div style={tituloBloque}>Ventas por categoría</div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 16px" }}>
            {etiquetaMes(mes)} · repartido por <strong>monto facturado</strong>.
          </p>
          <GraficoCategorias datos={categorias} total={kpis.ingresos} />
        </div>
      </div>
    </div>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────

function Aviso({ children, tono = "warn" }) {
  const color = tono === "error" ? "#C64138" : "#B56B3E";
  return (
    <div style={{
      padding: "10px 14px", marginBottom: 12, borderRadius: 6,
      background: color + "15", color, fontSize: 12.5, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

function Kpi({ label, valor, detalle, color }) {
  return (
    <div style={{ ...cardStyle, borderTop: `3px solid ${color}` }}>
      <div style={{ ...tituloBloque, fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: "10px 0 6px", color }}>
        {valor}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
        {detalle}
      </div>
    </div>
  );
}

/** Techo "redondo" del eje Y: 1, 2 o 5 × 10^n por encima del máximo. */
function techoEje(max) {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  for (const paso of [1, 2, 5, 10]) {
    if (max <= paso * base) return paso * base;
  }
  return 10 * base;
}

/** Área + línea, 12 puntos. El mes seleccionado se marca con un punto lleno. */
function GraficoVentas({ serie, mesActivo }) {
  const W = 560, H = 220, PAD_L = 58, PAD_R = 10, PAD_T = 12, PAD_B = 30;
  const ancho = W - PAD_L - PAD_R;
  const alto = H - PAD_T - PAD_B;

  const max = techoEje(Math.max(...serie.map(p => p.monto), 0));
  const x = (i) => PAD_L + (serie.length <= 1 ? ancho / 2 : (ancho * i) / (serie.length - 1));
  const y = (v) => PAD_T + alto - (alto * v) / max;

  const puntos = serie.map((p, i) => `${x(i)},${y(p.monto)}`).join(" ");
  const area = `${PAD_L},${PAD_T + alto} ${puntos} ${x(serie.length - 1)},${PAD_T + alto}`;
  const hayDatos = serie.some(p => p.monto > 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="Monto facturado por mes en los últimos 12 meses">
        {/* grilla + eje Y */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(max * f)} y2={y(max * f)}
              stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_L - 8} y={y(max * f) + 3.5} textAnchor="end"
              fontSize="9.5" fill="var(--muted)">
              {max * f >= 1000 ? `${Math.round((max * f) / 1000)}k` : Math.round(max * f)}
            </text>
          </g>
        ))}

        {hayDatos && (
          <>
            <polygon points={area} fill="#345C83" opacity="0.14" />
            <polyline points={puntos} fill="none" stroke="#345C83"
              strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {serie.map((p, i) => (
          <g key={p.mes}>
            {p.mes === mesActivo && (
              <line x1={x(i)} x2={x(i)} y1={PAD_T} y2={PAD_T + alto}
                stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
            )}
            <circle cx={x(i)} cy={y(p.monto)} r={p.mes === mesActivo ? 4.5 : 2.5}
              fill={p.mes === mesActivo ? "#345C83" : "var(--bg-alt)"}
              stroke="#345C83" strokeWidth="1.6" />
            <title>{`${p.etiqueta}: ${p.cantidad} venta(s) · $ ${Math.round(p.monto).toLocaleString("es-AR")}`}</title>
            {/* Una etiqueta de por medio: 12 no entran de frente. */}
            {i % 2 === 0 && (
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="9.5"
                fill={p.mes === mesActivo ? "var(--text)" : "var(--muted)"}
                fontWeight={p.mes === mesActivo ? 700 : 400}>
                {p.etiqueta}
              </text>
            )}
          </g>
        ))}
      </svg>
      {!hayDatos && (
        <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", margin: "4px 0 0" }}>
          Todavía no hay ventas entregadas y pagadas en los últimos 12 meses.
        </p>
      )}
    </div>
  );
}

/**
 * Donut por segmentos de circunferencia (stroke-dasharray). A diferencia de
 * los arcos SVG, esto dibuja bien el caso de una sola categoría al 100%.
 */
function GraficoCategorias({ datos, total }) {
  const R = 52, GROSOR = 22, CIRC = 2 * Math.PI * R;

  if (datos.length === 0 || total <= 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "40px 0" }}>
        Sin ventas en este mes.
      </p>
    );
  }

  let acumulado = 0;
  const segmentos = datos.map((d, i) => {
    const inicio = acumulado;
    acumulado += d.porcentaje;
    return { ...d, inicio, color: colorDe(i) };
  });

  return (
    <div>
      <svg viewBox="0 0 140 140" width="100%" style={{ maxHeight: 190 }} role="img"
        aria-label="Reparto de ventas por categoría">
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth={GROSOR} />
          {segmentos.map(s => (
            <circle key={s.categoria} cx="70" cy="70" r={R} fill="none"
              stroke={s.color} strokeWidth={GROSOR}
              strokeDasharray={`${(CIRC * s.porcentaje) / 100} ${CIRC}`}
              strokeDashoffset={-(CIRC * s.inicio) / 100} />
          ))}
        </g>
        <text x="70" y="66" textAnchor="middle" fontSize="9" fill="var(--muted)">Total</text>
        <text x="70" y="80" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--text)">
          {fmtARS(total)}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 16 }}>
        {segmentos.map(s => (
          <div key={s.categoria} style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 12,
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0,
            }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.categoria}
            </span>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              {s.unidades} u.
            </span>
            <span style={{ fontWeight: 700, minWidth: 42, textAlign: "right" }}>
              {s.porcentaje.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
