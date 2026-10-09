// ─── Alta de un gasto ────────────────────────────────────────────────
// Tiene su propia URL (/admin/finanzas/gastos/nuevo) y no es un modal: lleva
// la lista de ítems entera, que no entra en una cajita.
//
// La diferencia con el detalle es cuándo se escribe. Acá los ítems viven en
// MEMORIA: agregarlos, editarlos y borrarlos no toca ningún inventario. Recién
// "Guardar gasto" los persiste, y lo hace en una sola transacción junto con el
// número correlativo, el stock de cada uno y sus restocks. Si algo falla no
// queda nada a medias y el formulario conserva lo cargado, que es justo lo que
// no pasaría si cada ítem se guardara por su cuenta.

import { useState, useMemo } from 'react';
import { TKButton, TKInput, Icon, fmtARS } from '../../components/UI.jsx';
import { hoyEnInput, validarGasto } from '../../lib/finanzas.js';
import { crearGastoConItems } from '../../lib/comprasInventario.js';
import { totalDeItems } from '../../lib/gastoItems.js';
import { ItemsDeGasto } from './ItemsDeGasto.jsx';
import { MontoDeGasto } from './MontoDeGasto.jsx';

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

export function NuevoGasto({
  filamentos = [], insumos = [], productos = [], personalizados = [], gastos = [],
  listas, onCrearInsumo, onBorrarInsumo, onInventarioChange,
  onGuardado, onVolver, onCambios, setMsg,
}) {
  const [form, setForm] = useState({ fecha: hoyEnInput(), descripcion: "", monto: "" });
  const [montoManual, setMontoManual] = useState(false);
  const [items, setItems] = useState([]);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  const suma = useMemo(() => totalDeItems(items), [items]);

  /**
   * Agregar o reemplazar un ítem de la lista local. Devuelve true porque el
   * componente de ítems cierra su borrador según lo que conteste: en el
   * detalle eso depende de que la transacción haya salido bien, acá nunca
   * puede fallar.
   */
  const guardarItem = (nuevo, anterior) => {
    setItems(xs => anterior
      ? xs.map(i => (i.itemId === anterior.itemId ? nuevo : i))
      : [...xs, nuevo]);
    return true;
  };

  const borrarItem = (item) => setItems(xs => xs.filter(i => i.itemId !== item.itemId));

  /**
   * Apagar el modo manual descarta lo escrito a mano y vuelve a la suma.
   * Prenderlo arranca desde la suma, que es el número que el usuario está
   * viendo: pedirle que lo reescriba entero para cambiar $200 sería absurdo.
   */
  const cambiarModoMonto = (manual) => {
    setMontoManual(manual);
    setForm(f => ({ ...f, monto: manual ? String(suma || "") : "" }));
    setErrores(e => ({ ...e, monto: "", items: "" }));
  };

  const cancelar = () => {
    if (items.length > 0 && !confirm(
      `Cargaste ${items.length} ítem(s) que todavía no se guardaron. ¿Salir y perderlos?`
    )) return;
    onVolver();
  };

  const guardar = async () => {
    const { valido, errores: errs } = validarGasto({ ...form, montoManual, items });
    setErrores(errs);
    if (!valido) return;

    setGuardando(true);
    try {
      const r = await crearGastoConItems({
        ...form, montoManual, items, filamentos,
      });
      setMsg(r.creados > 0
        ? `✓ ${r.numeroGasto} guardado. Se crearon ${r.creados} rollo(s) nuevos en Inventario.`
        : `✓ ${r.numeroGasto} guardado.`);
      await onCambios?.();
      if (items.some(i => i.categoria !== "envio")) await onInventarioChange?.();
      onGuardado?.(r);
    } catch (err) {
      // El formulario NO se limpia: si la transacción no entró, lo cargado
      // sigue siendo lo único que existe de esta compra.
      setMsg("No se guardó el gasto: " + err.message);
      setErrores({ general: err.message });
      setGuardando(false);
    }
  };

  const mensajes = Object.values(errores).filter(Boolean);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Finanzas / Gasto
          </div>
          <h2 style={{ fontSize: 28, margin: 0 }}>Nuevo gasto</h2>
        </div>
        <TKButton variant="ghost" onClick={cancelar} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
        El número GAS se asigna al guardar. Hasta entonces nada toca el inventario.
      </div>

      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 260px", gap: 16 }} className="form-layout">
          <TKInput label="Fecha" type="date" value={form.fecha}
            onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
            error={errores.fecha}/>
          <TKInput label="Descripción" value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            error={errores.descripcion} placeholder="Compra de octubre"/>
          <MontoDeGasto
            manual={montoManual}
            valor={form.monto}
            suma={suma}
            hayItems={items.length > 0}
            error={errores.monto}
            onToggle={cambiarModoMonto}
            onChange={v => setForm(f => ({ ...f, monto: v }))}
          />
        </div>
      </div>

      <div style={cardStyle}>
        <ItemsDeGasto
          items={items}
          modo="alta"
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

      {mensajes.length > 0 && (
        <div style={{
          padding: "12px 14px", background: "#c6413812", borderLeft: "3px solid #c64138",
          fontSize: 12.5, color: "#c64138", marginBottom: 16, lineHeight: 1.5,
        }}>
          {mensajes.join(" ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <TKButton onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar gasto"}
        </TKButton>
        <TKButton variant="outline" onClick={cancelar} disabled={guardando}>Cancelar</TKButton>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Total: <strong style={{ color: "var(--text)" }}>
            {fmtARS(montoManual ? (Number(form.monto) || 0) : suma)}
          </strong>
        </span>
      </div>
    </>
  );
}
