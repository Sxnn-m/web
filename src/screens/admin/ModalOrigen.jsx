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
import { usarOrigen } from '../../components/usarOrigen.js';
import { LineasDeMaterial } from '../../components/LineasDeMaterial.jsx';
import { reservasDePedidos, filamentosNetos } from '../../lib/reservas.js';

// Vivía acá; ahora es del componente compartido. Se reexporta para no romper
// a quien la importaba desde este archivo.
export { EncabezadoPieza } from '../../components/LineasDeMaterial.jsx';

const aviso = {
  padding: "14px 16px", background: "#c6413812",
  borderLeft: "3px solid #c64138", marginBottom: 20,
  fontSize: 13, lineHeight: 1.6,
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

  // El mismo hook que usa el modal de impresión, división entre owners
  // incluida: lo único distinto es que acá se evalúa contra el stock neto y
  // que no se pide desperdicio.
  const o = usarOrigen({ plan, filamentos: netos, inicial: {} });
  const {
    planResuelto, totalPorLinea, candidatos, origen, origenPlano,
    faltaElegir, sinOwnerConStock, sinMaterialConStock, malRepartidas,
  } = o;

  // Las partes que hay que resolver. Una línea sin variante de color no se
  // puede imputar a ningún rollo, así que no reserva ni bloquea: es un pedido
  // que va a haber que ajustar a mano, igual que antes de todo esto.
  const aResolver = planResuelto.filter(l => !l.sinVariante);
  // Nadie tiene ese filamento cargado: no aparece ni como owner insuficiente.
  const sinRollo = aResolver.filter(l => (candidatos[l.clave] || []).length === 0);
  const faltanOrigen = aResolver.filter(l => !origenPlano[l.clave]);
  const puedeGuardar = faltanOrigen.length === 0 && malRepartidas.length === 0 && !guardando;

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
          <LineasDeMaterial o={o} modo="reservar"/>
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
              // El descuadre va primero: con los gramos mal repartidos también
              // falla el chequeo de owner, y "falta stock" mandaría a reponer
              // filamento cuando lo que falta es cerrar la suma.
              : malRepartidas.length > 0 ? "Falta repartir los gramos"
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
