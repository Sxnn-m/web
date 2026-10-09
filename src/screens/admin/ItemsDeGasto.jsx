// ─── Los ítems de un gasto ───────────────────────────────────────────
// La lista de lo que se compró. Misma UX que cargar productos en un pedido:
// "+ Agregar ítem" y una fila por ítem.
//
// Un ítem nuevo o editado vive como BORRADOR y recién se aplica al tocar
// "Guardar ítem". No es un detalle de estilo: guardar un ítem de filamento o
// de insumo suma stock de verdad, y con guardado en vivo un número a medio
// escribir —un 5 camino a 500— ya habría movido el inventario.

import { useState, useMemo } from 'react';
import { TKButton, TKInput, Icon, fmtARS } from '../../components/UI.jsx';
import { SelectorConAgregar } from '../../components/SelectorConAgregar.jsx';
import { ListaDesplegable } from '../../components/ListaDesplegable.jsx';
import {
  CATEGORIAS, itemVacio, cambiarCategoria, pierdeLink, aceptaLink,
  validarItem, normalizarItem, totalDeItem, totalDeItems, mueveStock, usosDeInsumo,
} from '../../lib/gastoItems.js';
import { tiposDe } from '../../lib/tiposInsumo.js';

const AZUL = "#345C83";

// Las mismas columnas para el encabezado y para cada fila. La del detalle va
// en minmax(0, 1fr) y no en 1fr: un track "fr" no puede achicarse por debajo
// de su contenido mínimo, así que con un texto largo se ensancharía y correría
// las demás, dejando los encabezados desalineados con los datos.
const COLUMNAS = "104px minmax(0, 1fr) 54px 130px 70px";

// Qué cambia entre cargar un gasto nuevo y editar uno ya guardado: en el alta
// los ítems viven en memoria hasta que se guarda el gasto, así que prometer
// que se va a mover inventario sería mentira.
const TEXTOS = {
  alta: {
    ayuda: "Los de filamento y de insumo van a sumar stock y a dejar un restock cuando guardes el gasto. " +
      "Los de envío solo suman al total.",
    vacio: "Todavía no hay ítems. Agregá uno para registrar qué se compró.",
    borrar: () => "¿Sacar este ítem de la compra?",
  },
  detalle: {
    ayuda: "Los de filamento y de insumo suman stock al guardarlos y dejan un restock en el " +
      "historial. Los de envío solo suman al total.",
    vacio: "Todavía no hay ítems. Agregá uno para registrar qué se compró.",
    borrar: (item) => mueveStock(item)
      ? `¿Eliminar este ítem? Se van a restar ${item.cantidad} ${item.categoria === "filamento" ? "g" : "u."} del inventario y se va a borrar su restock.`
      : "¿Eliminar este ítem?",
  },
};

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "4px 6px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

const rotulo = {
  display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

const nombreCategoria = (id) =>
  CATEGORIAS.find(c => c.id === id)?.nombre || id;

/** Lo que se lee de un ítem guardado, en una línea. */
function resumen(item) {
  if (item.categoria === "filamento") {
    return [
      `${item.material} ${item.color}`.trim(),
      item.marca && `(${item.marca})`,
      item.owner && `· ${item.owner}`,
      `· ${item.cantidad} g`,
    ].filter(Boolean).join(" ");
  }
  if (item.categoria === "insumo") {
    return [
      item.insumoNombre,
      item.tipoNombre && `· ${item.tipoNombre}`,
      item.marca && `(${item.marca})`,
      `· ${item.cantidad} u. × ${fmtARS(item.precioUnitario)}`,
    ].filter(Boolean).join(" ");
  }
  return "Costo de envío";
}

/**
 * Dónde se compró. Solo en filamento e insumo: el costo de envío no se compra
 * en ningún lado. El https:// se agrega solo al guardar, así que la ayuda lo
 * dice en vez de hacer que el usuario lo descubra.
 */
function CampoLink({ item, error, up }) {
  if (!aceptaLink(item.categoria)) return null;
  return (
    <div>
      <TKInput label="Link (opcional)" value={item.link || ""}
        onChange={e => up({ link: e.target.value })} error={error}
        placeholder="mercadolibre.com.ar/..."/>
      {!error && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          Dónde se compró. Si no ponés https://, se agrega solo.
        </div>
      )}
    </div>
  );
}

