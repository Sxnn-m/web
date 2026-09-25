// ─── Modal: de qué rollo sale cada filamento del pedido ──────────────
// Se abre al TOMAR el pedido, entre el formulario y el guardado. Elige lo
// mismo que el modal de impresión —material, cuando la receta acepta varios,
// y owner— pero sin desperdicio y sin descontar nada: el desperdicio recién
// se conoce cuando la pieza salió de la impresora.
//
// Existe porque una reserva tiene que apuntar a un rollo concreto. Reservar
// "50 g de PLA Negro" sin decir de quién obligaría a repartir el faltante
// entre owners al imprimir, que es justo la decisión que este paso evita.

import { useMemo } from 'react';
import { TKButton, Icon } from '../../components/UI.jsx';
import { planDeConsumo } from '../../lib/inventario.js';
import { materialesDe } from '../../lib/consumoPedido.js';
import { opcionesDeDescuento } from '../../lib/opcionesFilamento.js';
import { ListaDesplegable } from '../../components/ListaDesplegable.jsx';
import { usarOrigen } from '../../components/usarOrigen.js';
import { reservasDePedidos, filamentosNetos } from '../../lib/reservas.js';

/**
 * El encabezado de una pieza del pedido: el producto y, debajo, qué se eligió.
 * Mismo formato que la fila del pedido en el listado.
 */
export function EncabezadoPieza({ pieza }) {
  const elegido = [pieza.varianteNombre, pieza.opcionesTexto].filter(Boolean).join(" · ");
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{pieza.productoNombre}</div>
      {elegido && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{elegido}</div>
      )}
    </div>
  );
}

const aviso = {
  padding: "14px 16px", background: "#c6413812",
  borderLeft: "3px solid #c64138", marginBottom: 20,
  fontSize: 13, lineHeight: 1.6,
};

