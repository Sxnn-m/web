// ─── Detalle de un gasto ─────────────────────────────────────────────
// Tiene su propia URL (/admin/finanzas/gastos/:id) y se carga por ID, así que
// el link se puede guardar y abrir directo: no depende de que la lista esté
// cargada ni de haber pasado por ella.
//
// La lista de ítems es el motivo de que esta vista exista: la descripción de
// la lista de Finanzas tiene que entrar en una fila, y lo que se compró de
// verdad —qué filamento, de qué marca, cuántos gramos— no entra ahí. Y además
// esos ítems mueven el inventario.

import { useState, useEffect } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../../components/UI.jsx';
import {
  cargarGasto, actualizarGasto, guardarDetalleGasto, eliminarGasto,
  inputDesdeFecha, validarGasto,
} from '../../lib/finanzas.js';
import { montoDeGasto, esMontoManual, totalDeItems } from '../../lib/gastoItems.js';
import { aplicarItem, previsualizarBorrado, revertirItemsDeGasto } from '../../lib/comprasInventario.js';
import { ItemsDeGasto } from './ItemsDeGasto.jsx';
import { MontoDeGasto } from './MontoDeGasto.jsx';

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

// El mismo azul que las tarjetas de resumen del tab, y el mismo tamaño en los
// dos: así se leen como un par y no como dos cosas de distinto peso.
const AZUL = "#345C83";

function Indicador({ label, valor }) {
  return (
    <div style={{ padding: "16px 22px", background: "var(--bg-alt)", borderLeft: `3px solid ${AZUL}` }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, color: AZUL }}>{valor}</div>
    </div>
  );
}

