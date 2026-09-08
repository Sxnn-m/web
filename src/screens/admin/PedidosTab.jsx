import { useState, useMemo } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import { fmtFecha } from './InventarioTab.jsx';
import {
  cargarPedidos, siguienteNumeroOrden, crearPedido, eliminarPedido,
  marcarEntregado, marcarPagado, estaPagado, marcarPedidoImpreso, planDeConsumo, planDeInsumos,
  buscarProductoDeLinea,
} from '../../lib/inventario.js';
import {
  agruparConsumo, validarStock, textoFaltante,
} from '../../lib/consumoPedido.js';
import { buscarFilamento } from '../../lib/disponibilidad.js';
import { etiquetaSeleccion } from '../../lib/variantesInsumo.js';

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

const lineaVacia = () =>
  ({ tipo: "catalogo", productoId: "", varianteId: "", opcionesInsumo: {},
     cantidad: 1, precioUnitario: 0 });

/**
 * Código visible de una línea de pedido. Prioriza el snapshot guardado al
 * crear el pedido; si es un pedido viejo que no lo tiene, lo resuelve contra
 * el catálogo actual, y si el producto ya no existe muestra el ID de
 * documento como último recurso.
 */
function codigoDeLinea(item, productos = [], personalizados = []) {
  if (item.productoCodigo) return item.productoCodigo;
  const p = buscarProductoDeLinea(item, productos, personalizados);
  if (p?.id) return p.id;
  if (p?.clienteNombre) return p.clienteNombre;
  return item.productoId ? `doc ${item.productoId.slice(0, 8)}…` : "—";
}

/** Badge chico de origen de la línea. */
function BadgeTipo({ tipo }) {
  const esPers = tipo === "personalizado";
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 2,
      background: esPers ? "#B56B3E18" : "var(--beige)",
      color: esPers ? "#B56B3E" : "var(--anchor)",
      fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
    }}>
      {esPers ? "Personalizado" : "Catálogo"}
    </span>
  );
}

/**
 * Buscador con autocompletado: filtra en vivo por nombre o por código y
 * muestra las coincidencias para elegir con un clic. Misma UI para catálogo
 * y personalizados; solo cambia la fuente y qué campos entran en la búsqueda.
 */
/**
 * Elige la variante del producto de la línea. Es lo que decide de qué rollo
 * se descuenta al marcar el pedido como impreso, así que se listan TODAS las
 * variantes: acá manda lo que se imprimió, no lo que hay en stock. Las que no
 * tienen stock se marcan, pero se pueden elegir igual.
 */
function VarianteSelect({ variantes = [], valor, onChange, deshabilitado }) {
  if (deshabilitado) {
    return (
      <div style={{ padding: "12px 10px", fontSize: 12, color: "var(--muted)" }}>
        Elegí un producto
      </div>
    );
  }
  if (variantes.length === 0) {
    return (
      <div style={{ padding: "12px 10px", fontSize: 11, color: "#B56B3E", lineHeight: 1.4 }}>
        Sin variantes: no se va a poder descontar stock
      </div>
    );
  }
  return (
    <select
      value={valor || ""}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", padding: "12px 10px", background: "var(--bg)",
        border: `1px solid ${valor ? "var(--line)" : "#c64138"}`, borderRadius: 4,
        fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <option value="">— Elegir —</option>
      {variantes.map(v => (
        <option key={v.id} value={v.id}>
          {v.nombre || "(sin nombre)"}{v.disponible ? "" : " · sin stock"}
        </option>
      ))}
    </select>
  );
}

/**
 * Una opción por grupo de variante de insumo. Como con la variante de color,
 * acá se listan TODAS: manda lo que se vendió, no lo que hay hoy en stock.
 */
