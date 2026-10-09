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
import { TablaConTope } from '../../components/TablaConTope.jsx';
import { fmtDia } from '../../lib/fechas.js';
import { montoDeGasto, usosDeInsumo } from '../../lib/gastoItems.js';
import { crearInsumo, eliminarInsumo } from '../../lib/insumos.js';
import { ID_TIPO_BASE, NOMBRE_TIPO_BASE } from '../../lib/tiposInsumo.js';
import {
  materialesUsados, coloresUsados, marcasUsadas, ownersUsados,
} from '../../lib/opcionesFilamento.js';
import { cargarOcultas, ocultarOpcion, filtrarVisibles } from '../../lib/opcionesOcultas.js';

// Diez filas por lista antes del scroll interno. Es su propio tope: las listas
// de Finanzas tienen menos competencia por la pantalla que las tres del
// detalle de un filamento, que se cortan en ocho.
const FILAS_VISIBLES = 10;

const AZUL = "#345C83";

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

const tituloBloque = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
  textTransform: "uppercase", color: "var(--muted)",
};

// Anchos fijos para lo de largo conocido; la columna sin ancho se queda con
// lo que sobra. En table-layout: fixed es lo único que define las columnas.
const ANCHO_FECHA = 104;
const ANCHO_NUMERO = 112;
const ANCHO_MONTO = 140;
const ANCHO_ACCIONES = 76;

const celdaTenue = { color: "var(--muted)" };

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "4px 6px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

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

