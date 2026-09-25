import { useState, useMemo } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import { fmtFecha } from './InventarioTab.jsx';
import {
  cargarPedidos, siguienteNumeroOrden, crearPedido, eliminarPedido,
  marcarEntregado, marcarPagado, estaPagado, marcarPedidoImpreso, planDeConsumo, planDeInsumos,
  buscarProductoDeLinea, opcionesFaltantes, agruparPorPieza,
} from '../../lib/inventario.js';
import {
  agruparConsumo, validarStock, textoFaltante, materialesDe,
} from '../../lib/consumoPedido.js';
import { buscarFilamento } from '../../lib/disponibilidad.js';
import { opcionesDeDescuento } from '../../lib/opcionesFilamento.js';
import {
  etiquetaSeleccion, precioDeCombinacion, gruposPublicos,
} from '../../lib/variantesInsumo.js';
import { tiposDe, claveTipo } from '../../lib/tiposInsumo.js';
import { ListaDesplegable } from '../../components/ListaDesplegable.jsx';
import { usarOrigen } from '../../components/usarOrigen.js';
import { ModalOrigenPedido, EncabezadoPieza } from './ModalOrigen.jsx';
import { productosDePedido } from '../../lib/reservas.js';
import {
  expandirReparticiones, reparticionesPorDefecto, descuadres, esDividida,
  plegarOrigen, desplegarOrigen,
} from '../../lib/reparticiones.js';

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "5px 6px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

