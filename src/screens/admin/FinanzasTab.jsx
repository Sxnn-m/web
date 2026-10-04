// ─── Tab Finanzas ────────────────────────────────────────────────────
// Ganancias, gastos y el saldo que es su resta.
//
// Las ganancias tienen dos orígenes que se leen distinto a propósito: las de
// un pedido las gobierna el tab Pedidos —aparecen al marcarlo pagado y se van
// si vuelve a pendiente— y acá se muestran sin botones, porque editarlas a
// mano dejaría el número peleado con el pedido que lo produjo. Las manuales
// son las únicas que se cargan y se corrigen desde esta pantalla.

import { useState, useEffect, useMemo } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import {
  cargarGanancias, cargarGastos, totales, hoyEnInput, inputDesdeFecha,
  gananciasFaltantes, crearGananciasFaltantes, crearGananciaDePedidoConFecha,
  crearGananciaManual, actualizarGananciaManual, eliminarGanancia,
  crearGasto, eliminarGasto, esAutomatica, validarMovimiento,
} from '../../lib/finanzas.js';
import { DetalleGasto } from './DetalleGasto.jsx';

const AZUL = "#345C83";

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

const tituloBloque = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
  textTransform: "uppercase", color: "var(--muted)",
};

const cabecera = {
  fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2,
  color: "var(--muted)", fontWeight: 700,
};

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "4px 6px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