export function FinanzasTab({
  pedidos = [], filamentos = [], insumos = [], productos = [], personalizados = [],
  gastoId = null, onAbrirGasto, onVolver, onInventarioChange, setMsg,
}) {
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

  // ── Las mismas listas que el formulario de "Nuevo filamento" ──────────
  // Salen de los filamentos que existen, no de una colección aparte, así que
  // una marca agregada acá aparece allá sin sincronizar nada. Lo único
  // guardado es qué opciones dejaron de sugerirse.
  const [ocultas, setOcultas] = useState({ material: [], color: [], marca: [], owner: [] });
  useEffect(() => { cargarOcultas().then(setOcultas); }, []);

  const listas = useMemo(() => ({
    materiales: filtrarVisibles(materialesUsados(filamentos), ocultas.material),
    colores: filtrarVisibles(coloresUsados(filamentos), ocultas.color),
    marcas: filtrarVisibles(marcasUsadas(filamentos), ocultas.marca),
    owners: filtrarVisibles(ownersUsados(filamentos), ocultas.owner),
    eliminar: async (campo, valor) => {
      const enUso = filamentos.filter(
        f => String(f?.[campo] || "").trim().toLowerCase() === valor.trim().toLowerCase()).length;
      const detalle = enUso > 0
        ? `\n\n${enUso} filamento(s) lo usan: van a conservarlo, solo deja de sugerirse.`
        : "";
      if (!confirm(`¿Eliminar "${valor}" de las opciones de ${campo}?${detalle}`)) return;
      try {
        setOcultas(await ocultarOpcion(campo, valor, ocultas));
        setMsg(`✓ "${valor}" ya no se sugiere como ${campo}.`);
      } catch (err) { setMsg("No se pudo eliminar la opción: " + err.message); }
    },
  }), [filamentos, ocultas]);

  /**
   * Crear un insumo desde el selector del ítem. Nace con UN tipo —el mismo
   * criterio de nombre que usa la migración— precio 0 y stock 0: el stock lo
   * suma recién el ítem al guardarse, no el alta.
   */
  /**
   * Devuelve el id del insumo que hay que quedar elegido: el del recién creado,
   * o el del que ya existía con ese nombre. El selector guarda ids, así que sin
   * este valor de vuelta el ítem quedaría apuntando al texto tipeado.
   */
  const crearInsumoDesdeGasto = async (nombre) => {
    const limpio = String(nombre || "").trim();
    if (!limpio) return null;
    const ya = insumos.find(i => (i.nombre || "").trim().toLowerCase() === limpio.toLowerCase());
    if (ya) {
      setMsg(`Ya existe un insumo llamado "${ya.nombre}": se eligió ese.`);
      return ya._id;
    }
    try {
      const id = await crearInsumo({
        nombre: limpio,
        tipos: [{ tipoId: ID_TIPO_BASE, nombre: NOMBRE_TIPO_BASE, precioUnidad: 0, cantidadDisponible: 0 }],
      });
      setMsg(`✓ "${limpio}" creado en el catálogo de Insumos.`);
      await onInventarioChange?.();
      return id;
    } catch (err) { setMsg("Error: " + err.message); return null; }
  };

  /**
   * Borrarlo del catálogo. Se revisan los TRES lugares donde puede estar
   * referenciado antes de tocar nada: un insumo que no está en ninguna receta
   * igual puede figurar en una compra ya cargada.
   */
  const borrarInsumoDesdeGasto = async (insumoId) => {
    const insumo = insumos.find(i => i._id === insumoId);
    const nombre = insumo?.nombre || "este insumo";
    const usos = usosDeInsumo(insumoId, { productos, personalizados, gastos });
    if (usos.length > 0) {
      alert(
        `No se puede borrar "${nombre}": está en uso en ${usos.length} lugar(es).\n\n` +
        usos.map(u => `· ${u.donde}`).join("\n") +
        `\n\nSacalo de ahí primero.`
      );
      return false;
    }
    if (!confirm(
      `¿Borrar "${nombre}" del catálogo de Insumos?\n\n` +
      `Se pierde su historial de gastos y restocks. No se puede deshacer.`
    )) return false;
    try {
      await eliminarInsumo(insumoId);
      setMsg(`✓ "${nombre}" eliminado del catálogo.`);
      await onInventarioChange?.();
      return true;
    } catch (err) { setMsg("Error: " + err.message); return false; }
  };

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
        filamentos={filamentos}
        insumos={insumos}
        productos={productos}
        personalizados={personalizados}
        gastos={gastos}
        listas={listas}
        onCrearInsumo={crearInsumoDesdeGasto}
        onBorrarInsumo={borrarInsumoDesdeGasto}
        onInventarioChange={onInventarioChange}
        onVolver={onVolver}
        onCambios={recargar}
        setMsg={setMsg}
      />
    );
  }

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

      <TablaConTope
        filas={FILAS_VISIBLES}
        vacio={loading ? "" : "Todavía no hay ganancias registradas."}
        columnas={[
          { titulo: "Fecha", ancho: ANCHO_FECHA },
          { titulo: "Pedido" },
          { titulo: "Monto", ancho: ANCHO_MONTO, num: true },
          { titulo: "", ancho: ANCHO_ACCIONES },
        ]}
      >
        {ganancias.map(g => (
          <tr key={g._id}>
            <td style={celdaTenue}>{fmtDia(g.fecha)}</td>
            <td title={esAutomatica(g) ? `${g.numeroOrden || ""} · automática` : (g.descripcion || "")}>
              {esAutomatica(g) ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <TKPill variant="outline">{g.numeroOrden || "—"}</TKPill>
                  {/* Decir que es automática es lo que explica por qué no
                      tiene botones: si no, la fila parece rota. */}
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
            </td>
            <td className="num" style={{ fontWeight: 700, color: "#4a7a52" }}>{fmtARS(g.monto || 0)}</td>
            <td>
              {!esAutomatica(g) && (
                <span style={{ display: "flex", gap: 4 }}>
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
                </span>
              )}
            </td>
          </tr>
        ))}
      </TablaConTope>

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

      {/* Al detalle se entra SOLO por su botón. Con la fila entera clickeable,
          apuntar al tacho y errarle por un píxel navegaba a otra pantalla en
          vez de borrar, y no había forma de seleccionar el texto de una celda. */}
      <TablaConTope
        filas={FILAS_VISIBLES}
        vacio={loading ? "" : "Todavía no hay gastos registrados."}
        columnas={[
          { titulo: "Fecha", ancho: ANCHO_FECHA },
          { titulo: "Gasto", ancho: ANCHO_NUMERO },
          { titulo: "Descripción" },
          { titulo: "Monto", ancho: ANCHO_MONTO, num: true },
          { titulo: "", ancho: ANCHO_ACCIONES },
        ]}
      >
        {gastos.map(g => (
          <tr key={g._id}>
            <td style={celdaTenue}>{fmtDia(g.fecha)}</td>
            <td><TKPill variant="outline">{g.numeroGasto || "—"}</TKPill></td>
            <td title={g.descripcion || ""}>
              <span style={{ fontWeight: 600 }}>{g.descripcion || "—"}</span>
              {(g.items || []).length > 0 ? (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  {" "}· {g.items.length} ítem{g.items.length === 1 ? "" : "s"}
                </span>
              ) : g.detalle ? (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}> · con detalle</span>
              ) : null}
            </td>
            <td className="num" style={{ fontWeight: 700, color: "#B56B3E" }}>{fmtARS(montoDeGasto(g))}</td>
            <td>
              <span style={{ display: "flex", gap: 4 }}>
                {/* El mismo Icon.list que abre el detalle de un filamento en
                    Inventario: dos tablas que hacen lo mismo con el mismo ícono. */}
                <button style={actionBtn} title="Ver detalle" onClick={() => onAbrirGasto(g._id)}>
                  <Icon.list size={13}/>
                </button>
                <button style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"
                  onClick={() => borrarGasto(g)}>
                  <Icon.trash size={13}/>
                </button>
              </span>
            </td>
          </tr>
        ))}
      </TablaConTope>

      {loading && (
        <div style={{ padding: 40, color: "var(--muted)" }}>Cargando finanzas...</div>
      )}
    </>
  );
}