// Rótulo de un selector propio, para que se lea parejo con el label de TKInput.
const labelSelector = {
  display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

// Acción secundaria con forma de link: dividir, quitar, agregar. No compite
// con el botón de confirmar, que es la única acción que escribe.
const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  color: "var(--azul, #2f5d8a)", fontSize: 11.5, fontWeight: 600,
  textDecoration: "underline", fontFamily: "inherit", whiteSpace: "nowrap",
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
export function PedidosTab({ pedidos, productos, personalizados = [], filamentos, insumos = [], onPedidosChange, onInventarioChange, onReservasChange, setMsg }) {
  const [showForm, setShowForm] = useState(false);
  const [cliente, setCliente] = useState("");
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [expandido, setExpandido] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null); // pedido en el modal
  // Pedido armado y esperando que se elija de qué rollo sale cada filamento.
  const [eligiendoOrigen, setEligiendoOrigen] = useState(null);
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
      // El número se toma acá, antes de abrir el panel, para poder mostrarlo
      // en su encabezado. Si el panel se cancela no se consumió nada: el
      // número sale de contar los pedidos que existen, no de un contador.
      const frescos = await cargarPedidos();
      const numeroOrden = siguienteNumeroOrden(frescos);
      const items = validas.map(l => {
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
      });

      // El pedido NO se guarda todavía: primero hay que decir de qué rollo
      // sale cada filamento, porque es lo que la reserva necesita para
      // apuntar a un documento concreto. El panel se encarga, y el guardado
      // real pasa por confirmarOrigen().
      setEligiendoOrigen({ numeroOrden, items, pedidosFrescos: frescos });
    } catch (err) {
      setMsg("Error: " + err.message);
    }
    setGuardando(false);
  };

  /**
   * Segundo paso: ya se eligió owner (y material) de cada línea, ahora sí se
   * guarda. La elección viaja en el pedido, así que la reserva queda imputada
   * a un rollo puntual y el modal de impresión la encuentra precargada.
   */
  const confirmarOrigen = async (origen) => {
    const { numeroOrden, items } = eligiendoOrigen;
    setGuardando(true);
    try {
      await crearPedido({ numeroOrden, clienteNombre: cliente, items, origen });
      setMsg(`✓ Pedido ${numeroOrden} creado y filamento reservado.`);
      setEligiendoOrigen(null);
      resetForm();
      await onPedidosChange();
      // Lo reservado cambió, así que la disponibilidad pública de estos
      // productos ya no es la que está publicada. Solo los de este pedido:
      // el resto del catálogo no se enteró de nada.
      await onReservasChange?.(productosDePedido({ items }));
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
      // Un pedido pendiente que desaparece libera lo que tenía reservado: sus
      // productos vuelven a tener disponibilidad y hay que republicarla.
      await onReservasChange?.(productosDePedido(pedido));
    } catch (err) { setMsg("Error: " + err.message); }
  };

  // Misma densidad que el resto de las tablas del backoffice.
  // Acciones lleva CUATRO botones (impreso, entregado, pagado, borrar):
  // 4 × 28 + 3 de gap = 126. Achicarla no la comprime, la desborda — el
  // ancho sale de Cliente, que es la columna flexible.
  const COL = "96px 1.3fr 74px 96px 96px 96px 96px 126px";

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
        <div style={{ minWidth: 860 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 10, padding: "9px 10px", background: "var(--bg-alt)",
            fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1.2,
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
                  gap: 10, padding: "12px 10px", fontSize: 12.5, alignItems: "center",
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

      {eligiendoOrigen && (
        <ModalOrigenPedido
          items={eligiendoOrigen.items}
          numeroOrden={eligiendoOrigen.numeroOrden}
          cliente={cliente}
          productos={productos}
          personalizados={personalizados}
          filamentos={filamentos}
          // Los pedidos recién leídos, no los del render: entre que se abrió
          // el formulario y se confirma pudo entrar otro pedido que ya reservó
          // parte de este stock.
          pedidos={eligiendoOrigen.pedidosFrescos}
          guardando={guardando}
          onClose={() => setEligiendoOrigen(null)}
          onConfirmar={confirmarOrigen}
        />
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
// Exportado para poder montarlo aislado en las pruebas de navegador.
export function ModalImpresion({ pedido, productos, personalizados = [], filamentos, insumos = [], onClose, onDone }) {
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
  const [guardando, setGuardando] = useState(false);
  const [errorStock, setErrorStock] = useState("");   // faltante detectado por la transacción

  // Lo que se eligió al tomar el pedido, desplegado: si aquella vez ya quedó
  // dividido, el modal abre dividido y con cada parte en su lugar.
  const guardado = useMemo(() => desplegarOrigen(pedido?.origen), [pedido]);
  // Qué líneas se reparten entre varios owners: clave de la línea → partes.
  // Ausente = la línea va entera a un rollo, que es el caso de siempre.
  const [reparticiones, setReparticiones] = useState(guardado.reparticiones);

  // El plan con las líneas divididas abiertas en una línea por parte. Es todo
  // lo que hace falta para que el resto funcione: el hook, la validación, el
  // descuento y los gastos ya saben tratar varias líneas del mismo material y
  // color en rollos distintos.
  const planExpandido = useMemo(
    () => expandirReparticiones(plan, reparticiones), [plan, reparticiones]);

  // Toda la resolución de material y owner sale del hook, el mismo que usa el
  // paso de tomar el pedido. Acá se evalúa contra el stock FÍSICO, no el neto
  // de reservas: se está imprimiendo, y restar la reserva de este mismo pedido
  // sería contarla dos veces.
  const {
    planResuelto, totalPorLinea, origen,
    materialesPosibles, queAlcanzan, candidatos, asignaciones, faltaElegir,
    sinOwnerConStock, sinMaterialConStock,
    setElegido, setMaterialElegido,
  } = usarOrigen({ plan: planExpandido, filamentos, desperdicios, inicial: guardado.plano });

  // Las piezas se arman con el plan CRUDO: una línea dividida sigue siendo una
  // sola línea de la receta, y sus partes van anidadas adentro, no como dos
  // filas sueltas que parecerían dos materiales distintos.
  const piezasDeMaterial = useMemo(() => agruparPorPieza(plan), [plan]);
  /** Las sub-líneas ya resueltas de una línea cruda. Sin dividir, es ella misma. */
  const partesDe = (clave) =>
    planResuelto.filter(s => (s.reparticionDe || s.clave) === clave);

  const dividir = (linea) => setReparticiones(r =>
    ({ ...r, [linea.clave]: reparticionesPorDefecto(linea) }));
  const unificar = (clave) => setReparticiones(r => {
    const copia = { ...r }; delete copia[clave]; return copia;
  });
  const cambiarParte = (clave, i, gramos) => setReparticiones(r => ({
    ...r, [clave]: r[clave].map((p, j) => j === i ? { ...p, gramos } : p),
  }));
  const agregarParte = (clave) => setReparticiones(r =>
    ({ ...r, [clave]: [...r[clave], { gramos: 0 }] }));
  // Quitar hasta quedarse con una sola parte es no estar dividido: se unifica
  // en vez de dejar una "repartición" que es toda la línea.
  const quitarParte = (clave, i) => setReparticiones(r => {
    const quedan = r[clave].filter((_, j) => j !== i);
    if (quedan.length < 2) { const copia = { ...r }; delete copia[clave]; return copia; }
    return { ...r, [clave]: quedan };
  });

  const malRepartidas = useMemo(
    () => descuadres(plan, reparticiones), [plan, reparticiones]);

  // ── Los controles de UNA parte ────────────────────────────────────────
  // Los mismos para la línea entera y para cada repartición: son funciones y
  // no componentes para que compartan el estado del modal sin pasar diez
  // props, y para que dividir no pueda quedar ofreciendo opciones distintas
  // de las que ofrece no dividir.

  /** Con qué material se imprimió, cuando la receta acepta varios. */
  const selectorMaterial = (l, ancho = 300) => materialesPosibles[l.clave] ? (
    <div style={{ marginBottom: 12, maxWidth: ancho }}>
      <label style={labelSelector}>Material usado</label>
      <ListaDesplegable
        // Se listan TODOS, también los que no llegan: deshabilitados y con el
        // motivo, que es lo que deja ver de un vistazo qué filamento reponer.
        opciones={materialesPosibles[l.clave].map(m => ({
          id: m.material,
          nombre: m.material,
          nota: m.alcanza ? ""
            : m.tiene
              ? `· ${m.disponible} g disponibles, necesita ${m.necesita} g`
              : `· no hay ${m.material} ${l.color} en inventario`,
          deshabilitada: !m.alcanza,
        }))}
        valor={queAlcanzan(l.clave).includes(l.material) ? l.material : ""}
        onElegir={m => setMaterialElegido(e => ({ ...e, [l.clave]: m }))}
        vacio={queAlcanzan(l.clave).length === 0 ? "— Ninguno alcanza —" : "— Elegir material —"}
        invalido={queAlcanzan(l.clave).length === 0}
        titulo={`Con cuál de ${materialesDe(l).join(" o ")} se imprimió`}
      />
      {queAlcanzan(l.clave).length === 0 && (
        <div style={{ fontSize: 11, color: "#c64138", marginTop: 6, lineHeight: 1.5 }}>
          Ninguno de {materialesDe(l).join(" / ")} en {l.color} llega a los{" "}
          {totalPorLinea(l)} g que hacen falta.
        </div>
      )}
    </div>
  ) : null;

  /**
   * De qué rollo sale. El selector va SIEMPRE, aunque haya un solo owner
   * posible: de quién sale cada impresión se confirma a mano.
   */
  const selectorOwner = (l) => {
    const opciones = candidatos[l.clave] || [];
    return (
      <div>
        <label style={labelSelector}>Descontar de</label>
        <ListaDesplegable
          // Los que no sirven se listan igual, deshabilitados y con el motivo:
          // saber que Ana no tiene ese filamento es parte de la respuesta.
          opciones={opciones.map(o => ({
            id: o.id,
            nombre: o.tiene ? `${o.owner || "Sin owner"} — ${o.disponible} g`
                            : `${o.owner} — sin cargar`,
            nota: o.alcanza ? ""
              : o.tiene ? `· insuficiente, necesita ${totalPorLinea(l)} g`
              : "· no tiene este filamento",
            deshabilitada: !o.alcanza,
          }))}
          valor={asignaciones[l.clave]?.id || ""}
          onElegir={id => setElegido(e => ({ ...e, [l.clave]: id }))}
          vacio={opciones.length === 0 ? "— Nadie lo tiene cargado —" : "— Elegir owner —"}
          invalido={Boolean(asignaciones[l.clave]?.pendiente)}
          deshabilitado={opciones.length === 0}
          titulo={`De quién se descuenta el ${l.material} ${l.color}`}
        />
      </div>
    );
  };

  const campoDesperdicio = (l) => (
    <TKInput
      label="Desperdicio (g)"
      type="number"
      value={desperdicios[l.clave] ?? 0}
      onChange={e => setDesperdicios(d => ({ ...d, [l.clave]: e.target.value }))}
    />
  );

  /** Por qué esta parte todavía no se puede confirmar. */
  const avisosDeParte = (l) => {
    const asignada = asignaciones[l.clave];
    if (asignada?.sinStock) return (
      <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
        Ningún owner llega solo a los {totalPorLinea(l)} g de esta parte.
      </div>
    );
    if (asignada?.pendiente) return (
      <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
        Hay {(candidatos[l.clave] || []).filter(o => o.alcanza).length} owners que pueden
        imprimir {l.material} {l.color}: elegí de cuál se descuenta.
      </div>
    );
    return null;
  };

  // Los insumos no pasan por el hook: no tienen ni material alternativo ni
  // owner, se descuentan del catálogo y listo.
  const piezasDeInsumo = useMemo(() => agruparPorPieza(planInsumos), [planInsumos]);

  // Validación en vivo, con la MISMA lógica que corre dentro de la transacción:
  // se recalcula con cada cambio de desperdicio o de owner.
  const validacion = useMemo(() => {
    const consumo = agruparConsumo(planResuelto, desperdicios, planInsumos, asignaciones);
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
  }, [planResuelto, desperdicios, planInsumos, asignaciones, filamentos, insumos]);

  const puedeConfirmar = validacion.ok && faltaElegir.length === 0
    && sinOwnerConStock.length === 0 && sinMaterialConStock.length === 0
    && malRepartidas.length === 0;

  const confirmar = async () => {
    if (!puedeConfirmar) return;   // el botón ya está deshabilitado, pero por las dudas
    setGuardando(true);
    setErrorStock("");
    try {
      const { advertencias } = await marcarPedidoImpreso(
        pedido, planResuelto, desperdicios, filamentos, planInsumos, insumos, asignaciones,
        // Se guarda en el pedido lo que realmente se usó, con la división si
        // la hubo: la reserva deja de contar porque el pedido pasa a impreso
        // en esta misma transacción, y el registro queda diciendo la verdad.
        plegarOrigen(planResuelto, origen)
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
            {/* Mismo criterio que abajo: las filas se agrupan por pieza, con
                el producto una sola vez en el encabezado en vez de repetido
                en cada fila. */}
            {piezasDeInsumo.map(pieza => (
              <div key={pieza.indice} style={{ marginTop: 12 }}>
                <EncabezadoPieza pieza={pieza}/>
                {pieza.lineas.map(l => {
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
                        {l.cantidadPorUnidad} × {l.cantidad} u.
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
            ))}
          </div>
        )}

        {plan.length === 0 ? (
          <div style={{ padding: "16px 18px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E", fontSize: 13, marginBottom: 20 }}>
            Ningún producto de este pedido tiene receta cargada: no se descontará inventario.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {/* Mismo encabezado que "Insumos a descontar": son dos secciones
                distintas y sin título los bloques de material parecían la
                continuación de la lista de insumos. */}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)" }}>
              Material a descontar
            </div>
            {/* Un bloque por PIEZA, no por material: una receta de dos
                materiales es una sola pieza y repetir su encabezado dos veces
                la hacía parecer dos productos distintos. */}
            {piezasDeMaterial.map(pieza => (
              <div key={pieza.indice} style={{ padding: 14, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
                <EncabezadoPieza pieza={pieza}/>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {pieza.lineas.map((l, i) => {
                    // Sin dividir hay una sola parte, que es la línea entera:
                    // el caso de siempre es el caso de una repartición.
                    const partes = partesDe(l.clave);
                    const dividida = esDividida(reparticiones, l.clave);
                    const entera = partes[0] || l;
                    const descuadre = malRepartidas.find(d => d.clave === l.clave);
                    const repartido = (reparticiones[l.clave] || [])
                      .reduce((acc, parte) => acc + (Number(parte.gramos) || 0), 0);
                    return (
                      <div key={l.clave} style={{
                        // Cada material de la pieza se separa del anterior con
                        // una línea fina, no con otra tarjeta.
                        borderTop: i > 0 ? "1px solid var(--line)" : "none",
                        paddingTop: i > 0 ? 14 : 0,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "baseline", gap: 12, marginBottom: 10,
                        }}>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {/* Con alternativas se nombran todas y se marca cuál
                                se va a usar, que es lo que el selector decide.
                                Dividida no se dice: cada parte elige el suyo. */}
                            {materialesDe(l).length > 1
                              ? (dividida
                                  ? <>{materialesDe(l).join(" / ")} · {l.color} — </>
                                  : <>{materialesDe(l).join(" / ")} · {l.color} — usando <strong style={{ color: "var(--text)" }}>{entera.material}</strong> —{" "}</>)
                              : <>{l.material} · {l.color} — </>}
                            {l.gramosPorUnidad} g × {l.cantidad} u ={" "}
                            <strong style={{ color: "var(--text)" }}>{l.cantidadConsumida} g</strong>
                          </div>
                          {/* Con una sola unidad no hay nada que repartir: la
                              pieza sale entera de un rollo o de ninguno. */}
                          {l.cantidad > 1 && !l.sinVariante && (
                            <button type="button" style={linkBtn}
                              onClick={() => dividida ? unificar(l.clave) : dividir(l)}>
                              {dividida ? "Unificar en un owner" : "Dividir entre owners"}
                            </button>
                          )}
                        </div>

                        {!dividida ? (
                          <>
                            {selectorMaterial(entera)}
                            <div style={{
                              display: "grid", gridTemplateColumns: "150px 250px 1fr",
                              gap: 14, alignItems: "start",
                            }}>
                              {campoDesperdicio(entera)}
                              {selectorOwner(entera)}
                              {/* La cantidad va SIEMPRE en su propia línea, no
                                  cuando no entra: con el ancho justo el número
                                  caía solo a veces y el corte quedaba distinto. */}
                              <div style={{ fontSize: 12, color: "var(--muted)", paddingTop: 16 }}>
                                <div>Total a descontar:</div>
                                <div style={{ color: "var(--text)", fontWeight: 700, marginTop: 2 }}>
                                  {totalPorLinea(entera)} g
                                </div>
                              </div>
                            </div>
                            {avisosDeParte(entera)}
                          </>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {partes.map((parte, j) => (
                              <div key={parte.clave} style={{
                                padding: 12, background: "var(--bg)",
                                border: "1px solid var(--line)",
                              }}>
                                <div style={{
                                  display: "flex", justifyContent: "space-between",
                                  alignItems: "center", marginBottom: 10,
                                }}>
                                  <div style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                                    textTransform: "uppercase", color: "var(--muted)",
                                  }}>
                                    Repartición {j + 1} de {partes.length}
                                  </div>
                                  <button type="button" style={linkBtn}
                                    onClick={() => quitarParte(l.clave, j)}>Quitar</button>
                                </div>
                                {selectorMaterial(parte, 260)}
                                {/* El desperdicio es de CADA persona: una puede
                                    haber tenido una falla y la otra no. */}
                                <div style={{
                                  display: "grid", gridTemplateColumns: "minmax(0,1fr) 88px 128px",
                                  gap: 12, alignItems: "start",
                                }}>
                                  {selectorOwner(parte)}
                                  <TKInput
                                    label="Gramos"
                                    type="number"
                                    value={(reparticiones[l.clave][j] || {}).gramos ?? 0}
                                    onChange={e => cambiarParte(l.clave, j, e.target.value)}
                                  />
                                  {campoDesperdicio(parte)}
                                </div>
                                {avisosDeParte(parte)}
                              </div>
                            ))}
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              alignItems: "center", gap: 12,
                            }}>
                              <button type="button" style={linkBtn}
                                onClick={() => agregarParte(l.clave)}>+ Agregar repartición</button>
                              <div style={{ fontSize: 12, color: descuadre ? "#c64138" : "var(--muted)" }}>
                                Repartido{" "}
                                <strong>{repartido} g</strong> de {l.cantidadConsumida} g
                              </div>
                            </div>
                            {descuadre && (
                              <div style={{ fontSize: 11.5, color: "#c64138", lineHeight: 1.5 }}>
                                {descuadre.hayCero
                                  ? "Hay una repartición en 0 g: quitala o ponele los gramos que cubre."
                                  : repartido > l.cantidadConsumida
                                    ? `Sobran ${repartido - l.cantidadConsumida} g: la suma tiene que dar exactamente los ${l.cantidadConsumida} g de la receta.`
                                    : `Faltan ${l.cantidadConsumida - repartido} g por repartir.`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ninguno de los materiales alternativos alcanza. Se detalla cada uno
            con cuánto le falta, en vez de un "no hay stock" que no dice qué
            reponer. */}
        {sinMaterialConStock.length > 0 && (
          <div style={{
            padding: "14px 16px", background: "#c6413812",
            borderLeft: "3px solid #c64138", marginBottom: 20,
            fontSize: 13, lineHeight: 1.6,
          }}>
            <strong style={{ color: "#c64138" }}>
              No se puede marcar como impreso: ninguno de los materiales posibles
              tiene stock suficiente.
            </strong>
            {sinMaterialConStock.map(l => (
              <div key={l.clave} style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  {l.color} — necesita {totalPorLinea(l)} g
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 12 }}>
                  {materialesDe(l).map(m => {
                    const opciones = opcionesDeDescuento(filamentos, m, l.color, totalPorLinea(l));
                    const mejor = opciones.filter(o => o.tiene)
                      .sort((a, b) => b.disponible - a.disponible)[0];
                    return (
                      <li key={m}>
                        <strong style={{ color: "var(--text)" }}>{m}</strong>:{" "}
                        {mejor
                          ? `el rollo más grande tiene ${mejor.disponible} g, le faltan ${mejor.falta} g`
                          : "no hay ningún rollo cargado en ese color"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {sinOwnerConStock.length > 0 && (
          <div style={{
            padding: "14px 16px", background: "#c6413812",
            borderLeft: "3px solid #c64138", marginBottom: 20,
            fontSize: 13, lineHeight: 1.6,
          }}>
            <strong style={{ color: "#c64138" }}>
              No se puede marcar como impreso: ningún owner tiene stock suficiente.
            </strong>
            {/* Cuánto le falta a cada uno: el stock de dos owners no se suma,
                así que "entre los dos alcanza" no habilita nada. */}
            {sinOwnerConStock.map(l => (
              <div key={l.clave} style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  {l.material} {l.color} — necesita {totalPorLinea(l)} g
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 12 }}>
                  {(candidatos[l.clave] || []).map(o => (
                    <li key={o.id}>
                      {o.owner || "Sin owner"}:{" "}
                      {o.tiene
                        ? `${o.disponible} g, le faltan ${o.falta} g`
                        : "no tiene este filamento cargado"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div style={{ color: "var(--muted)", marginTop: 8, fontSize: 12 }}>
              El stock no se suma entre owners: la pieza sale de un rollo. Cargá lo que falta
              desde Inventario y volvé a intentar.
            </div>
          </div>
        )}

        {faltaElegir.length > 0 && (
          <div style={{
            padding: "14px 16px", background: "#c6413812",
            borderLeft: "3px solid #c64138", marginBottom: 20,
            fontSize: 13, lineHeight: 1.6,
          }}>
            <strong style={{ color: "#c64138" }}>
              Elegí de qué owner se descuenta cada filamento.
            </strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
              {[...new Set(faltaElegir.map(l => `${l.material} ${l.color}`.trim()))].map(t => (
                <li key={t}>{t} lo puede imprimir más de una persona</li>
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
              // El descuadre va primero: con los gramos mal repartidos la
              // validación de stock también falla, y "falta stock" mandaría a
              // reponer filamento cuando lo que falta es cerrar la suma.
              : malRepartidas.length > 0 ? "Falta repartir los gramos"
              : sinMaterialConStock.length > 0 ? "Falta stock"
              : sinOwnerConStock.length > 0 ? "Falta stock"
              : faltaElegir.length > 0 ? "Falta elegir owner"
              : !validacion.ok ? "Falta stock"
              : "Confirmar impresión"}
          </TKButton>
        </div>
      </div>
    </div>
  );
}
