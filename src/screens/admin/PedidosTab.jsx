import { useState, useMemo } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import { fmtFecha } from './InventarioTab.jsx';
import {
  cargarPedidos, siguienteNumeroOrden, crearPedido, eliminarPedido,
  marcarEntregado, marcarPagado, estaPagado, marcarPedidoImpreso, planDeConsumo, planDeInsumos,
  buscarProductoDeLinea, opcionesFaltantes,
} from '../../lib/inventario.js';
import {
  agruparConsumo, validarStock, textoFaltante,
} from '../../lib/consumoPedido.js';
import { buscarFilamento, opcionesDeOwner } from '../../lib/disponibilidad.js';
import {
  etiquetaSeleccion, precioDeCombinacion, gruposPublicos,
} from '../../lib/variantesInsumo.js';
import { tiposDe, claveTipo } from '../../lib/tiposInsumo.js';
import { ListaDesplegable } from '../../components/ListaDesplegable.jsx';

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const labelStyle = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
  // Un rótulo en dos líneas baja su campo respecto de los demás: la fila se
  // alinea arriba, así que todos los rótulos tienen que medir lo mismo.
  whiteSpace: "nowrap",
};

const lineaVacia = () =>
  ({ tipo: "catalogo", productoId: "", varianteId: "", opcionesInsumo: {},
     cantidad: 1, precioUnitario: 0, precioEditado: false });

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
    <ListaDesplegable
      opciones={variantes.map(v => ({
        id: v.id,
        nombre: v.nombre || "(sin nombre)",
        nota: v.disponible ? "" : "· sin stock",
      }))}
      valor={valor || ""}
      onElegir={onChange}
      vacio="— Elegir —"
      invalido={!valor}
      titulo="Variante de color"
    />
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
        <ListaDesplegable
          key={g.id}
          opciones={(g.opciones || []).map(o => ({
            id: o.id,
            nombre: o.nombre,
            nota: o.disponible ? "" : "· sin stock",
          }))}
          valor={valores[g.id] || ""}
          onElegir={(opcionId) => onChange(g.id, opcionId)}
          vacio={`${g.nombre || "Grupo"}: elegir`}
          invalido={!valores[g.id]}
          titulo={g.nombre}
        />
      ))}
    </div>
  );
}

/**
 * Buscador con autocompletado: filtra en vivo por nombre o por código y
 * muestra las coincidencias para elegir con un clic. Misma UI para catálogo
 * y personalizados; solo cambia la fuente y qué campos entran en la búsqueda.
 */