function OpcionesInsumoSelect({ grupos = [], valores = {}, onChange, deshabilitado }) {
  if (deshabilitado || grupos.length === 0) {
    return (
      <div style={{ padding: "12px 10px", fontSize: 11, color: "var(--muted)" }}>
        {deshabilitado ? "—" : "Sin grupos"}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {grupos.map(g => (
        <select
          key={g.id}
          value={valores[g.id] || ""}
          onChange={e => onChange(g.id, e.target.value)}
          title={g.nombre}
          style={{
            width: "100%", padding: "9px 8px", background: "var(--bg)",
            border: `1px solid ${valores[g.id] ? "var(--line)" : "#c64138"}`,
            borderRadius: 4, fontSize: 12, color: "var(--text)", outline: "none",
            boxSizing: "border-box", fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          <option value="">{g.nombre || "Grupo"}: elegir</option>
          {(g.opciones || []).map(o => (
            <option key={o.id} value={o.id}>
              {o.nombre}{o.disponible ? "" : " · sin stock"}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}

function BuscadorProducto({ opciones, valorId, onSelect, placeholder }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);

  const elegida = opciones.find(o => o._id === valorId) || null;
  const q = texto.trim().toLowerCase();
  const coincidencias = q
    ? opciones.filter(o => o.busqueda.includes(q))
    : opciones;

  const elegir = (o) => {
    onSelect(o._id);
    setTexto("");
    setAbierto(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        value={abierto ? texto : (elegida ? elegida.etiqueta : texto)}
        onChange={e => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => { setTexto(""); setAbierto(true); }}
        // El blur se demora para que el clic en una opción llegue primero.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        style={{
          ...selectStyle,
          borderColor: elegida ? "var(--accent)" : "var(--line)",
        }}
      />

      {abierto && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "var(--bg)", border: "1px solid var(--line-strong)",
          maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.15)",
        }}>
          {coincidencias.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--muted)" }}>
              No se encontraron productos
            </div>
          ) : coincidencias.map(o => (
            <div
              key={o._id}
              onMouseDown={() => elegir(o)}
              style={{
                padding: "10px 14px", cursor: "pointer", fontSize: 13,
                borderBottom: "1px solid var(--line)",
                background: o._id === valorId ? "var(--bg-alt)" : "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-alt)")}
              onMouseLeave={e => (e.currentTarget.style.background = o._id === valorId ? "var(--bg-alt)" : "transparent")}
            >
              <div style={{ fontWeight: 600 }}>{o.nombre}</div>
              {o.detalle && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{o.detalle}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Pedidos ─────────────────────────────────────────────────────
export function PedidosTab({ pedidos, productos, personalizados = [], filamentos, insumos = [], onPedidosChange, onInventarioChange, setMsg }) {
  const [showForm, setShowForm] = useState(false);
  const [cliente, setCliente] = useState("");
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [expandido, setExpandido] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null); // pedido en el modal
  const [guardando, setGuardando] = useState(false);

  // Opciones normalizadas del buscador. Cada colección aporta su propio campo
  // identificatorio: el código TKPx en catálogo, el nombre del cliente en
  // personalizados. Los dos entran en la búsqueda junto con el nombre.
  const opcionesCatalogo = useMemo(() => [...productos]
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map(p => ({
      _id: p._id,
      nombre: p.name || "(sin nombre)",
      codigo: p.id || "",
      etiqueta: p.id ? `${p.id} — ${p.name}` : (p.name || ""),
      detalle: p.id || "",
      price: p.price,
      variantes: p.variantes || [],
      gruposInsumo: p.variantesInsumo || [],
      busqueda: `${p.name || ""} ${p.id || ""}`.toLowerCase(),
    })), [productos]);

  const opcionesPersonalizado = useMemo(() => [...personalizados]
    .sort((a, b) => (a.clienteNombre || "").localeCompare(b.clienteNombre || ""))
    .map(p => ({
      _id: p._id,
      nombre: p.name || "(sin nombre)",
      codigo: p.clienteNombre || "",
      etiqueta: p.clienteNombre ? `${p.clienteNombre} — ${p.name}` : (p.name || ""),
      detalle: p.clienteNombre ? `Cliente: ${p.clienteNombre}` : "",
      price: p.price,
      variantes: p.variantes || [],
      gruposInsumo: p.variantesInsumo || [],
      busqueda: `${p.name || ""} ${p.clienteNombre || ""}`.toLowerCase(),
    })), [personalizados]);

  const opcionesDe = (tipo) => tipo === "personalizado" ? opcionesPersonalizado : opcionesCatalogo;

  const totales = lineas.map(l => (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0));
  const precioTotal = totales.reduce((s, n) => s + n, 0);

  const upLinea = (i, patch) => setLineas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  const elegirProducto = (i, tipo, productoId) => {
    const o = opcionesDe(tipo).find(x => x._id === productoId);
    const variantes = o?.variantes || [];
    upLinea(i, {
      productoId,
      precioUnitario: o?.price ?? 0,
      // Con una sola variante no hay nada que elegir: se preselecciona para
      // no obligar a un clic que siempre daría lo mismo.
      varianteId: variantes.length === 1 ? variantes[0].id : "",
      // Ídem cada grupo de insumo con una sola opción.
      opcionesInsumo: Object.fromEntries(
        (o?.gruposInsumo || [])
          .filter(g => (g.opciones || []).length === 1)
          .map(g => [g.id, g.opciones[0].id])),
    });
  };

  // Cambiar de tipo limpia la selección: el producto elegido es de la otra
  // colección y no tiene sentido conservarlo.
  const cambiarTipo = (i, tipo) =>
    upLinea(i, { tipo, productoId: "", varianteId: "", opcionesInsumo: {}, precioUnitario: 0 });

  const resetForm = () => {
    setCliente("");
    setLineas([lineaVacia()]);
    setShowForm(false);
  };

  const guardarPedido = async () => {
    if (!cliente.trim()) return alert("El nombre del cliente es obligatorio.");
    const validas = lineas.filter(l => l.productoId && (Number(l.cantidad) || 0) > 0);
    // Una línea de un producto CON variantes pero sin elegir no se guarda: al
    // marcar el pedido como impreso no habría de qué rollo descontar.
    const sinVariante = validas.filter(l => {
      const o = opcionesDe(l.tipo).find(x => x._id === l.productoId);
      return (o?.variantes || []).length > 0 && !l.varianteId;
    });
    if (sinVariante.length > 0) {
      return alert(
        `Elegí la variante de: ${sinVariante.map(l =>
          opcionesDe(l.tipo).find(x => x._id === l.productoId)?.nombre).join(", ")}.`
      );
    }
    // Un grupo de insumo sin opción elegida deja el descuento sin saber qué
    // insumo tocar, igual que una línea sin variante de color.
    const sinOpcion = validas.flatMap(l => {
      const o = opcionesDe(l.tipo).find(x => x._id === l.productoId);
      return (o?.gruposInsumo || [])
        .filter(g => !(l.opcionesInsumo || {})[g.id])
        .map(g => `${o?.nombre}: ${g.nombre}`);
    });
    if (sinOpcion.length > 0) {
      return alert(`Elegí una opción en: ${sinOpcion.join(", ")}.`);
    }
    if (validas.length === 0) return alert("Agregá al menos un producto con cantidad mayor a 0.");

    setGuardando(true);
    try {
      const frescos = await cargarPedidos();
      const numeroOrden = siguienteNumeroOrden(frescos);
      await crearPedido({
        numeroOrden,
        clienteNombre: cliente,
        items: validas.map(l => {
          const o = opcionesDe(l.tipo).find(x => x._id === l.productoId);
          const variante = (o?.variantes || []).find(v => v.id === l.varianteId);
          return {
            productoId: l.productoId,
            tipo: l.tipo,
            productoCodigo: o?.codigo || "",
            productoNombre: o?.nombre || "Producto",
            // Sin esto el descuento de stock no sabe qué rollo tocar: la
            // receta ya no lleva color.
            varianteId: l.varianteId || "",
            varianteNombre: variante?.nombre || "",
            // Qué opción se pidió en cada grupo: sin esto el descuento no
            // sabe qué insumo tocar, y el detalle del pedido no muestra la
            // combinación que se vendió.
            opcionesInsumo: { ...(l.opcionesInsumo || {}) },
            opcionesTexto: etiquetaSeleccion(o?.gruposInsumo || [], l.opcionesInsumo || {}),
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

  const togglePagado = async (pedido) => {
    const pagado = !estaPagado(pedido);
    try {
      await marcarPagado(pedido, pagado);
      setMsg(`✓ Pedido ${pedido.numeroOrden} marcado como ${pagado ? "pagado" : "pago pendiente"}.`);
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

  const COL = "105px 1.3fr 80px 110px 105px 105px 105px 110px";

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
              <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 130px 150px 70px 110px 90px 36px", gap: 10, alignItems: "end" }}>
                <div>
                  {i === 0 && <div style={labelStyle}>Tipo</div>}
                  <div style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    {[["catalogo", "Catálogo"], ["personalizado", "Personalizado"]].map(([valor, texto]) => (
                      <button
                        key={valor}
                        onClick={() => cambiarTipo(i, valor)}
                        style={{
                          flex: 1, padding: "12px 6px", border: "none", cursor: "pointer",
                          background: l.tipo === valor ? "var(--accent)" : "transparent",
                          color: l.tipo === valor ? "#fff" : "var(--muted)",
                          fontSize: 11, fontWeight: 700,
                        }}
                      >
                        {texto}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Producto</div>}
                  <BuscadorProducto
                    opciones={opcionesDe(l.tipo)}
                    valorId={l.productoId}
                    onSelect={(id) => elegirProducto(i, l.tipo, id)}
                    placeholder={l.tipo === "personalizado"
                      ? "Buscar por pieza o cliente..."
                      : "Buscar por nombre o ID..."}
                  />
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Variante</div>}
                  <VarianteSelect
                    variantes={(opcionesDe(l.tipo).find(x => x._id === l.productoId) || {}).variantes || []}
                    valor={l.varianteId}
                    onChange={varianteId => upLinea(i, { varianteId })}
                    deshabilitado={!l.productoId}
                  />
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Opciones</div>}
                  <OpcionesInsumoSelect
                    grupos={(opcionesDe(l.tipo).find(x => x._id === l.productoId) || {}).gruposInsumo || []}
                    valores={l.opcionesInsumo || {}}
                    onChange={(grupoId, opcionId) =>
                      upLinea(i, { opcionesInsumo: { ...(l.opcionesInsumo || {}), [grupoId]: opcionId } })}
                    deshabilitado={!l.productoId}
                  />
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
        {pedidos.filter(p => !estaPagado(p)).length > 0 && (
          <> · <span style={{ color: "#B56B3E", fontWeight: 700 }}>
            {pedidos.filter(p => !estaPagado(p)).length} sin cobrar
          </span></>
        )}
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
            <div>Impresión</div><div>Entrega</div><div>Pago</div><div>Acciones</div>
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
                  <div>
                    <TKPill variant={estaPagado(pedido) ? "accent" : "outline"}>
                      {estaPagado(pedido) ? "Pagado" : "Impago"}
                    </TKPill>
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
                    <button
                      onClick={() => togglePagado(pedido)}
                      style={{ ...actionBtn, color: estaPagado(pedido) ? "#4a7a52" : "var(--text)" }}
                      title={estaPagado(pedido) ? "Marcar como pago pendiente" : "Marcar como pagado"}
                    >
                      <Icon.check size={14}/>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600 }}>{it.productoNombre}</span>
                            <BadgeTipo tipo={it.tipo}/>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                            {codigoDeLinea(it, productos, personalizados)}
                          </div>
                          {/* La combinación exacta que se vendió: color y las
                              opciones de cada grupo de insumo. */}
                          {(it.varianteNombre || it.opcionesTexto) && (
                            <div style={{ fontSize: 11, color: "var(--text)", marginTop: 3 }}>
                              {[it.varianteNombre, it.opcionesTexto].filter(Boolean).join(" · ")}
                            </div>
                          )}
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
                      <span>
                        Pago: {estaPagado(pedido) ? `pagado ${fmtFecha(pedido.pagadoAt)}` : "pendiente"}
                      </span>
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
          personalizados={personalizados}
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
function ModalImpresion({ pedido, productos, personalizados = [], filamentos, insumos = [], onClose, onDone }) {
  const plan = useMemo(() => planDeConsumo(pedido, productos, personalizados), [pedido, productos, personalizados]);
  const planInsumos = useMemo(
    () => planDeInsumos(pedido, productos, personalizados, insumos),
    [pedido, productos, personalizados, insumos]);
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
