import { useState, useEffect } from 'react';
import { TKButton, TKInput, TKPill, Icon } from '../../components/UI.jsx';
import { cargarGastosDe, cargarRestocksDe, registrarRestockEn } from '../../lib/historial.js';
import { TablaConTope } from '../../components/TablaConTope.jsx';
import { fmtDia } from '../../lib/fechas.js';

// Ocho filas antes de que la lista empiece a scrollear por dentro. Son tres
// listas en la misma pantalla: sin tope, una sola con historial largo deja a
// las otras dos abajo de todo.
const FILAS_VISIBLES = 8;

// Anchos fijos para lo que tiene largo conocido; la columna sin ancho —el
// producto, la nota— se queda con lo que sobra. En table-layout: fixed esto
// es lo único que define las columnas, y vale igual para el encabezado.
const ANCHO_FECHA = 104;
const ANCHO_ORDEN = 108;
// 140 y no 104: el ancho lo manda el TÍTULO, no el dato. "45 g" entra en
// cualquier lado, pero "DESPERDICIO" en mayúsculas con letter-spacing mide
// 137, y una columna más angosta recortaba el título con puntos suspensivos.
const ANCHO_CANT = 140;

const celdaTenue = { color: "var(--muted)" };

/** El título y la bajada de una sección. Los tres los escribían igual. */
function Seccion({ titulo, children, bajada }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
        {bajada}
      </div>
      {children}
    </div>
  );
}

/** Firestore Timestamp | Date | null → "12/03/2026 14:05" */
export function fmtFecha(valor) {
  if (!valor) return "—";
  const d = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * @param {string} [detalle] Aclaración entre paréntesis, para los insumos con
 *   varios tipos: "1 de 3" dice cuántos de ellos hay que reponer.
 */
export function RestockBadge({ detalle = "" }) {
  return (
    <span style={{
      display: "inline-block", padding: "4px 10px",
      background: "#c6413818", color: "#c64138",
      border: "1px solid #c6413855",
      fontSize: 10, fontWeight: 700, letterSpacing: 1,
      textTransform: "uppercase", borderRadius: 2, whiteSpace: "nowrap",
    }}>
      Hacer restock{detalle ? ` (${detalle})` : ""}
    </span>
  );
}

// Los dos indicadores comparten tamaño desde una constante y no desde dos
// literales iguales: así no pueden volver a separarse por descuido.
const TAM_NUMERO = 28;
const TAM_ROTULO = 10;

// Las barras de los dos indicadores van del mismo azul que las tarjetas del
// Dashboard, Estadísticas y Finanzas: son dos lecturas del mismo rollo, no dos
// estados. El verde de antes prometía "todo bien" sin que nadie lo decidiera.
const AZUL = "#345C83";
const ROJO = "#c64138";

const cardStyle = {
  padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)",
  marginBottom: 20,
};

/**
 * Detalle con los dos historiales (gastos y restocks) de un filamento o de un
 * insumo. Mismo componente para las dos colecciones: cambia el rótulo, la
 * unidad y si los gastos llevan columna de desperdicio.
 *
 * @param {string} coleccion       "filamentos" | "insumos"
 * @param {object} item            documento (necesita _id)
 * @param {string} [tipoId]        en insumos, el tipo cuyo historial se ve:
 *   cada tipo tiene el suyo en insumos/{id}/tipos/{tipoId}/…
 * @param {string} titulo          encabezado principal
 * @param {string} subtitulo       migaja de pan ("Inventario / Filamento")
 * @param {number} cantidad        stock actual
 * @param {string} unidad          "g" | "u."
 * @param {boolean} alerta         si está por debajo del umbral de restock
 * @param {boolean} conDesperdicio si los gastos tienen cantidadDesperdiciada
 * @param {Array|null} reservas    filas de reservasDeFilamento(). Null en los
 *   insumos, que no tienen esta vista: entonces no se muestra ni la sección
 *   "Reservado" ni el segundo indicador.
 */