function BuscadorProducto({ opciones, valorId, onSelect, placeholder }) {
  return (
    <ListaDesplegable
      opciones={opciones.map(o => ({
        id: o._id,
        // En la fila, solo el nombre: el código ya va abajo en gris, y
        // repetirlo en las dos líneas era leerlo dos veces.
        nombre: o.nombre,
        detalle: o.detalle,
        // Cerrado hay una sola línea, así que ahí sí se muestran los dos.
        etiqueta: o.etiqueta || o.nombre,
        busqueda: o.busqueda,
      }))}
      valor={valorId || ""}
      onElegir={onSelect}
      vacio={placeholder}
      conBuscador
      placeholder={placeholder}
      // El campo de búsqueda mira el mismo texto que ya armaba cada opción
      // (nombre + código, o nombre + cliente en personalizados).
      coincide={(o, q) => (o.busqueda || o.nombre || "").toLowerCase().includes(q)}
      invalido={!valorId}
      titulo="Producto"
    />
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
      // Los grupos se evalúan contra el catálogo de insumos de AHORA, no
      // contra el booleano que quedó guardado en el producto: así el selector
      // marca bien qué opción tiene stock y el precio sale del tipo vigente.
      gruposInsumo: gruposPublicos(p.variantesInsumo || [], insumos),
      busqueda: `${p.name || ""} ${p.id || ""}`.toLowerCase(),
    })), [productos, insumos]);

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
      gruposInsumo: gruposPublicos(p.variantesInsumo || [], insumos),
      busqueda: `${p.name || ""} ${p.clienteNombre || ""}`.toLowerCase(),
    })), [personalizados, insumos]);

  const opcionesDe = (tipo) => tipo === "personalizado" ? opcionesPersonalizado : opcionesCatalogo;

  const totales = lineas.map(l => (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0));
  const precioTotal = totales.reduce((s, n) => s + n, 0);

  const upLinea = (i, patch) => setLineas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  /**
   * El precio de la línea, con la MISMA función que usa el detalle público
   * (precioDeCombinacion): precio base + lo que suma la opción elegida en cada
   * grupo, o el precio manual de la opción cuando lo tiene.
   *
   * exigirStock: false porque en un pedido se puede elegir a propósito una
   * opción agotada —se imprime cuando llegue el insumo— y ahí el precio tiene
   * que ser el de ESA opción, no el de la primera que quede en stock.
   */
  const precioDeLinea = (o, opcionesInsumo) =>
    precioDeCombinacion(o?.price ?? 0, o?.gruposInsumo || [], opcionesInsumo || {},
      { exigirStock: false });

  const elegirProducto = (i, tipo, productoId) => {
    const o = opcionesDe(tipo).find(x => x._id === productoId);
    const variantes = o?.variantes || [];
    // Ídem cada grupo de insumo con una sola opción: se preselecciona.
    const opcionesInsumo = Object.fromEntries(
      (o?.gruposInsumo || [])
        .filter(g => (g.opciones || []).length === 1)
        .map(g => [g.id, g.opciones[0].id]));
    upLinea(i, {
      productoId,
      opcionesInsumo,
      precioUnitario: precioDeLinea(o, opcionesInsumo),
      // El precio vuelve a ser automático al cambiar de producto: lo que se
      // hubiera escrito a mano era para otra pieza.
      precioEditado: false,
      // Con una sola variante no hay nada que elegir: se preselecciona para
      // no obligar a un clic que siempre daría lo mismo.
      varianteId: variantes.length === 1 ? variantes[0].id : "",
    });
  };

  /**
   * Cambiar la opción de un grupo cambia el precio: es todo el sentido de las
   * variantes de insumo. Solo se pisa el precio si no lo escribieron a mano.
   */
  const elegirOpcion = (i, linea, grupoId, opcionId) => {
    const o = opcionesDe(linea.tipo).find(x => x._id === linea.productoId);
    const opcionesInsumo = { ...(linea.opcionesInsumo || {}), [grupoId]: opcionId };
    upLinea(i, {
      opcionesInsumo,
      ...(linea.precioEditado ? {} : { precioUnitario: precioDeLinea(o, opcionesInsumo) }),
    });
  };

  // Cambiar de tipo limpia la selección: el producto elegido es de la otra
  // colección y no tiene sentido conservarlo.
  const cambiarTipo = (i, tipo) =>
    upLinea(i, { tipo, productoId: "", varianteId: "", opcionesInsumo: {},
      precioUnitario: 0, precioEditado: false });

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
            opcionesTexto: etiquetaSeleccion(o?.gruposInsumo || [], l.opcionesInsumo || {},
              { exigirStock: false }),
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
              <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 130px 150px 70px 130px 90px 36px", gap: 10, alignItems: "start" }}>
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
                    onChange={(grupoId, opcionId) => elegirOpcion(i, l, grupoId, opcionId)}
                    deshabilitado={!l.productoId}
                  />
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Cantidad</div>}
                  <TKInput type="number" value={l.cantidad} onChange={e => upLinea(i, { cantidad: e.target.value })} />
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Precio unitario</div>}
                  <TKInput type="number" value={l.precioUnitario}
                    onChange={e => upLinea(i, {
                      precioUnitario: e.target.value,
                      // Tocarlo a mano corta el recálculo automático: si no,
                      // elegir otra opción pisaría el precio acordado.
                      precioEditado: true,
                    })} />
                  {l.productoId && (
                    l.precioEditado ? (
                      <button
                        onClick={() => {
                          const o = opcionesDe(l.tipo).find(x => x._id === l.productoId);
                          upLinea(i, {
                            precioUnitario: precioDeLinea(o, l.opcionesInsumo),
                            precioEditado: false,
                          });
                        }}
                        style={{
                          background: "none", border: "none", padding: 0, marginTop: 4,
                          fontSize: 10, color: "var(--accent)", cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        fijado a mano · volver al automático
                      </button>
                    ) : (
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                        sale de la opción elegida
                      </div>
                    )
                  )}
                </div>
                <div>
                  {i === 0 && <div style={labelStyle}>Subtotal</div>}
                  <div style={{ padding: "13px 0", fontWeight: 700, lineHeight: "18px" }}>
                    {fmtARS(totales[i] || 0)}
                  </div>
                </div>
                <div>
                  {/* Espaciador del alto del rótulo: sin él el botón queda más
                      arriba que los campos de la primera fila. */}
                  {i === 0 && <div style={{ ...labelStyle, visibility: "hidden" }}>·</div>}
                  <button
                    onClick={() => setLineas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}
                    style={{ ...actionBtn, color: "#c64138", justifyContent: "center",
                      height: 44, width: "100%" }}
                    title="Quitar línea"
                  >
                    <Icon.trash size={14}/>
                  </button>
                </div>
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
  // Grupos de insumo que este pedido no resolvió (pedidos anteriores a las
  // variantes): no se pueden descontar solos, pero tampoco se ocultan.
  const faltanOpciones = useMemo(
    () => opcionesFaltantes(pedido, productos, personalizados),
    [pedido, productos, personalizados]);
  const [desperdicios, setDesperdicios] = useState({});
  // De qué rollo se descuenta cada línea, cuando hay más de un owner con el
  // mismo material+color: clave de la línea del plan → id del filamento.
  const [elegido, setElegido] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [errorStock, setErrorStock] = useState("");   // faltante detectado por la transacción

  // Los rollos que existen para cada línea. Puede haber dos personas con el
  // mismo PLA Negro cargado: son documentos distintos y stocks distintos.
  const candidatos = useMemo(() => {
    const mapa = {};
    for (const l of plan) {
      if (l.sinVariante) continue;
      mapa[l.clave] = opcionesDeOwner(filamentos, l.material, l.color);
    }
    return mapa;
  }, [plan, filamentos]);

  // Con un solo rollo no hay nada que preguntar y se asigna solo; con varios
  // NO se elige por nosotros: la línea queda pendiente hasta que lo digan.
  const asignaciones = useMemo(() => {
    const mapa = {};
    for (const l of plan) {
      const opciones = candidatos[l.clave] || [];
      if (opciones.length === 0) continue;
      const elegida = opciones.find(o => o.id === elegido[l.clave]);
      if (elegida) mapa[l.clave] = { id: elegida.id, owner: elegida.owner };
      else if (opciones.length === 1) mapa[l.clave] = { id: opciones[0].id, owner: opciones[0].owner };
      else mapa[l.clave] = { pendiente: true };
    }
    return mapa;
  }, [plan, candidatos, elegido]);

  const lineasPendientes = plan.filter(l => asignaciones[l.clave]?.pendiente);

  // Validación en vivo, con la MISMA lógica que corre dentro de la transacción:
  // se recalcula con cada cambio de desperdicio o de owner.
  const validacion = useMemo(() => {
    const consumo = agruparConsumo(plan, desperdicios, planInsumos, asignaciones);
    return validarStock(
      consumo,
      (f) => {
        // El rollo elegido manda; sin owner asignado, la búsqueda de siempre.
        const encontrado = f.filamentoId
          ? filamentos.find(x => x._id === f.filamentoId)
          : buscarFilamento(filamentos, f.material, f.color);
        return encontrado ? { id: encontrado._id, disponible: Number(encontrado.cantidadGramos) || 0 } : null;
      },
      (i) => {
        // El stock que cuenta es el del TIPO, y la misma lectura que hace la
        // transacción: el plan ya trae el tipoId resuelto.
        const insumo = insumos.find(x => x._id === i.insumoId);
        const tipo = insumo ? tiposDe(insumo).find(t => t.tipoId === i.tipoId) : null;
        return tipo ? { id: i.clave, disponible: Number(tipo.cantidadDisponible) || 0 } : null;
      }
    );
  }, [plan, desperdicios, planInsumos, asignaciones, filamentos, insumos]);

  const totalPorLinea = (l) => l.cantidadConsumida + (Number(desperdicios[l.clave]) || 0);
  const puedeConfirmar = validacion.ok && lineasPendientes.length === 0;

  const confirmar = async () => {
    if (!puedeConfirmar) return;   // el botón ya está deshabilitado, pero por las dudas
    setGuardando(true);
    setErrorStock("");
    try {
      const { advertencias } = await marcarPedidoImpreso(
        pedido, plan, desperdicios, filamentos, planInsumos, insumos, asignaciones
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

        {plan.some(l => l.sinVariante) && (
          <div style={{
            padding: "12px 14px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E",
            fontSize: 12.5, lineHeight: 1.6, marginBottom: 20,
          }}>
            Este pedido no dice en qué color se imprimió{" "}
            <strong>{[...new Set(plan.filter(l => l.sinVariante)
              .map(l => `${l.productoNombre} (${l.material})`))].join(", ")}</strong>,
            y la receta tampoco lo trae. Es de antes de las variantes de color. Como no se puede
            saber de qué rollo salió, <strong>esos gramos no se descuentan</strong>: ajustalos a
            mano desde el tab Inventario.
          </div>
        )}

        {faltanOpciones.length > 0 && (
          <div style={{
            padding: "12px 14px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E",
            fontSize: 12.5, lineHeight: 1.6, marginBottom: 20,
          }}>
            Este pedido no dice qué opción se vendió en{" "}
            <strong>{faltanOpciones.map(f => `${f.productoNombre} · ${f.grupoNombre}`).join(", ")}</strong>.
            Es de antes de que el producto tuviera variantes de insumo. Como cada opción consume un
            insumo distinto, <strong>esas unidades no se descuentan</strong>: si hace falta, ajustalas
            a mano desde el tab Insumos.
          </div>
        )}

        {planInsumos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
              Insumos a descontar
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
              Se descuentan del catálogo automáticamente. No llevan desperdicio.
            </div>
            {planInsumos.map(l => {
              // El semáforo de la línea sale de la validación AGRUPADA por
              // tipo: si el mismo tipo lo comprometen dos líneas (una fija y
              // una de variante), lo que decide es el total combinado, no lo
              // que consume esta línea sola.
              const agrupado = validacion.insumos.find(
                i => i.clave === claveTipo(l.insumoId, l.tipoId));
              const existe = Boolean(agrupado?.existe);
              const alcanza = Boolean(agrupado?.alcanza);
              return (
                <div key={l.clave} style={{
                  display: "grid", gridTemplateColumns: "1.6fr 1fr 110px",
                  gap: 10, padding: "8px 0", fontSize: 12, borderTop: "1px solid var(--line)",
                  alignItems: "center",
                }}>
                  <div style={{ fontWeight: 600 }}>{l.nombre}</div>
                  <div style={{ color: "var(--muted)" }}>
                    {l.productoNombre} — {l.cantidadPorUnidad} × {l.cantidad} u.
                    {l.opcionNombre && ` · ${l.grupoNombre}: ${l.opcionNombre}`}
                  </div>
                  <div style={{ fontWeight: 700, color: alcanza ? "var(--text)" : "#c64138" }}>
                    −{l.unidadesConsumidas} u.
                    {!alcanza && (
                      <div style={{ fontSize: 10, fontWeight: 400 }}>
                        {existe
                          ? (agrupado.total > l.unidadesConsumidas
                              ? `queda negativo (${agrupado.total} u. en total del pedido)`
                              : "queda negativo")
                          : "ese tipo no está en el catálogo"}
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
            {plan.map(l => {
              // El selector de owner solo aparece cuando hay de dónde elegir:
              // con un rollo (o ninguno) no hay ambigüedad que resolver.
              const opciones = candidatos[l.clave] || [];
              const variosOwners = opciones.length > 1;
              const pendiente = Boolean(asignaciones[l.clave]?.pendiente);
              return (
                <div key={l.clave} style={{ padding: 14, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{l.productoNombre}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                    {l.material} · {l.color} — {l.gramosPorUnidad} g × {l.cantidad} u ={" "}
                    <strong style={{ color: "var(--text)" }}>{l.cantidadConsumida} g</strong>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: variosOwners ? "170px 210px 1fr" : "170px 1fr",
                    gap: 14, alignItems: "start",
                  }}>
                    <TKInput
                      label="Desperdicio (g)"
                      type="number"
                      value={desperdicios[l.clave] ?? 0}
                      onChange={e => setDesperdicios(d => ({ ...d, [l.clave]: e.target.value }))}
                    />
                    {variosOwners && (
                      <div>
                        {/* Mismo encabezado que el label de TKInput, para que
                            los dos campos de la fila se lean parejos. */}
                        <label style={{
                          display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
                          textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
                        }}>
                          Descontar de
                        </label>
                        <ListaDesplegable
                          opciones={opciones.map(o => ({
                            id: o.id,
                            nombre: `${o.owner || "Sin owner"} — ${o.disponible} g`,
                            nota: o.disponible < totalPorLinea(l) ? "· no alcanza" : "",
                          }))}
                          valor={elegido[l.clave] || ""}
                          onElegir={id => setElegido(e => ({ ...e, [l.clave]: id }))}
                          vacio="— Elegir owner —"
                          invalido={pendiente}
                          titulo={`De quién se descuenta el ${l.material} ${l.color}`}
                        />
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--muted)", paddingTop: 16 }}>
                      Total a descontar: <strong style={{ color: "var(--text)" }}>{totalPorLinea(l)} g</strong>
                    </div>
                  </div>
                  {pendiente && (
                    <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
                      Hay {opciones.length} owners con {l.material} {l.color}: elegí de cuál se descuenta.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {lineasPendientes.length > 0 && (
          <div style={{
            padding: "14px 16px", background: "#c6413812",
            borderLeft: "3px solid #c64138", marginBottom: 20,
            fontSize: 13, lineHeight: 1.6,
          }}>
            <strong style={{ color: "#c64138" }}>
              Elegí de qué owner se descuenta cada filamento.
            </strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
              {[...new Set(lineasPendientes.map(l => `${l.material} ${l.color}`.trim()))].map(t => (
                <li key={t}>{t} está cargado por más de una persona</li>
              ))}
            </ul>
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
          <TKButton onClick={confirmar} disabled={guardando || !puedeConfirmar}>
            {guardando ? "Procesando..."
              : lineasPendientes.length > 0 ? "Falta elegir owner"
              : !validacion.ok ? "Falta stock"
              : "Confirmar impresión"}
          </TKButton>
        </div>
      </div>
    </div>
  );
}