/** Fecha corta: en una tabla la hora no aporta y gasta una columna entera. */
export function fmtDia(valor) {
  if (!valor) return "—";
  const d = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Las tres tarjetas de arriba. Mismo azul que Estadísticas y el Dashboard: son
 * tres lecturas del mismo dinero, no tres estados distintos.
 *
 * El saldo negativo va en rojo porque sí es un estado: se gastó más de lo que
 * entró, y es lo único de los tres números que pide una decisión.
 */
function Tarjeta({ label, valor, negativo = false, destacada = false }) {
  const color = negativo ? "#c64138" : AZUL;
  return (
    <div style={{
      ...cardStyle, marginBottom: 0, flex: 1, minWidth: 180,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ ...tituloBloque, fontSize: 11 }}>{label}</div>
      <div style={{
        fontSize: destacada ? 30 : 24, fontWeight: 700,
        margin: "10px 0 0", color,
      }}>
        {fmtARS(valor)}
      </div>
    </div>
  );
}

/** Formulario compartido por las dos altas: cambian los rótulos, no los campos. */
function FormMovimiento({ titulo, inicial, textoDescripcion, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState({});

  const guardar = async () => {
    const { valido, errores: errs } = validarMovimiento(form);
    setErrores(errs);
    if (!valido) return;
    await onGuardar(form);
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 18, marginBottom: 16 }}>{titulo}</div>
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 170px", gap: 16, marginBottom: 16 }} className="form-layout">
        <TKInput label="Fecha" type="date" value={form.fecha}
          onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
          error={errores.fecha}/>
        <TKInput label={textoDescripcion} value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          error={errores.descripcion} placeholder="Filamento PLA negro ×2"/>
        <TKInput label="Monto" type="number" value={form.monto}
          onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
          error={errores.monto} placeholder="15000"/>
      </div>
      {Object.values(errores).filter(Boolean).length > 0 && (
        <div style={{ fontSize: 12, color: "#c64138", marginBottom: 12 }}>
          {Object.values(errores).filter(Boolean).join(" ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <TKButton onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar"}
        </TKButton>
        <TKButton variant="outline" onClick={onCancelar} disabled={guardando}>Cancelar</TKButton>
      </div>
    </div>
  );
}

export function FinanzasTab({ pedidos = [], gastoId = null, onAbrirGasto, onVolver, setMsg }) {
  const [ganancias, setGanancias] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [formGanancia, setFormGanancia] = useState(null);   // null | {id?, ...}
  const [formGasto, setFormGasto] = useState(null);
  // Pedidos pagados sin pagadoAt: no se les inventa la fecha, se piden.
  const [sinFecha, setSinFecha] = useState([]);
  const [fechasAMano, setFechasAMano] = useState({});

  const recargar = async () => {
    const [gan, gas] = await Promise.all([cargarGanancias(), cargarGastos()]);
    setGanancias(gan);
    setGastos(gas);
    return gan;
  };

  /**
   * Red de seguridad al entrar, igual que el recálculo de disponibilidad: los
   * pedidos que ya estaban pagados antes de que existiera esta sección no
   * tienen ganancia, y nadie va a volver a marcarlos pagados para generarla.
   * Es idempotente —el ID del documento es el del pedido— así que entrar diez
   * veces no crea diez filas.
   */
  const sincronizar = async () => {
    try {
      const gan = await recargar();
      const { aCrear, sinFecha: pendientes } = gananciasFaltantes(pedidos, gan);
      setSinFecha(pendientes);
      if (aCrear.length > 0) {
        await crearGananciasFaltantes(aCrear);
        await recargar();
        setMsg(`✓ Se incorporaron ${aCrear.length} pedido(s) pagado(s) que faltaban en Ganancias.`);
      }
    } catch (err) {
      console.error(err);
      setMsg("Error al cargar Finanzas: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { sincronizar(); /* eslint-disable-next-line */ }, [pedidos]);

  const t = useMemo(() => totales(ganancias, gastos), [ganancias, gastos]);

  const conError = (fn) => async (...args) => {
    setGuardando(true);
    try { await fn(...args); }
    catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  const guardarGanancia = conError(async (form) => {
    if (formGanancia?.id) await actualizarGananciaManual(formGanancia.id, form);
    else await crearGananciaManual(form);
    setFormGanancia(null);
    await recargar();
    setMsg(formGanancia?.id ? "✓ Ganancia actualizada." : "✓ Ganancia agregada.");
  });

  const borrarGanancia = conError(async (g) => {
    if (!confirm(`¿Eliminar la ganancia "${g.descripcion}" de ${fmtARS(g.monto)}?`)) return;
    await eliminarGanancia(g._id);
    await recargar();
    setMsg("✓ Ganancia eliminada.");
  });

  const guardarGasto = conError(async (form) => {
    const numero = await crearGasto(form);
    setFormGasto(null);
    await recargar();
    setMsg(`✓ Gasto ${numero} registrado.`);
  });

  const borrarGasto = conError(async (g) => {
    if (!confirm(`¿Eliminar el gasto ${g.numeroGasto} (${g.descripcion})?`)) return;
    await eliminarGasto(g._id);
    await recargar();
    setMsg("✓ Gasto eliminado.");
  });

  const resolverFecha = conError(async (pedido) => {
    await crearGananciaDePedidoConFecha(pedido, fechasAMano[pedido._id] || "");
    setSinFecha(xs => xs.filter(x => x._id !== pedido._id));
    await recargar();
    setMsg(`✓ Ganancia de ${pedido.numeroOrden} incorporada.`);
  });

  // La vista de detalle se monta en lugar de la lista, no encima: tiene su
  // propia URL y el botón Volver vuelve al tab.
  if (gastoId) {
    return (
      <DetalleGasto
        gastoId={gastoId}
        onVolver={onVolver}
        onCambios={recargar}
        setMsg={setMsg}
      />
    );
  }

  // 994 px de columna de contenido. Acciones lleva dos botones de 27 + gap.
  const COL_GAN = "110px 1fr 150px 70px";
  const COL_GAS = "110px 110px 1fr 150px 70px";

  return (
    <>
      <h2 style={{ fontSize: 28, margin: "0 0 20px" }}>Finanzas</h2>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <Tarjeta label="Saldo actual" valor={t.saldo} negativo={t.saldo < 0} destacada/>
        <Tarjeta label="Total ganancias" valor={t.ingresos}/>
        <Tarjeta label="Total gastos" valor={t.egresos}/>
      </div>

      {/* Pedidos pagados sin fecha de pago. No se les inventa el día: poner
          "hoy" en una venta de hace meses ensucia el histórico y después no
          hay forma de saber cuáles se inventaron. */}
      {sinFecha.length > 0 && (
        <div style={{
          padding: "14px 16px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E",
          marginBottom: 20, fontSize: 13, lineHeight: 1.6,
        }}>
          <strong>
            {sinFecha.length} pedido(s) figuran pagados pero no guardaron cuándo.
          </strong>
          <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 12px" }}>
            Son anteriores a que se registrara la fecha de pago. Elegí vos la fecha de
            cada uno para incorporarlos a Ganancias.
          </div>
          {sinFecha.map(p => (
            <div key={p._id} style={{
              display: "grid", gridTemplateColumns: "1fr 170px 110px",
              gap: 12, alignItems: "end", marginTop: 10,
            }}>
              <div style={{ fontSize: 13 }}>
                <TKPill variant="outline">{p.numeroOrden}</TKPill>{" "}
                {p.clienteNombre} — <strong>{fmtARS(p.precioTotal || 0)}</strong>
              </div>
              <TKInput label="Fecha de pago" type="date"
                value={fechasAMano[p._id] || ""}
                onChange={e => setFechasAMano(f => ({ ...f, [p._id]: e.target.value }))}/>
              <TKButton onClick={() => resolverFecha(p)} disabled={guardando}>Incorporar</TKButton>
            </div>
          ))}
        </div>
      )}

      {/* ── Ganancias ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={tituloBloque}>Ganancias</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Las de un pedido aparecen solas al marcarlo pagado y se gobiernan desde Pedidos.
          </div>
        </div>
        <TKButton onClick={() => setFormGanancia({ fecha: hoyEnInput(), descripcion: "", monto: "" })}
          icon={<Icon.plus size={14}/>}>Agregar ganancia</TKButton>
      </div>

      {formGanancia && (
        <FormMovimiento
          titulo={formGanancia.id ? "Editar ganancia" : "Nueva ganancia"}
          inicial={formGanancia}
          textoDescripcion="Motivo"
          guardando={guardando}
          onGuardar={guardarGanancia}
          onCancelar={() => setFormGanancia(null)}
        />
      )}

      <div style={{ ...cabecera, display: "grid", gridTemplateColumns: COL_GAN, gap: 10, padding: "10px 12px", background: "var(--bg-alt)" }}>
        <div>Fecha</div><div>Pedido</div><div>Monto</div><div/>
      </div>
      {ganancias.map(g => (
        <div key={g._id} style={{
          display: "grid", gridTemplateColumns: COL_GAN, gap: 10,
          padding: "12px", borderBottom: "1px solid var(--line)", fontSize: 12.5,
          alignItems: "center",
        }}>
          <div style={{ color: "var(--muted)" }}>{fmtDia(g.fecha)}</div>
          <div>
            {esAutomatica(g) ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <TKPill variant="outline">{g.numeroOrden || "—"}</TKPill>
                {/* Decir que es automática es lo que explica por qué no tiene
                    botones: si no, la fila parece rota. */}
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                  color: AZUL, background: `${AZUL}18`, border: `1px solid ${AZUL}44`,
                  padding: "2px 7px", borderRadius: 2,
                }}>
                  Automática
                </span>
              </span>
            ) : (
              <span style={{ fontWeight: 600 }}>{g.descripcion || "—"}</span>
            )}
          </div>
          <div style={{ fontWeight: 700, color: "#4a7a52" }}>{fmtARS(g.monto || 0)}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {!esAutomatica(g) && (
              <>
                <button style={actionBtn} title="Editar"
                  onClick={() => setFormGanancia({
                    id: g._id, fecha: inputDesdeFecha(g.fecha),
                    descripcion: g.descripcion || "", monto: String(g.monto ?? ""),
                  })}>
                  <Icon.spark size={13}/>
                </button>
                <button style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"
                  onClick={() => borrarGanancia(g)}>
                  <Icon.trash size={13}/>
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {!loading && ganancias.length === 0 && (
        <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>
          Todavía no hay ganancias registradas.
        </div>
      )}

      {/* ── Gastos ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "32px 0 12px" }}>
        <div>
          <div style={tituloBloque}>Gastos</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Todos de carga manual. Abrí uno para escribir el detalle de la compra.
          </div>
        </div>
        <TKButton onClick={() => setFormGasto({ fecha: hoyEnInput(), descripcion: "", monto: "" })}
          icon={<Icon.plus size={14}/>}>Agregar gasto</TKButton>
      </div>

      {formGasto && (
        <FormMovimiento
          titulo="Nuevo gasto"
          inicial={formGasto}
          textoDescripcion="Descripción"
          guardando={guardando}
          onGuardar={guardarGasto}
          onCancelar={() => setFormGasto(null)}
        />
      )}

      <div style={{ ...cabecera, display: "grid", gridTemplateColumns: COL_GAS, gap: 10, padding: "10px 12px", background: "var(--bg-alt)" }}>
        <div>N°</div><div>Fecha</div><div>Descripción</div><div>Monto</div><div/>
      </div>
      {gastos.map(g => (
        <div key={g._id} style={{
          display: "grid", gridTemplateColumns: COL_GAS, gap: 10,
          padding: "12px", borderBottom: "1px solid var(--line)", fontSize: 12.5,
          alignItems: "center", cursor: "pointer",
        }}
          onClick={() => onAbrirGasto(g._id)}
          title="Ver el detalle de la compra"
        >
          <div><TKPill variant="outline">{g.numeroGasto || "—"}</TKPill></div>
          <div style={{ color: "var(--muted)" }}>{fmtDia(g.fecha)}</div>
          <div style={{ fontWeight: 600 }}>
            {g.descripcion || "—"}
            {g.detalle ? (
              <span style={{ color: "var(--muted)", fontWeight: 400 }}> · con detalle</span>
            ) : null}
          </div>
          <div style={{ fontWeight: 700, color: "#B56B3E" }}>{fmtARS(g.monto || 0)}</div>
          {/* stopPropagation: la fila entera abre el detalle, y sin esto
              borrar también navegaría a un gasto que ya no existe. */}
          <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
            <button style={actionBtn} title="Ver detalle" onClick={() => onAbrirGasto(g._id)}>
              <Icon.chevron size={13}/>
            </button>
            <button style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"
              onClick={() => borrarGasto(g)}>
              <Icon.trash size={13}/>
            </button>
          </div>
        </div>
      ))}
      {!loading && gastos.length === 0 && (
        <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>
          Todavía no hay gastos registrados.
        </div>
      )}

      {loading && (
        <div style={{ padding: 40, color: "var(--muted)" }}>Cargando finanzas...</div>
      )}
    </>
  );
}