export function ItemsDeGasto({
  items = [], modo = "detalle",
  filamentos = [], insumos = [], productos = [], personalizados = [], gastos = [],
  listas, onGuardar, onBorrar, onCrearInsumo, onBorrarInsumo, guardando,
}) {
  const textos = TEXTOS[modo] || TEXTOS.detalle;
  const [borrador, setBorrador] = useState(null);   // {item, esNuevo}
  const [errores, setErrores] = useState({});

  const total = useMemo(() => totalDeItems(items), [items]);

  const abrirNuevo = () => { setErrores({}); setBorrador({ item: itemVacio("filamento"), esNuevo: true }); };
  const editar = (item) => { setErrores({}); setBorrador({ item: { ...item }, esNuevo: false }); };
  const up = (patch) => setBorrador(b => ({ ...b, item: { ...b.item, ...patch } }));

  /** Cambiar de categoría rehace el borrador: los campos son otros. */
  const cambiarCat = (c) => {
    // Pasar a Envío se lleva el link puesto, porque ahí no existe. Avisarlo
    // antes es más barato que que el usuario lo descubra al volver.
    if (pierdeLink(borrador.item, c) &&
        !confirm("Los ítems de Envío no llevan link. Se va a descartar el que cargaste. ¿Seguir?")) return;
    setErrores({});
    setBorrador(b => ({ ...b, item: cambiarCategoria(b.item, c) }));
  };

  // El nombre se guarda junto al id para que el ítem siga leyéndose si después
  // el insumo se borra del catálogo. El tipo se reinicia porque los tipos de un
  // insumo no son los del otro: arrastrarlo guardaría un tipo ajeno.
  const elegirInsumo = (id, nombre) => up({
    insumoId: id, tipoId: "", tipoNombre: "",
    insumoNombre: nombre || insumos.find(i => i._id === id)?.nombre || "",
  });

  const guardar = async () => {
    const { valido, errores: errs } = validarItem(borrador.item, { insumos });
    setErrores(errs);
    if (!valido) return;
    const ok = await onGuardar(
      normalizarItem(borrador.item, { insumos }),
      borrador.esNuevo ? null : items.find(i => i.itemId === borrador.item.itemId) || null,
    );
    if (ok) setBorrador(null);
  };

  const borrar = async (item) => {
    if (!confirm(textos.borrar(item))) return;
    await onBorrar(item);
  };

  const insumoElegido = insumos.find(i => i._id === borrador?.item?.insumoId) || null;
  const tiposDelInsumo = insumoElegido ? tiposDe(insumoElegido) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 18 }}>Ítems de la compra</div>
        {!borrador && (
          <TKButton onClick={abrirNuevo} icon={<Icon.plus size={14}/>}>Agregar ítem</TKButton>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
        {textos.ayuda}
      </div>

      {items.length === 0 && !borrador && (
        <div style={{ padding: 20, color: "var(--muted)", fontSize: 13, border: "1px dashed var(--line)" }}>
          {textos.vacio}
        </div>
      )}

      {/* Los encabezados no son una tabla aparte: comparten la misma plantilla
          de columnas que las filas, así no hay dos definiciones de ancho que
          puedan separarse. */}
      {items.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: COLUMNAS, gap: 12,
          padding: "0 12px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
          textTransform: "uppercase", color: "var(--muted)",
        }} className="items-head">
          <span>Categoría</span>
          <span>Detalle</span>
          <span>Link</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span/>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(item => (
          borrador && !borrador.esNuevo && borrador.item.itemId === item.itemId ? null : (
            <div key={item.itemId} style={{
              display: "grid", gridTemplateColumns: COLUMNAS,
              gap: 12, alignItems: "center",
              padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--line)",
            }} className="form-layout">
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                color: AZUL, background: `${AZUL}18`, border: `1px solid ${AZUL}44`,
                padding: "3px 8px", borderRadius: 2, textAlign: "center",
              }}>
                {nombreCategoria(item.categoria)}
              </span>
              <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={resumen(item)}>
                {resumen(item)}
              </span>
              {/* Envío no tiene link: su celda es un guion, sin ancla. */}
              <span style={{ fontSize: 12.5, overflow: "hidden" }}>
                {aceptaLink(item.categoria) && item.link ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer"
                    title={item.link}
                    style={{ color: "var(--accent)", textDecoration: "underline" }}>
                    Link
                  </a>
                ) : (
                  <span style={{ color: "var(--muted)" }}>—</span>
                )}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right" }}>
                {fmtARS(totalDeItem(item))}
              </span>
              <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button style={actionBtn} title="Editar" onClick={() => editar(item)} disabled={guardando}>
                  <Icon.spark size={13}/>
                </button>
                <button style={{ ...actionBtn, color: "#c64138" }} title="Eliminar"
                  onClick={() => borrar(item)} disabled={guardando}>
                  <Icon.trash size={13}/>
                </button>
              </span>
            </div>
          )
        ))}

        {borrador && (
          <div style={{ padding: 14, background: "var(--bg-alt)", border: `1px solid ${AZUL}55` }}>
            <div style={{ maxWidth: 220, marginBottom: 14 }}>
              <label style={rotulo}>Categoría</label>
              <ListaDesplegable
                opciones={CATEGORIAS.map(c => ({ id: c.id, nombre: c.nombre }))}
                valor={borrador.item.categoria}
                onElegir={cambiarCat}
                titulo="Qué se compró"
              />
            </div>

            {/* Siete campos no entran en una línea legible, así que el
                filamento va en dos: primero qué rollo es, después cuánto. */}
            {borrador.item.categoria === "filamento" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }} className="form-layout">
                  <SelectorConAgregar label="Material" value={borrador.item.material}
                    opciones={listas.materiales} onChange={v => up({ material: v })}
                    onEliminarOpcion={(v, i) => listas.eliminar("material", v, i)}
                    placeholder="Nuevo material..."/>
                  <SelectorConAgregar label="Color" value={borrador.item.color}
                    opciones={listas.colores} onChange={v => up({ color: v })}
                    onEliminarOpcion={(v, i) => listas.eliminar("color", v, i)}
                    placeholder="Nuevo color..."/>
                  <SelectorConAgregar label="Marca" value={borrador.item.marca}
                    opciones={listas.marcas} onChange={v => up({ marca: v })}
                    onEliminarOpcion={(v, i) => listas.eliminar("marca", v, i)}
                    placeholder="Nueva marca..."/>
                  <SelectorConAgregar label="Owner" value={borrador.item.owner}
                    opciones={listas.owners} onChange={v => up({ owner: v })}
                    onEliminarOpcion={(v, i) => listas.eliminar("owner", v, i)}
                    placeholder="Nuevo owner..."/>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "180px 180px 1fr", gap: 12, marginBottom: 14 }} className="form-layout">
                  <TKInput label="Cantidad (g)" type="number" value={borrador.item.cantidad}
                    onChange={e => up({ cantidad: e.target.value })} error={errores.cantidad} placeholder="1000"/>
                  <TKInput label="Precio total" type="number" value={borrador.item.precioTotal}
                    onChange={e => up({ precioTotal: e.target.value })} error={errores.precioTotal} placeholder="18000"/>
                  <CampoLink item={borrador.item} error={errores.link} up={up}/>
                </div>
              </>
            )}

            {borrador.item.categoria === "insumo" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: tiposDelInsumo.length > 1 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }} className="form-layout">
                  {/* Las opciones salen del catálogo de Insumos, no de una
                      lista aparte: un insumo que existe acá existe allá. */}
                  <SelectorConAgregar label="Insumo" value={borrador.item.insumoId}
                    // El valor guardado es el id del insumo, pero lo que se
                    // lee tiene que ser su nombre.
                    opciones={insumos.map(i => i._id)}
                    etiquetaDe={(id) => insumos.find(i => i._id === id)?.nombre || id}
                    // Lo tipeado se busca por nombre: si ya existe se elige ese
                    // insumo en vez de crear un duplicado.
                    resolver={(txt) => {
                      const ya = insumos.find(i =>
                        (i.nombre || "").trim().toLowerCase() === txt.trim().toLowerCase());
                      return ya ? { valor: ya._id, existente: true } : { valor: txt, existente: false };
                    }}
                    // Cambiar de insumo reinicia el tipo: los de uno no son
                    // los del otro, y arrastrarlo guardaría un tipo ajeno.
                    onChange={v => elegirInsumo(v)}
                    // El alta devuelve el id del documento creado; hasta que
                    // vuelve, el campo tiene el texto tipeado.
                    onAgregar={async (txt) => {
                      const id = await onCrearInsumo?.(txt);
                      // El nombre va explícito: la lista de insumos de este
                      // render todavía no tiene el que se acaba de crear.
                      elegirInsumo(id || "", id ? String(txt).trim() : "");
                    }}
                    onEliminarOpcion={async (id, info) => {
                      const borrado = await onBorrarInsumo?.(id, info);
                      // Si borró justo el que estaba cargado, el campo no puede
                      // quedar apuntando a un documento que ya no existe.
                      if (borrado && info?.seleccionada) elegirInsumo("");
                    }}
                    placeholder="Nuevo insumo..."
                    hint="Agregarlo acá lo crea en el catálogo de Insumos."/>
                  {/* Solo cuando hay más de uno: con un tipo único no hay
                      decisión que tomar y el selector sería un clic vacío. */}
                  {tiposDelInsumo.length > 1 && (
                    <div>
                      <label style={rotulo}>Tipo</label>
                      <ListaDesplegable
                        opciones={tiposDelInsumo.map(t => ({ id: t.tipoId, nombre: t.nombre }))}
                        valor={borrador.item.tipoId}
                        onElegir={v => up({ tipoId: v })}
                        vacio="— Elegir tipo —"
                        invalido={Boolean(errores.tipoId)}
                        titulo={`Qué tipo de ${insumoElegido?.nombre || "insumo"}`}/>
                    </div>
                  )}
                  <SelectorConAgregar label="Marca (opcional)" value={borrador.item.marca}
                    opciones={listas.marcas} onChange={v => up({ marca: v })}
                    onEliminarOpcion={(v, i) => listas.eliminar("marca", v, i)}
                    placeholder="Nueva marca..."/>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "180px 180px 1fr", gap: 12, marginBottom: 14, alignItems: "end" }} className="form-layout">
                  <TKInput label="Precio unitario" type="number" value={borrador.item.precioUnitario}
                    onChange={e => up({ precioUnitario: e.target.value })} error={errores.precioUnitario} placeholder="50"/>
                  <TKInput label="Cantidad (u.)" type="number" value={borrador.item.cantidad}
                    onChange={e => up({ cantidad: e.target.value })} error={errores.cantidad} placeholder="20"/>
                  <div style={{ paddingBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>Precio total</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtARS(totalDeItem(borrador.item))}</div>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <CampoLink item={borrador.item} error={errores.link} up={up}/>
                </div>
              </>
            )}

            {borrador.item.categoria === "envio" && (
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 14 }} className="form-layout">
                <TKInput label="Precio" type="number" value={borrador.item.precioTotal}
                  onChange={e => up({ precioTotal: e.target.value })} error={errores.precioTotal} placeholder="2500"/>
                <div/>
              </div>
            )}

            {Object.values(errores).filter(Boolean).length > 0 && (
              <div style={{ fontSize: 12, color: "#c64138", marginBottom: 12, lineHeight: 1.5 }}>
                {Object.values(errores).filter(Boolean).join(" ")}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <TKButton onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar ítem"}
              </TKButton>
              <TKButton variant="outline" onClick={() => { setBorrador(null); setErrores({}); }} disabled={guardando}>
                Cancelar
              </TKButton>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "baseline",
          marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)",
        }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            Total de {items.length} ítem{items.length === 1 ? "" : "s"}
          </span>
          <span style={{ fontSize: 20, fontWeight: 700, color: AZUL }}>{fmtARS(total)}</span>
        </div>
      )}
    </div>
  );
}

export { usosDeInsumo };
