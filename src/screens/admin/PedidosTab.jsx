import { useState, useMemo } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import { fmtFecha } from './InventarioTab.jsx';
import {
  cargarPedidos, siguienteNumeroOrden, crearPedido, eliminarPedido,
  marcarEntregado, marcarPedidoImpreso, planDeConsumo, planDeInsumos,
} from '../../lib/inventario.js';
import {
  agruparConsumo, validarStock, textoFaltante,
} from '../../lib/consumoPedido.js';
import { buscarFilamento } from '../../lib/disponibilidad.js';

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const selectStyle = {
  width: "100%", padding: "12px 14px", background: "var(--bg)",
  border: "1px solid var(--line)",
  fontSize: 14, color: "var(--text)", borderRadius: 4, outline: "none",
};

const labelStyle = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

const lineaVacia = () => ({ productoId: "", cantidad: 1, precioUnitario: 0 });

/**
 * Código visible de una línea de pedido. Prioriza el snapshot guardado al
 * crear el pedido; si es un pedido viejo que no lo tiene, lo resuelve contra
 * el catálogo actual, y si el producto ya no existe muestra el ID de
 * documento como último recurso.
 */
function codigoDeLinea(item, productos = []) {
  if (item.productoCodigo) return item.productoCodigo;
  const p = productos.find(x => x._id === item.productoId);
  if (p?.id) return p.id;
  return item.productoId ? `doc ${item.productoId.slice(0, 8)}…` : "—";
}

