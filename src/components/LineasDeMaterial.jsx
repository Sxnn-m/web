// ─── La sección de material de los dos modales ───────────────────────
// La misma lista de piezas, los mismos selectores y el mismo reparto entre
// owners sirven para reservar (al crear el pedido) y para descontar (al
// imprimirlo). Lo único que cambia es el vocabulario y que al reservar no se
// pide desperdicio, porque todavía no se imprimió nada.
//
// Está junto y no duplicado a propósito: si dividir entre owners funcionara
// distinto en los dos momentos, se podría reservar un reparto que después el
// modal de impresión no sabe reproducir.

import { TKInput } from './UI.jsx';
import { materialesDe } from '../lib/consumoPedido.js';
import { esDividida } from '../lib/reparticiones.js';
import { ListaDesplegable } from './ListaDesplegable.jsx';

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

const TEXTOS = {
  imprimir: {
    rotuloOwner: "Descontar de",
    tituloOwner: (l) => `De quién se descuenta el ${l.material} ${l.color}`,
    tituloMaterial: (l) => `Con cuál de ${materialesDe(l).join(" o ")} se imprimió`,
    rotuloTotal: "Total a descontar:",
    // "disponible" y "libre" no son lo mismo: al imprimir se mira la bobina,
    // al reservar lo que queda sin comprometer. Decirlo con la palabra justa
    // evita que el número parezca contradecir al del tab Inventario.
    notaInsuficiente: (m) => `· ${m.disponible} g disponibles, necesita ${m.necesita} g`,
    sinLlegar: (n) => `Ningún owner llega solo a los ${n} g de esta parte.`,
    elegirOwner: "elegí de cuál se descuenta",
    conDesperdicio: true,
  },
  reservar: {
    rotuloOwner: "Reservar de",
    tituloOwner: (l) => `De quién se reserva el ${l.material} ${l.color}`,
    tituloMaterial: (l) => `Con cuál de ${materialesDe(l).join(" o ")} se va a imprimir`,
    rotuloTotal: "A reservar:",
    notaInsuficiente: (m) => `· ${m.disponible} g libres, necesita ${m.necesita} g`,
    sinLlegar: (n) => `Ningún owner tiene libres los ${n} g de esta parte.`,
    elegirOwner: "elegí de cuál se reserva",
    conDesperdicio: false,
  },
};

/** El encabezado de una pieza: el producto y, debajo, qué se eligió. */
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

/**
 * @param {object} o             todo lo que devuelve usarOrigen()
 * @param {string} modo          "imprimir" | "reservar"
 * @param {object} desperdicios  solo en modo imprimir
 */