const labelSelector = {
  display: "block", fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

/**
 * @param {Array}  items      las líneas ya armadas del pedido por crear
 * @param {Array}  pedidos    los pedidos vigentes, para netear lo ya reservado
 * @param {Function} onConfirmar  recibe el mapa origen y guarda el pedido
 */
export function ModalOrigenPedido({
  items, cliente, numeroOrden, productos, personalizados = [], filamentos,
  pedidos = [], guardando = false, onClose, onConfirmar,
}) {
  const pedidoProvisorio = useMemo(() => ({ items }), [items]);
  const plan = useMemo(
    () => planDeConsumo(pedidoProvisorio, productos, personalizados),
    [pedidoProvisorio, productos, personalizados]);

  // Contra el stock NETO, no el físico: lo que otros pedidos pendientes ya
  // comprometieron no se puede volver a prometer. Este pedido todavía no
  // existe, así que no se está restando a sí mismo.
  const netos = useMemo(() => {
    const reservas = reservasDePedidos(pedidos, productos, personalizados);
    return filamentosNetos(filamentos, reservas);
  }, [pedidos, productos, personalizados, filamentos]);

  const {
    planResuelto, piezasDeMaterial, totalPorLinea,
    materialesPosibles, queAlcanzan, candidatos, asignaciones, origen,
    faltaElegir, sinOwnerConStock, sinMaterialConStock,
    setElegido, setMaterialElegido,
  } = usarOrigen({ plan, filamentos: netos, inicial: {} });

  // Las líneas que hay que resolver. Una línea sin variante de color no se
  // puede imputar a ningún rollo, así que no reserva ni bloquea: es un pedido
  // que va a haber que ajustar a mano, igual que antes de todo esto.
  const aResolver = planResuelto.filter(l => !l.sinVariante);
  // Nadie tiene ese filamento cargado: no aparece ni como owner insuficiente.
  const sinRollo = aResolver.filter(l => (candidatos[l.clave] || []).length === 0);
  const faltanOrigen = aResolver.filter(l => !origen[l.clave]);
  const puedeGuardar = faltanOrigen.length === 0 && !guardando;

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
          <h3 style={{ fontSize: 24, margin: 0 }}>
            Origen del filamento{numeroOrden ? ` · Pedido ${numeroOrden}` : ""}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
            <Icon.close size={18}/>
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 0, marginBottom: 20 }}>
          Elegí de qué rollo sale cada filamento de {cliente || "este pedido"}. Esos gramos quedan{" "}
          <strong style={{ color: "var(--text)" }}>reservados</strong> desde ahora: no se descuentan del
          stock, pero dejan de estar disponibles para otros pedidos. El desperdicio se pide después, al
          marcarlo como impreso.
        </p>

        {/* Los gramos se evalúan contra lo que queda libre, no contra lo que
            hay en la bobina. Decirlo evita que el número del modal parezca
            contradecir el del tab Inventario. */}
        <div style={{
          padding: "12px 14px", background: "var(--bg-alt)", borderLeft: "3px solid var(--line)",
          fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 20,
        }}>
          Los gramos que se muestran ya descuentan lo reservado por pedidos pendientes.
        </div>

        {plan.some(l => l.sinVariante) && (
          <div style={{
            padding: "12px 14px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E",
            fontSize: 12.5, lineHeight: 1.6, marginBottom: 20,
          }}>
            No se puede saber de qué rollo sale{" "}
            <strong>{[...new Set(plan.filter(l => l.sinVariante)
              .map(l => `${l.productoNombre} (${l.material})`))].join(", ")}</strong>:
            la receta no dice el color. <strong>Esos gramos no se reservan</strong> y habrá que
            ajustarlos a mano desde Inventario.
          </div>
        )}

        {aResolver.length === 0 ? (
          <div style={{
            padding: "16px 18px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E",
            fontSize: 13, marginBottom: 20,
          }}>
            No hay filamento que reservar en este pedido.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {piezasDeMaterial.map(pieza => (
              <div key={pieza.indice} style={{ padding: 14, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
                <EncabezadoPieza pieza={pieza}/>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {pieza.lineas.filter(l => !l.sinVariante).map((l, i) => {
                    const opciones = candidatos[l.clave] || [];
                    const asignada = asignaciones[l.clave];
                    const pendiente = Boolean(asignada?.pendiente);
                    const sinStock = Boolean(asignada?.sinStock);
                    return (
                      <div key={l.clave} style={{
                        borderTop: i > 0 ? "1px solid var(--line)" : "none",
                        paddingTop: i > 0 ? 14 : 0,
                      }}>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                          {materialesDe(l).length > 1
                            ? <>{materialesDe(l).join(" / ")} · {l.color} — usando <strong style={{ color: "var(--text)" }}>{l.material}</strong> —{" "}</>
                            : <>{l.material} · {l.color} — </>}
                          {l.gramosPorUnidad} g × {l.cantidad} u ={" "}
                          <strong style={{ color: "var(--text)" }}>{l.cantidadConsumida} g</strong>
                        </div>

                        {/* Mismo orden que al imprimir: primero el material,
                            porque los owners de abajo son los de ESE material. */}
                        {materialesPosibles[l.clave] && (
                          <div style={{ marginBottom: 12, maxWidth: 300 }}>
                            <label style={labelSelector}>Material usado</label>
                            <ListaDesplegable
                              opciones={materialesPosibles[l.clave].map(m => ({
                                id: m.material,
                                nombre: m.material,
                                nota: m.alcanza ? ""
                                  : m.tiene
                                    ? `· ${m.disponible} g libres, necesita ${m.necesita} g`
                                    : `· no hay ${m.material} ${l.color} en inventario`,
                                deshabilitada: !m.alcanza,
                              }))}
                              valor={queAlcanzan(l.clave).includes(l.material) ? l.material : ""}
                              onElegir={m => setMaterialElegido(e => ({ ...e, [l.clave]: m }))}
                              vacio={queAlcanzan(l.clave).length === 0
                                ? "— Ninguno alcanza —"
                                : "— Elegir material —"}
                              invalido={queAlcanzan(l.clave).length === 0}
                              titulo={`Con cuál de ${materialesDe(l).join(" o ")} se va a imprimir`}
                            />
                            {queAlcanzan(l.clave).length === 0 && (
                              <div style={{ fontSize: 11, color: "#c64138", marginTop: 6, lineHeight: 1.5 }}>
                                Ninguno de {materialesDe(l).join(" / ")} en {l.color} tiene libres los{" "}
                                {totalPorLinea(l)} g que hacen falta.
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sin campo de desperdicio, a propósito: todavía no se
                            imprimió nada, así que no hay pérdida que declarar. */}
                        <div style={{
                          display: "grid", gridTemplateColumns: "250px 1fr",
                          gap: 14, alignItems: "start",
                        }}>
                          <div>
                            <label style={labelSelector}>Reservar de</label>
                            <ListaDesplegable
                              opciones={opciones.map(o => ({
                                id: o.id,
                                nombre: o.tiene
                                  ? `${o.owner || "Sin owner"} — ${o.disponible} g`
                                  : `${o.owner} — sin cargar`,
                                nota: o.alcanza ? ""
                                  : o.tiene ? `· insuficiente, necesita ${totalPorLinea(l)} g`
                                  : "· no tiene este filamento",
                                deshabilitada: !o.alcanza,
                              }))}
                              valor={asignada?.id || ""}
                              onElegir={id => setElegido(e => ({ ...e, [l.clave]: id }))}
                              vacio={opciones.length === 0 ? "— Nadie lo tiene cargado —" : "— Elegir owner —"}
                              invalido={pendiente || opciones.length === 0}
                              deshabilitado={opciones.length === 0}
                              titulo={`De quién se reserva el ${l.material} ${l.color}`}
                            />
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", paddingTop: 16 }}>
                            <div>A reservar:</div>
                            <div style={{ color: "var(--text)", fontWeight: 700, marginTop: 2 }}>
                              {totalPorLinea(l)} g
                            </div>
                          </div>
                        </div>

                        {pendiente && !sinStock && (
                          <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
                            Hay {opciones.filter(o => o.alcanza).length} owners con {l.material}{" "}
                            {l.color} libre: elegí de cuál se reserva.
                          </div>
                        )}
                        {sinStock && (
                          <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
                            Ningún owner tiene libres los {totalPorLinea(l)} g de esta línea.
                          </div>
                        )}
                        {opciones.length === 0 && (
                          <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
                            No hay ningún rollo de {l.material} {l.color} cargado en inventario.
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

        {/* Los mismos tres bloqueos que al imprimir, con el mismo detalle de
            cuánto le falta a cada uno: el mensaje que sirve es el que dice qué
            reponer, no "no hay stock". */}
        {sinMaterialConStock.length > 0 && (
          <div style={aviso}>
            <strong style={{ color: "#c64138" }}>
              No se puede crear el pedido: ninguno de los materiales posibles tiene stock libre suficiente.
            </strong>
            {sinMaterialConStock.map(l => (
              <div key={l.clave} style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>{l.color} — necesita {totalPorLinea(l)} g</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 12 }}>
                  {materialesDe(l).map(m => {
                    const ops = opcionesDeDescuento(netos, m, l.color, totalPorLinea(l));
                    const mejor = ops.filter(o => o.tiene).sort((a, b) => b.disponible - a.disponible)[0];
                    return (
                      <li key={m}>
                        <strong style={{ color: "var(--text)" }}>{m}</strong>:{" "}
                        {mejor
                          ? `el rollo con más libre tiene ${mejor.disponible} g, le faltan ${mejor.falta} g`
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
          <div style={aviso}>
            <strong style={{ color: "#c64138" }}>
              No se puede crear el pedido: ningún owner tiene stock libre suficiente.
            </strong>
            {sinOwnerConStock.map(l => (
              <div key={l.clave} style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  {l.material} {l.color} — necesita {totalPorLinea(l)} g
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 12 }}>
                  {(candidatos[l.clave] || []).map(o => (
                    <li key={o.id}>
                      {o.owner || "Sin owner"}:{" "}
                      {o.tiene ? `${o.disponible} g libres, le faltan ${o.falta} g`
                        : "no tiene este filamento cargado"}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div style={{ color: "var(--muted)", marginTop: 8, fontSize: 12 }}>
              El stock no se suma entre owners: la pieza sale de un rollo. Cargá lo que falta desde
              Inventario, o imprimí antes alguno de los pedidos que están reservando.
            </div>
          </div>
        )}

        {sinRollo.length > 0 && (
          <div style={aviso}>
            <strong style={{ color: "#c64138" }}>
              No se puede crear el pedido: falta cargar filamento en inventario.
            </strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
              {[...new Set(sinRollo.map(l => `${l.material} ${l.color}`.trim()))].map(t => (
                <li key={t}>{t} no está cargado</li>
              ))}
            </ul>
          </div>
        )}

        {faltaElegir.length > 0 && (
          <div style={aviso}>
            <strong style={{ color: "#c64138" }}>
              Elegí de qué owner se reserva cada filamento.
            </strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
              {[...new Set(faltaElegir.map(l => `${l.material} ${l.color}`.trim()))].map(t => (
                <li key={t}>{t} lo puede imprimir más de una persona</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <TKButton variant="outline" onClick={onClose} disabled={guardando}>Cancelar</TKButton>
          <TKButton onClick={() => onConfirmar(origen)} disabled={!puedeGuardar}>
            {guardando ? "Guardando..."
              : sinMaterialConStock.length > 0 ? "Falta stock"
              : sinOwnerConStock.length > 0 ? "Falta stock"
              : sinRollo.length > 0 ? "Falta stock"
              : faltaElegir.length > 0 ? "Falta elegir owner"
              : "Crear pedido y reservar"}
          </TKButton>
        </div>
      </div>
    </div>
  );
}