// ─── Tab Pedidos ─────────────────────────────────────────────────────
export function PedidosTab({ pedidos, productos, filamentos, insumos = [], onPedidosChange, onInventarioChange, setMsg }) {
  const [showForm, setShowForm] = useState(false);
  const [cliente, setCliente] = useState("");
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [expandido, setExpandido] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null); // pedido en el modal
  const [guardando, setGuardando] = useState(false);

  const productosOrdenados = useMemo(
    () => [...productos].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [productos]
  );

  const totales = lineas.map(l => (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0));
  const precioTotal = totales.reduce((s, n) => s + n, 0);

  const upLinea = (i, patch) => setLineas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  const elegirProducto = (i, productoId) => {
    const p = productos.find(x => x._id === productoId);
    upLinea(i, { productoId, precioUnitario: p?.price ?? 0 });
  };

  const resetForm = () => {
    setCliente("");
    setLineas([lineaVacia()]);
    setShowForm(false);
  };

  const guardarPedido = async () => {
    if (!cliente.trim()) return alert("El nombre del cliente es obligatorio.");
    const validas = lineas.filter(l => l.productoId && (Number(l.cantidad) || 0) > 0);
    if (validas.length === 0) return alert("Agregá al menos un producto con cantidad mayor a 0.");

    setGuardando(true);
    try {
      const frescos = await cargarPedidos();
      const numeroOrden = siguienteNumeroOrden(frescos);
      await crearPedido({
        numeroOrden,
        clienteNombre: cliente,
        items: validas.map(l => {
          const p = productos.find(x => x._id === l.productoId);
          return {
            productoId: l.productoId,
            productoCodigo: p?.id || "",
            productoNombre: p?.name || "Producto",
            cantidad: Number(l.cantidad) || 0,
            precioUnitario: Number(l.precioUnitario) || 0,
          };
        }),
      });
      setMsg(`✓ Pedido ${numeroOrden} creado.`);
      resetForm();
      await onPedidosChange();
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  const toggleEntregado = async (pedido) => {
    try {
      await marcarEntregado(pedido, !pedido.entregado);
      setMsg(`✓ Pedido ${pedido.numeroOrden} marcado como ${!pedido.entregado ? "entregado" : "no entregado"}.`);
      await onPedidosChange();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const borrarPedido = async (pedido) => {
    if (!confirm(`¿Eliminar el pedido ${pedido.numeroOrden}? No se revierte el inventario.`)) return;
    try {
      await eliminarPedido(pedido._id);
      setMsg("✓ Pedido eliminado.");
      await onPedidosChange();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const COL = "110px 1.4fr 90px 120px 110px 110px 110px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Pedidos</h2>
        <TKButton onClick={() => setShowForm(v => !v)} icon={<Icon.plus size={14}/>}>Nuevo pedido</TKButton>
      </div>

      {/* ── Formulario de carga ── */}
      {showForm && (
        <div style={{ padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)", marginBottom: 24 }}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>Nuevo pedido</div>

          <div style={{ maxWidth: 360, marginBottom: 20 }}>
            <TKInput label="Nombre del cliente" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Ana Pérez" />
          </div>

          <div style={{ ...labelStyle, marginBottom: 10 }}>Productos del pedido</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {lineas.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 130px 110px 36px", gap: 10, alignItems: "end" }}>
                <div>
                  {i === 0 && <div style={labelStyle}>Producto</div>}
                  <select value={l.productoId} onChange={e => elegirProducto(i, e.target.value)} style={selectStyle}>
                    <option value="">Seleccionar producto...</option>
                    {productosOrdenados.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.id ? `${p.id} — ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Cantidad</div>}
                  <TKInput type="number" value={l.cantidad} onChange={e => upLinea(i, { cantidad: e.target.value })} />
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Precio unitario</div>}
                  <TKInput type="number" value={l.precioUnitario} onChange={e => upLinea(i, { precioUnitario: e.target.value })} />
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Subtotal</div>}
                  <div style={{ padding: "12px 0", fontWeight: 700 }}>{fmtARS(totales[i] || 0)}</div>
                </div>
                <button
                  onClick={() => setLineas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}
                  style={{ ...actionBtn, color: "#c64138", justifyContent: "center", height: 42 }}
                  title="Quitar línea"
                >
                  <Icon.trash size={14}/>
                </button>
              </div>
            ))}
          </div>

          <button onClick={() => setLineas(ls => [...ls, lineaVacia()])} style={{
            background: "none", border: "1px dashed var(--line-strong)",
            padding: "8px 14px", cursor: "pointer", color: "var(--muted)",
            fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
          }}>
            <Icon.plus size={12}/> Agregar producto
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <div>
              <div style={labelStyle}>Precio total</div>
              <div style={{ fontSize: 26, color: "var(--accent)" }}>{fmtARS(precioTotal)}</div>
            </div>
            <div style={{ flex: 1 }}/>
            <TKButton onClick={guardarPedido} disabled={guardando}>
              {guardando ? "Guardando..." : "Crear pedido"}
            </TKButton>
            <TKButton variant="outline" onClick={resetForm}>Cancelar</TKButton>
          </div>
        </div>
      )}

      {/* ── Listado ── */}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""} ·{" "}
        {pedidos.filter(p => p.estadoImpresion !== "impreso").length} pendiente
        {pedidos.filter(p => p.estadoImpresion !== "impreso").length !== 1 ? "s" : ""} de impresión
      </div>

      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 900 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Orden</div><div>Cliente</div><div>Productos</div><div>Total</div>
            <div>Impresión</div><div>Entrega</div><div>Acciones</div>
          </div>

          {pedidos.map(pedido => {
            const impreso = pedido.estadoImpresion === "impreso";
            const abierto = expandido === pedido._id;
            return (
              <div key={pedido._id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: COL,
                  gap: 12, padding: "14px 12px", fontSize: 13, alignItems: "center",
                }}>
                  <div
                    onClick={() => setExpandido(abierto ? null : pedido._id)}
                    style={{ fontWeight: 700, cursor: "pointer", color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span style={{ transition: "transform .2s", transform: abierto ? "rotate(90deg)" : "none" }}>›</span>
                    {pedido.numeroOrden}
                  </div>
                  <div style={{ fontWeight: 600 }}>{pedido.clienteNombre}</div>
                  <div>{(pedido.items || []).length}</div>
                  <div style={{ fontWeight: 700 }}>{fmtARS(pedido.precioTotal || 0)}</div>
                  <div>
                    <TKPill variant={impreso ? "accent" : "outline"}>{impreso ? "Impreso" : "Pendiente"}</TKPill>
                  </div>
                  <div>
                    <TKPill variant={pedido.entregado ? "dark" : "outline"}>{pedido.entregado ? "Entregado" : "Sin entregar"}</TKPill>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => !impreso && setImprimiendo(pedido)}
                      disabled={impreso}
                      style={{ ...actionBtn, opacity: impreso ? 0.4 : 1, cursor: impreso ? "not-allowed" : "pointer" }}
                      title={impreso ? "Ya está impreso" : "Marcar como impreso"}
                    >
                      <Icon.check size={14}/>
                    </button>
                    <button
                      onClick={() => toggleEntregado(pedido)}
                      style={{ ...actionBtn, color: pedido.entregado ? "#4a7a52" : "var(--text)" }}
                      title={pedido.entregado ? "Marcar como no entregado" : "Marcar como entregado"}
                    >
                      <Icon.truck size={14}/>
                    </button>
                    <button onClick={() => borrarPedido(pedido)} style={{ ...actionBtn, color: "#c64138" }} title="Eliminar">
                      <Icon.trash size={14}/>
                    </button>
                  </div>
                </div>

                {abierto && (
                  <div style={{ padding: "4px 12px 18px 34px", background: "var(--bg-alt)" }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "2fr 90px 130px 130px",
                      gap: 10, padding: "8px 0", fontSize: 10, textTransform: "uppercase",
                      letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700,
                    }}>
                      <div>Producto</div><div>Cantidad</div><div>Precio unit.</div><div>Subtotal</div>
                    </div>
                    {(pedido.items || []).map((it, i) => (
                      <div key={i} style={{
                        display: "grid", gridTemplateColumns: "2fr 90px 130px 130px",
                        gap: 10, padding: "8px 0", fontSize: 13, borderTop: "1px solid var(--line)",
                      }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{it.productoNombre}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                            {codigoDeLinea(it, productos)}
                          </div>
                        </div>
                        <div>{it.cantidad}</div>
                        <div>{fmtARS(it.precioUnitario || 0)}</div>
                        <div style={{ fontWeight: 600 }}>{fmtARS(it.subtotal || 0)}</div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 24, marginTop: 14, fontSize: 11, color: "var(--muted)" }}>
                      <span>Creado: {fmtFecha(pedido.createdAt)}</span>
                      <span>Impreso: {fmtFecha(pedido.impresoAt)}</span>
                      <span>Entregado: {fmtFecha(pedido.entregadoAt)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {pedidos.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          Todavía no hay pedidos cargados.
        </div>
      )}

      {imprimiendo && (
        <ModalImpresion
          pedido={imprimiendo}
          productos={productos}
          filamentos={filamentos}
          insumos={insumos}
          onClose={() => setImprimiendo(null)}
          onDone={async (mensaje) => {
            setImprimiendo(null);
            setMsg(mensaje);
            await onPedidosChange();
            await onInventarioChange();
          }}
        />
      )}
    </>
  );
}

// ─── Modal: marcar como impreso + gramos desperdiciados ──────────────
function ModalImpresion({ pedido, productos, filamentos, insumos = [], onClose, onDone }) {
  const plan = useMemo(() => planDeConsumo(pedido, productos), [pedido, productos]);
  const planInsumos = useMemo(() => planDeInsumos(pedido, productos), [pedido, productos]);
  const [desperdicios, setDesperdicios] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [errorStock, setErrorStock] = useState("");   // faltante detectado por la transacción

  // Validación en vivo, con la MISMA lógica que corre dentro de la transacción:
  // se recalcula con cada cambio de desperdicio.
  const validacion = useMemo(() => {
    const consumo = agruparConsumo(plan, desperdicios, planInsumos);
    return validarStock(
      consumo,
      (f) => {
        const encontrado = buscarFilamento(filamentos, f.material, f.color);
        return encontrado ? { id: encontrado._id, disponible: Number(encontrado.cantidadGramos) || 0 } : null;
      },
      (i) => {
        const encontrado = insumos.find(x => x._id === i.insumoId);
        return encontrado ? { id: encontrado._id, disponible: Number(encontrado.cantidadDisponible) || 0 } : null;
      }
    );
  }, [plan, desperdicios, planInsumos, filamentos, insumos]);

  const totalPorLinea = (l) => l.cantidadConsumida + (Number(desperdicios[l.clave]) || 0);

  const confirmar = async () => {
    if (!validacion.ok) return;   // el botón ya está deshabilitado, pero por las dudas
    setGuardando(true);
    setErrorStock("");
    try {
      const { advertencias } = await marcarPedidoImpreso(
        pedido, plan, desperdicios, filamentos, planInsumos, insumos
      );
      const base = `✓ Pedido ${pedido.numeroOrden} marcado como impreso e inventario descontado.`;
      await onDone(advertencias.length ? `${base} Atención: ${advertencias.join(" ")}` : base);
    } catch (err) {
      setGuardando(false);
      if (err.name === "StockInsuficienteError") {
        // La transacción releyó el stock y ya no alcanza: alguien descontó en
        // el medio. No se escribió nada.
        setErrorStock(
          err.message +
          " El stock cambió desde que abriste el modal; cerrá y volvé a intentar."
        );
      } else {
        alert("Error al descontar inventario: " + err.message);
      }
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg)", border: "1px solid var(--line)",
          maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto",
          padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h3 style={{ fontSize: 24, margin: 0 }}>Marcar {pedido.numeroOrden} como impreso</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
            <Icon.close size={18}/>
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 0, marginBottom: 20 }}>
          Ingresá los gramos desperdiciados por fallas para cada filamento del pedido (puede ser 0).
          Al confirmar se descuenta del inventario el consumo de receta más el desperdicio, y se
          registra el gasto en el historial de cada filamento.
        </p>

        {planInsumos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
              Insumos a descontar
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
              Se descuentan del catálogo automáticamente. No llevan desperdicio.
            </div>
            {planInsumos.map(l => {
              const enCatalogo = insumos.find(i => i._id === l.insumoId);
              const alcanza = enCatalogo && (Number(enCatalogo.cantidadDisponible) || 0) >= l.unidadesConsumidas;
              return (
                <div key={l.clave} style={{
                  display: "grid", gridTemplateColumns: "1.6fr 1fr 110px",
                  gap: 10, padding: "8px 0", fontSize: 12, borderTop: "1px solid var(--line)",
                  alignItems: "center",
                }}>
                  <div style={{ fontWeight: 600 }}>{l.nombre}</div>
                  <div style={{ color: "var(--muted)" }}>
                    {l.productoNombre} — {l.cantidadPorUnidad} × {l.cantidad} u.
                  </div>
                  <div style={{ fontWeight: 700, color: alcanza ? "var(--text)" : "#c64138" }}>
                    −{l.unidadesConsumidas} u.
                    {!alcanza && (
                      <div style={{ fontSize: 10, fontWeight: 400 }}>
                        {enCatalogo ? "queda negativo" : "no está en el catálogo"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {plan.length === 0 ? (
          <div style={{ padding: "16px 18px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E", fontSize: 13, marginBottom: 20 }}>
            Ningún producto de este pedido tiene receta cargada: no se descontará inventario.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {plan.map(l => (
              <div key={l.clave} style={{ padding: 14, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{l.productoNombre}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  {l.material} · {l.color} — {l.gramosPorUnidad} g × {l.cantidad} u ={" "}
                  <strong style={{ color: "var(--text)" }}>{l.cantidadConsumida} g</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 14, alignItems: "center" }}>
                  <TKInput
                    label="Desperdicio (g)"
                    type="number"
                    value={desperdicios[l.clave] ?? 0}
                    onChange={e => setDesperdicios(d => ({ ...d, [l.clave]: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: "var(--muted)", paddingTop: 16 }}>
                    Total a descontar: <strong style={{ color: "var(--text)" }}>{totalPorLinea(l)} g</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(!validacion.ok || errorStock) && (
          <div style={{
            padding: "14px 16px", background: "#c6413812",
            borderLeft: "3px solid #c64138", marginBottom: 20,
            fontSize: 13, lineHeight: 1.6,
          }}>
            <strong style={{ color: "#c64138" }}>
              {errorStock || "No se puede marcar como impreso: falta stock."}
            </strong>
            {!errorStock && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
                {validacion.faltantes.map((f, i) => (
                  <li key={i}>
                    {textoFaltante(f)}
                    {!f.existe && " — no está cargado en inventario"}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ color: "var(--muted)", marginTop: 8, fontSize: 12 }}>
              Cargá el stock que falta desde
              {" "}{validacion.faltantes.some(f => f.unidad === "g") ? "Inventario" : ""}
              {validacion.faltantes.some(f => f.unidad === "g") &&
               validacion.faltantes.some(f => f.unidad === "u.") ? " e " : ""}
              {validacion.faltantes.some(f => f.unidad === "u.") ? "Insumos" : ""}
              {" "}y volvé a intentar.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <TKButton variant="outline" onClick={onClose}>Cancelar</TKButton>
          <TKButton onClick={confirmar} disabled={guardando || !validacion.ok}>
            {guardando ? "Procesando..."
              : !validacion.ok ? "Falta stock"
              : "Confirmar impresión"}
          </TKButton>
        </div>
      </div>
    </div>
  );
}