export function DetalleHistorial({
  coleccion, item, tipoId = null, titulo, subtitulo, cantidad, unidad,
  alerta, conDesperdicio = false, reservas = null, onBack, onChanged, setMsg,
}) {
  const [gastos, setGastos] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRestock, setShowRestock] = useState(false);
  const [restockForm, setRestockForm] = useState({ cantidadAgregada: "", nota: "" });

  const cargarHistoriales = async () => {
    try {
      const [g, r] = await Promise.all([
        cargarGastosDe(coleccion, item._id, tipoId),
        cargarRestocksDe(coleccion, item._id, tipoId),
      ]);
      setGastos(g);
      setRestocks(r);
    } catch (err) {
      console.error(err);
      setMsg("Error al cargar historiales: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => { cargarHistoriales(); /* eslint-disable-next-line */ }, [coleccion, item._id, tipoId]);

  const guardarRestock = async () => {
    const n = Number(restockForm.cantidadAgregada);
    if (!n || n <= 0) return alert("Ingresá una cantidad mayor a 0.");
    try {
      await registrarRestockEn(coleccion, item._id, n, restockForm.nota, tipoId);
      setRestockForm({ cantidadAgregada: "", nota: "" });
      setShowRestock(false);
      setMsg(`✓ Restock de ${n} ${unidad} registrado.`);
      await cargarHistoriales();
      await onChanged();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const totalConsumido = gastos.reduce((s, g) => s + (Number(g.cantidadConsumida) || 0), 0);
  const totalDesperdiciado = gastos.reduce((s, g) => s + (Number(g.cantidadDesperdiciada) || 0), 0);
  const totalRepuesto = restocks.reduce((s, r) => s + (Number(r.cantidadAgregada) || 0), 0);
  const hayMovimientos = restocks.some(r => (Number(r.cantidadAgregada) || 0) < 0);

  // Lo comprometido por pedidos que todavía no se imprimieron. No salió del
  // rollo —el stock físico sigue entero— pero ya tiene dueño, así que no se
  // puede volver a prometer.
  const filasReservadas = reservas || [];
  const totalReservado = filasReservadas.reduce(
    (s, r) => s + (Number(r.cantidadConsumida) || 0), 0);
  // Puede dar negativo y se muestra así: si hay 500 g y 600 comprometidos,
  // −100 es el dato que hay que ver para reasignar un pedido o reponer.
  // Recortarlo en 0 escondería exactamente el problema que este número existe
  // para mostrar.
  const disponibleNuevos = (Number(cantidad) || 0) - totalReservado;
  const sobreReservado = disponibleNuevos < 0;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            {subtitulo}
          </div>
          <h2 style={{ fontSize: 28, margin: 0 }}>{titulo}</h2>
        </div>
        <TKButton variant="ghost" onClick={onBack} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      {/* alignItems stretch, no center: las dos tarjetas miden lo mismo y sus
          números apoyan en la misma base. Centradas, la más baja quedaba
          desplazada y los dos 28 px se leían como tamaños distintos. */}
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap", margin: "20px 0 24px" }}>
        <div style={{ padding: "16px 22px", background: "var(--bg-alt)", borderLeft: `3px solid ${alerta ? ROJO : AZUL}` }}>
          <div style={{ fontSize: TAM_ROTULO, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
            En stock
          </div>
          <div style={{ fontSize: TAM_NUMERO, color: alerta ? ROJO : "var(--text)" }}>
            {Number(cantidad || 0).toLocaleString("es-AR")} {unidad}
          </div>
          {/* El pie existe para que las dos tarjetas tengan las mismas tres
              filas. Ya que ocupa lugar, que diga en qué se diferencian. */}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Lo que hay en la bobina
          </div>
        </div>
        {/* El segundo número, y deliberadamente distinto del primero: "En
            stock" es lo que hay en la bobina y "Disponible" lo que todavía se
            puede prometer. Mostrar uno solo obligaba a elegir entre mentirle
            al depósito o al que toma pedidos. Va en punteado para que no se
            lea como una segunda medición de lo mismo. */}
        {reservas && (
          <div style={{
            padding: "16px 22px", background: "var(--bg-alt)",
            // Roja cuando hay que reponer, igual que la de al lado: el rollo
            // está en falta y las dos lo dicen. Y también cuando este número
            // quedó negativo, que es el problema propio de esta tarjeta y ya
            // la pintaba antes. Punteada y no sólida, para que se siga
            // leyendo como una medición distinta de la primera.
            borderLeft: `3px dashed ${(alerta || sobreReservado) ? ROJO : AZUL}`,
          }}>
            <div style={{ fontSize: TAM_ROTULO, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 6 }}>
              Disponible para nuevos pedidos
            </div>
            <div style={{ fontSize: TAM_NUMERO, color: sobreReservado ? ROJO : "var(--text)" }}>
              {disponibleNuevos.toLocaleString("es-AR")} {unidad}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              {totalReservado > 0
                ? `${totalReservado.toLocaleString("es-AR")} ${unidad} reservadas por pedidos pendientes`
                : "Sin reservas pendientes"}
            </div>
          </div>
        )}
        {/* alignSelf center porque la fila es stretch —así las dos tarjetas
            miden lo mismo— y sin esto el cartel se estiraba a esa altura, con
            dos palabras flotando en un cuadrado. */}
        {alerta && (
          <div style={{ alignSelf: "center" }}><RestockBadge/></div>
        )}
        <div style={{ flex: 1 }}/>
        <TKButton onClick={() => setShowRestock(v => !v)} icon={<Icon.plus size={14}/>}>Registrar restock</TKButton>
      </div>

      {showRestock && (
        <div style={cardStyle}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>Nuevo restock</div>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label={`Cantidad agregada (${unidad})`} type="number" value={restockForm.cantidadAgregada}
              onChange={e => setRestockForm(f => ({ ...f, cantidadAgregada: e.target.value }))}
              placeholder={unidad === "g" ? "1000" : "50"} />
            <TKInput label="Nota (opcional)" value={restockForm.nota}
              onChange={e => setRestockForm(f => ({ ...f, nota: e.target.value }))}
              placeholder="Compra nueva, proveedor X..." />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <TKButton onClick={guardarRestock}>Guardar restock</TKButton>
            <TKButton variant="outline" onClick={() => setShowRestock(false)}>Cancelar</TKButton>
          </div>
        </div>
      )}

      {/* Las tres apiladas a ancho completo, no dos columnas. Con Gastos metido
          en 1.4fr, su columna de producto quedaba en ~170 px y "Lampara
          Ondulada" se leía "La…". El orden sigue al tiempo: lo que ya salió
          del rollo, lo que está comprometido, y lo que entró. */}
      {loading ? (
        <div style={{ padding: 40, color: "var(--muted)" }}>Cargando historiales...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <Seccion
            titulo="Gastos"
            bajada={<>
              Se generan solos al marcar un pedido como impreso · {totalConsumido} {unidad} consumidas
              {conDesperdicio && ` + ${totalDesperdiciado} ${unidad} desperdiciadas`}
            </>}
          >
            <TablaConTope
              filas={FILAS_VISIBLES}
              vacio="Sin gastos registrados."
              columnas={[
                { titulo: "Fecha", ancho: ANCHO_FECHA },
                { titulo: "Orden", ancho: ANCHO_ORDEN },
                { titulo: "Producto" },
                { titulo: "Consumido", ancho: ANCHO_CANT, num: true },
                ...(conDesperdicio ? [{ titulo: "Desperdicio", ancho: ANCHO_CANT, num: true }] : []),
              ]}
            >
              {gastos.map(g => (
                <tr key={g._id}>
                  <td style={celdaTenue}>{fmtDia(g.fecha)}</td>
                  <td><TKPill variant="outline">{g.numeroOrden}</TKPill></td>
                  {/* title con el nombre entero: la celda lo recorta para que
                      todas las filas midan lo mismo, pero el dato no se pierde. */}
                  <td style={{ fontWeight: 600 }} title={g.producto}>{g.producto}</td>
                  <td className="num">{g.cantidadConsumida} {unidad}</td>
                  {conDesperdicio && (
                    <td className="num" style={{ color: (g.cantidadDesperdiciada || 0) > 0 ? "#B56B3E" : "var(--muted)" }}>
                      {g.cantidadDesperdiciada || 0} {unidad}
                    </td>
                  )}
                </tr>
              ))}
            </TablaConTope>
          </Seccion>

          {/* Tabla aparte de Gastos y no una columna más: un gasto ya salió
              del rollo y una reserva todavía no. Sin columna de desperdicio,
              que se mide recién al imprimir. */}
          {reservas && (
            <Seccion
              titulo="Reservado"
              bajada={<>
                Pedidos tomados y todavía no impresos · {totalReservado.toLocaleString("es-AR")} {unidad} comprometidas.
                No se descontaron del stock; se descuentan al marcar el pedido como impreso.
              </>}
            >
            <TablaConTope
              filas={FILAS_VISIBLES}
              vacio="Sin reservas: ningún pedido pendiente usa este rollo."
              columnas={[
                { titulo: "Fecha", ancho: ANCHO_FECHA },
                { titulo: "Orden", ancho: ANCHO_ORDEN },
                { titulo: "Producto" },
                { titulo: "Consumido", ancho: ANCHO_CANT, num: true },
              ]}
            >
              {filasReservadas.map(r => (
                <tr key={r.clave}>
                  <td style={celdaTenue}>{fmtDia(r.createdAt)}</td>
                  <td><TKPill variant="outline">{r.numeroOrden}</TKPill></td>
                  <td title={[r.productoNombre, r.varianteNombre, r.opcionesTexto, r.reparticion && `Repartición ${r.reparticion}`].filter(Boolean).join(" · ")}>
                    <span style={{ fontWeight: 600 }}>{r.productoNombre}</span>
                    {(r.varianteNombre || r.opcionesTexto) && (
                      <span style={{ color: "var(--muted)" }}>
                        {" · "}{[r.varianteNombre, r.opcionesTexto].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {/* Una línea repartida entre dos rollos deja una fila
                        en cada historial: sin esto, los gramos de la parte
                        se leerían como el consumo entero de la pieza. En
                        la misma línea, para no agrandar la fila. */}
                    {r.reparticion && (
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>
                        {" · "}Repartición {r.reparticion}
                      </span>
                    )}
                  </td>
                  <td className="num">{r.cantidadConsumida} {unidad}</td>
                </tr>
              ))}
            </TablaConTope>
            </Seccion>
          )}

          <Seccion
            titulo="Restocks"
            bajada={<>
              {/* Con alguna salida la suma ya no es "lo repuesto" sino el
                  neto, y decirle repuesto sería contar una transferencia como
                  si hubiera entrado material nuevo. Sin salidas, el texto de
                  siempre. */}
              Carga manual y movimientos · {totalRepuesto} {unidad}{" "}
              {hayMovimientos ? "netas en total" : "repuestas en total"}
            </>}
          >
            <TablaConTope
              filas={FILAS_VISIBLES}
              vacio="Sin restocks registrados."
              columnas={[
                { titulo: "Fecha", ancho: ANCHO_FECHA },
                { titulo: "Nota" },
                { titulo: "Agregado", ancho: ANCHO_CANT, num: true },
              ]}
            >
              {restocks.map(r => (
                <tr key={r._id}>
                  <td style={celdaTenue}>{fmtDia(r.fecha)}</td>
                  <td style={celdaTenue} title={r.nota || ""}>{r.nota || "—"}</td>
                  {/* Con signo y con color propio: una transferencia sale del
                      rollo con cantidad negativa, y el "+" fijo en verde de
                      antes la mostraba como "+-40 g", leyéndose como si
                      hubiera entrado material. */}
                  <td className="num" style={{
                    fontWeight: 700,
                    color: (Number(r.cantidadAgregada) || 0) < 0 ? "#B56B3E" : "#4a7a52",
                  }}>
                    {(Number(r.cantidadAgregada) || 0) < 0 ? "−" : "+"}
                    {Math.abs(Number(r.cantidadAgregada) || 0)} {unidad}
                  </td>
                </tr>
              ))}
            </TablaConTope>
          </Seccion>
        </div>
      )}

    </>
  );
}