export function LineasDeMaterial({ o, modo, desperdicios = {}, setDesperdicios }) {
  const t = TEXTOS[modo];

  /** Con qué material se imprime esta parte, cuando la receta acepta varios. */
  const selectorMaterial = (l, ancho = 300) => o.materialesPosibles[l.clave] ? (
    <div style={{ marginBottom: 12, maxWidth: ancho }}>
      <label style={labelSelector}>Material usado</label>
      <ListaDesplegable
        // Se listan TODOS, también los que no llegan: deshabilitados y con el
        // motivo, que es lo que deja ver de un vistazo qué filamento reponer.
        opciones={o.materialesPosibles[l.clave].map(m => ({
          id: m.material,
          nombre: m.material,
          nota: m.alcanza ? ""
            : m.tiene ? t.notaInsuficiente(m)
            : `· no hay ${m.material} ${l.color} en inventario`,
          deshabilitada: !m.alcanza,
        }))}
        valor={o.queAlcanzan(l.clave).includes(l.material) ? l.material : ""}
        onElegir={m => o.setMaterialElegido(e => ({ ...e, [l.clave]: m }))}
        vacio={o.queAlcanzan(l.clave).length === 0 ? "— Ninguno alcanza —" : "— Elegir material —"}
        invalido={o.queAlcanzan(l.clave).length === 0}
        titulo={t.tituloMaterial(l)}
      />
      {o.queAlcanzan(l.clave).length === 0 && (
        <div style={{ fontSize: 11, color: "#c64138", marginTop: 6, lineHeight: 1.5 }}>
          Ninguno de {materialesDe(l).join(" / ")} en {l.color} llega a los{" "}
          {o.totalPorLinea(l)} g que hacen falta.
        </div>
      )}
    </div>
  ) : null;

  /**
   * De qué rollo sale. El selector va SIEMPRE, aunque haya un solo owner
   * posible: de quién sale cada impresión se confirma a mano.
   */
  const selectorOwner = (l) => {
    const opciones = o.candidatos[l.clave] || [];
    return (
      <div>
        <label style={labelSelector}>{t.rotuloOwner}</label>
        <ListaDesplegable
          // Los que no sirven se listan igual, deshabilitados y con el motivo:
          // saber que Ana no tiene ese filamento es parte de la respuesta.
          opciones={opciones.map(op => ({
            id: op.id,
            nombre: op.tiene ? `${op.owner || "Sin owner"} — ${op.disponible} g`
                             : `${op.owner} — sin cargar`,
            nota: op.alcanza ? ""
              : op.tiene ? `· insuficiente, necesita ${o.totalPorLinea(l)} g`
              : "· no tiene este filamento",
            deshabilitada: !op.alcanza,
          }))}
          valor={o.asignaciones[l.clave]?.id || ""}
          onElegir={id => o.setElegido(e => ({ ...e, [l.clave]: id }))}
          vacio={opciones.length === 0 ? "— Nadie lo tiene cargado —" : "— Elegir owner —"}
          invalido={Boolean(o.asignaciones[l.clave]?.pendiente) || opciones.length === 0}
          deshabilitado={opciones.length === 0}
          titulo={t.tituloOwner(l)}
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
    const opciones = o.candidatos[l.clave] || [];
    if (opciones.length === 0) return (
      <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
        No hay ningún rollo de {l.material} {l.color} cargado en inventario.
      </div>
    );
    const asignada = o.asignaciones[l.clave];
    if (asignada?.sinStock) return (
      <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
        {t.sinLlegar(o.totalPorLinea(l))}
      </div>
    );
    if (asignada?.pendiente) return (
      <div style={{ fontSize: 11.5, color: "#c64138", marginTop: 8 }}>
        Hay {opciones.filter(op => op.alcanza).length} owners que pueden imprimir{" "}
        {l.material} {l.color}: {t.elegirOwner}.
      </div>
    );
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
      {/* Un bloque por PIEZA, no por material: una receta de dos materiales es
          una sola pieza y repetir su encabezado dos veces la hacía parecer dos
          productos distintos. */}
      {o.piezasDeMaterial.map(pieza => (
        <div key={pieza.indice} style={{ padding: 14, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
          <EncabezadoPieza pieza={pieza}/>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {pieza.lineas.map((l, i) => {
              // Sin dividir hay una sola parte, que es la línea entera: el
              // caso de siempre es el caso de una repartición.
              const partes = o.partesDe(l.clave);
              const dividida = esDividida(o.reparticiones, l.clave);
              const entera = partes[0] || l;
              const descuadre = o.malRepartidas.find(d => d.clave === l.clave);
              const repartido = (o.reparticiones[l.clave] || [])
                .reduce((acc, parte) => acc + (Number(parte.gramos) || 0), 0);
              return (
                <div key={l.clave} style={{
                  // Cada material de la pieza se separa del anterior con una
                  // línea fina, no con otra tarjeta.
                  borderTop: i > 0 ? "1px solid var(--line)" : "none",
                  paddingTop: i > 0 ? 14 : 0,
                }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", gap: 12, marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {/* Con alternativas se nombran todas y se marca cuál se
                          usa. Dividida no se dice: cada parte elige el suyo. */}
                      {materialesDe(l).length > 1
                        ? (dividida
                            ? <>{materialesDe(l).join(" / ")} · {l.color} — </>
                            : <>{materialesDe(l).join(" / ")} · {l.color} — usando <strong style={{ color: "var(--text)" }}>{entera.material}</strong> —{" "}</>)
                        : <>{l.material} · {l.color} — </>}
                      {l.gramosPorUnidad} g × {l.cantidad} u ={" "}
                      <strong style={{ color: "var(--text)" }}>{l.cantidadConsumida} g</strong>
                    </div>
                    {/* Con una sola unidad no hay nada que repartir: la pieza
                        sale entera de un rollo o de ninguno. */}
                    {l.cantidad > 1 && !l.sinVariante && (
                      <button type="button" style={linkBtn}
                        onClick={() => dividida ? o.unificar(l.clave) : o.dividir(l)}>
                        {dividida ? "Unificar en un owner" : "Dividir entre owners"}
                      </button>
                    )}
                  </div>

                  {!dividida ? (
                    <>
                      {selectorMaterial(entera)}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: t.conDesperdicio ? "150px 250px 1fr" : "250px 1fr",
                        gap: 14, alignItems: "start",
                      }}>
                        {t.conDesperdicio && campoDesperdicio(entera)}
                        {selectorOwner(entera)}
                        {/* La cantidad va SIEMPRE en su propia línea, no
                            cuando no entra: con el ancho justo el número caía
                            solo a veces y el corte quedaba distinto. */}
                        <div style={{ fontSize: 12, color: "var(--muted)", paddingTop: 16 }}>
                          <div>{t.rotuloTotal}</div>
                          <div style={{ color: "var(--text)", fontWeight: 700, marginTop: 2 }}>
                            {o.totalPorLinea(entera)} g
                          </div>
                        </div>
                      </div>
                      {avisosDeParte(entera)}
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {partes.map((parte, j) => (
                        <div key={parte.clave} style={{
                          padding: 12, background: "var(--bg)", border: "1px solid var(--line)",
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
                              onClick={() => o.quitarParte(l.clave, j)}>Quitar</button>
                          </div>
                          {selectorMaterial(parte, 260)}
                          {/* Al imprimir, el desperdicio es de CADA persona:
                              una puede haber tenido una falla y la otra no. */}
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: t.conDesperdicio
                              ? "minmax(0,1fr) 88px 128px" : "minmax(0,1fr) 110px",
                            gap: 12, alignItems: "start",
                          }}>
                            {selectorOwner(parte)}
                            <TKInput
                              label="Gramos"
                              type="number"
                              value={(o.reparticiones[l.clave][j] || {}).gramos ?? 0}
                              onChange={e => o.cambiarParte(l.clave, j, e.target.value)}
                            />
                            {t.conDesperdicio && campoDesperdicio(parte)}
                          </div>
                          {avisosDeParte(parte)}
                        </div>
                      ))}
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", gap: 12,
                      }}>
                        <button type="button" style={linkBtn}
                          onClick={() => o.agregarParte(l.clave)}>+ Agregar repartición</button>
                        <div style={{ fontSize: 12, color: descuadre ? "#c64138" : "var(--muted)" }}>
                          Repartido <strong>{repartido} g</strong> de {l.cantidadConsumida} g
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
  );
}