export function DetalleGasto({
  gastoId, filamentos = [], insumos = [], productos = [], personalizados = [], gastos = [],
  listas, onCrearInsumo, onBorrarInsumo, onInventarioChange,
  onVolver, onCambios, setMsg,
}) {
  const [gasto, setGasto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState("");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ fecha: "", descripcion: "", monto: "" });
  const [montoManual, setMontoManual] = useState(false);
  const [errores, setErrores] = useState({});

  const cargar = async () => {
    try {
      const g = await cargarGasto(gastoId);
      setGasto(g);
      setDetalle(g?.detalle || "");
      if (g) {
        setForm({
          fecha: inputDesdeFecha(g.fecha),
          descripcion: g.descripcion || "",
          monto: String(g.monto ?? ""),
        });
        setMontoManual(esMontoManual(g));
      }
    } catch (err) {
      setMsg("Error al cargar el gasto: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [gastoId]);

  const guardarDetalle = async () => {
    setGuardando(true);
    try {
      await guardarDetalleGasto(gastoId, detalle);
      setMsg("✓ Detalle guardado.");
      await cargar();
      await onCambios?.();
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  /** Guardar un ítem: la transacción mueve stock y reescribe el array. */
  const guardarItem = async (nuevo, anterior) => {
    setGuardando(true);
    let ok = false;
    try {
      const r = await aplicarItem({ gasto, anterior, nuevo, filamentos });
      setMsg(r.creoFilamento
        ? `✓ Ítem guardado. Se creó el rollo ${nuevo.material} ${nuevo.color} de ${nuevo.owner} en Inventario.`
        : "✓ Ítem guardado.");
      await cargar();
      await onCambios?.();
      // Más stock puede dejar productos disponibles: el mismo recálculo que
      // dispara un restock cargado a mano.
      if (r.movioStock) await onInventarioChange?.();
      ok = true;
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
    return ok;
  };

  const borrarItem = async (item) => {
    setGuardando(true);
    try {
      await aplicarItem({ gasto, anterior: item, nuevo: null, filamentos });
      setMsg("✓ Ítem eliminado y stock revertido.");
      await cargar();
      await onCambios?.();
      await onInventarioChange?.();
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  /**
   * Apagar el modo manual descarta lo escrito a mano y vuelve a la suma;
   * prenderlo arranca desde el monto que está valiendo hoy. Mismo criterio
   * que en el alta.
   */
  const cambiarModoMonto = (manual) => {
    setMontoManual(manual);
    setForm(f => ({ ...f, monto: manual ? String(montoDeGasto(gasto) || "") : "" }));
    setErrores(e => ({ ...e, monto: "", items: "" }));
  };

  const guardarDatos = async () => {
    const items = gasto.items || [];
    const { valido, errores: errs } = validarGasto({ ...form, montoManual, items });
    setErrores(errs);
    if (!valido) return;
    setGuardando(true);
    try {
      await actualizarGasto(gastoId, { ...form, montoManual }, { items });
      setEditando(false);
      setMsg("✓ Gasto actualizado.");
      await cargar();
      await onCambios?.();
    } catch (err) { setMsg("Error: " + err.message); }
    setGuardando(false);
  };

  const borrar = async () => {
    // Qué se va a revertir se consulta ANTES: avisar después de haber borrado
    // la mitad no sirve de nada.
    const { aRevertir, bloqueos } = previsualizarBorrado(gasto, { filamentos, insumos });
    if (bloqueos.length > 0) {
      alert(
        `No se puede eliminar ${gasto.numeroGasto}: hay ítems que no se pueden revertir ` +
        `porque el stock ya se consumió.\n\n${bloqueos.join("\n")}\n\n` +
        `Ajustá esas cantidades desde Inventario o Insumos y volvé a intentar.`
      );
      return;
    }
    const detalleItems = aRevertir.length > 0
      ? `\n\nSe van a revertir ${aRevertir.length} ítem(s) del inventario:\n` +
        aRevertir.map(i => `· ${i.categoria === "filamento"
          ? `${i.material} ${i.color} de ${i.owner}: −${i.cantidad} g`
          : `${i.insumoNombre}: −${i.cantidad} u.`}`).join("\n")
      : "";
    if (!confirm(`¿Eliminar el gasto ${gasto.numeroGasto} (${gasto.descripcion})?${detalleItems}`)) return;

    setGuardando(true);
    try {
      // Primero revertir, después borrar: si la reversión falla a mitad, el
      // gasto sigue existiendo con los ítems que quedan y se puede reintentar.
      await revertirItemsDeGasto(gasto, { filamentos });
      await eliminarGasto(gastoId);
      setMsg("✓ Gasto eliminado.");
      await onCambios?.();
      if (aRevertir.length > 0) await onInventarioChange?.();
      onVolver();
    } catch (err) {
      setMsg("Error: " + err.message);
      setGuardando(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, color: "var(--muted)" }}>Cargando gasto...</div>;
  }

  // Entrar por un link a un gasto borrado tiene que decir qué pasó, no quedar
  // en blanco ni volver solo: el que abrió el link merece saber por qué.
  if (!gasto) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 28, margin: 0 }}>Gasto no encontrado</h2>
          <TKButton variant="ghost" onClick={onVolver} icon={<Icon.back size={14}/>}>Volver</TKButton>
        </div>
        <div style={{ ...cardStyle, color: "var(--muted)", fontSize: 13 }}>
          Este gasto ya no existe: puede haberse eliminado desde la lista.
        </div>
      </>
    );
  }

  const fecha = typeof gasto.fecha?.toDate === "function" ? gasto.fecha.toDate() : gasto.fecha;
  const fechaTexto = fecha
    ? new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Finanzas / Gasto
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TKPill variant="outline">{gasto.numeroGasto}</TKPill>
            <h2 style={{ fontSize: 28, margin: 0 }}>{gasto.descripcion}</h2>
          </div>
        </div>
        <TKButton variant="ghost" onClick={onVolver} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      {/* Los dos indicadores van iguales y del mismo azul que las tarjetas de
          Finanzas: son dos datos del mismo gasto, no dos estados distintos, y
          un acento por tarjeta solo sugería una jerarquía que no existe. */}
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap", margin: "20px 0 24px" }}>
        <Indicador label="Fecha" valor={fechaTexto}/>
        {/* El monto efectivo: la suma de los ítems, o el escrito a mano. */}
        <Indicador label="Monto" valor={fmtARS(montoDeGasto(gasto))}/>
        <div style={{ flex: 1 }}/>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {/* Cerrar la edición DESCARTA lo tocado, el interruptor del monto
              incluido: si no, reabrirla mostraría un estado que nunca se
              guardó como si fuera el del gasto. */}
          <TKButton variant="outline" onClick={() => { if (editando) cargar(); setErrores({}); setEditando(v => !v); }}
            icon={<Icon.spark size={14}/>}>
            {editando ? "Cancelar edición" : "Editar datos"}
          </TKButton>
          <TKButton variant="outline" onClick={borrar} disabled={guardando}>Eliminar gasto</TKButton>
        </div>
      </div>

      {editando && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>Editar datos del gasto</div>
          {/* El número no está: es el correlativo, y editarlo lo dejaría sin
              servir para lo único que sirve, que es identificar la compra. */}
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 16 }}>
            El número {gasto.numeroGasto} no se puede cambiar: es el correlativo.
          </div>
          {/* La tercera columna lleva el monto con su interruptor al lado:
              "Editar monto manualmente" necesita 260px para no desbordar. */}
          <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 260px", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="Fecha" type="date" value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} error={errores.fecha}/>
            <TKInput label="Descripción" value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} error={errores.descripcion}/>
            <MontoDeGasto
              manual={montoManual}
              valor={form.monto}
              suma={totalDeItems(gasto.items || [])}
              hayItems={(gasto.items || []).length > 0}
              error={errores.monto || errores.items}
              onToggle={cambiarModoMonto}
              onChange={v => setForm(f => ({ ...f, monto: v }))}
            />
          </div>
          {Object.values(errores).filter(Boolean).length > 0 && (
            <div style={{ fontSize: 12, color: "#c64138", marginBottom: 12 }}>
              {Object.values(errores).filter(Boolean).join(" ")}
            </div>
          )}
          <TKButton onClick={guardarDatos} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </TKButton>
        </div>
      )}

      {/* Sin tarjeta alrededor: la tabla va directamente sobre el fondo de la
          página, igual que la de Productos. */}
      <div style={{ marginBottom: 24 }}>
        <ItemsDeGasto
          items={gasto.items || []}
          modo="detalle"
          filamentos={filamentos}
          insumos={insumos}
          productos={productos}
          personalizados={personalizados}
          gastos={gastos}
          listas={listas}
          guardando={guardando}
          onGuardar={guardarItem}
          onBorrar={borrarItem}
          onCrearInsumo={onCrearInsumo}
          onBorrarInsumo={onBorrarInsumo}
        />
      </div>

      {/* El texto libre de los gastos anteriores a los ítems. No se convierte
          ni se interpreta: no hay forma de saber si esas compras ya se
          cargaron a mano al inventario, y leerlas como ítems sumaría stock que
          quizá ya está. Se muestra solo si tiene algo, para que no quede una
          caja vacía en los gastos nuevos. */}
      {(gasto.detalle || "").trim() !== "" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>Detalle anterior (texto)</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Lo que estaba escrito antes de que existieran los ítems. No afecta al inventario
            ni al monto: está acá para no perderlo. Vaciándolo desaparece esta sección.
          </div>
          <textarea
            value={detalle}
            onChange={e => setDetalle(e.target.value)}
            rows={8}
            style={{
              width: "100%", padding: "12px 14px", background: "var(--bg)",
              border: "1px solid var(--line)", borderRadius: 4, resize: "vertical",
              fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
              color: "var(--text)", outline: "none", lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
            <TKButton onClick={guardarDetalle} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar texto"}
            </TKButton>
            {detalle !== (gasto.detalle || "") && (
              <span style={{ fontSize: 12, color: "#B56B3E" }}>Hay cambios sin guardar.</span>
            )}
          </div>
        </div>
      )}

    </>
  );
}
