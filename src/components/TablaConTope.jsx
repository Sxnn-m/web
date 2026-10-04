// ─── Tabla con tope de filas visibles ────────────────────────────────
// Una tabla de 40 filas empuja todo lo que viene abajo fuera de la pantalla.
// Acá se corta a N filas y el resto se ve scrolleando adentro.
//
// Es una <table> con table-layout: fixed y no una grilla de divs, y eso NO es
// cosmético. Con grid, encabezado y filas resolvían anchos distintos aunque
// compartieran el mismo grid-template-columns: una pista `fr` no baja de su
// min-content, y la celda de fecha de una fila ("16/09/2026") mide bastante
// más que la palabra "FECHA" del encabezado, así que se robaba ancho de la
// columna flexible y corría todo lo que venía después. Con layout fijo los
// anchos salen SOLO del colgroup: no es que queden alineados, es que no hay
// mecanismo para que se desalineen.
//
// El tope tampoco sale de una constante de altura de fila: se mide dónde
// empieza la fila N+1, que corta en el lugar justo sea cual sea su altura.

import { useRef, useState, useLayoutEffect, Children } from 'react';

/**
 * @param {number} filas  cuántas se ven antes de que aparezca el scroll
 * @param {Array<{titulo, ancho?, num?}>} columnas  sin `ancho` la columna es
 *   la flexible: se queda con lo que sobra. `num` la alinea a la derecha, en
 *   el encabezado y en las celdas a la vez.
 * @param {string} vacio  qué decir cuando no hay ninguna fila
 * @param {ReactNode} children  los <tr> del cuerpo
 */
export function TablaConTope({ filas = 10, columnas = [], vacio = "", children }) {
  const ref = useRef(null);
  const anchoPrevio = useRef(0);
  const [tope, setTope] = useState(null);
  const cantidad = Children.count(children);

  useLayoutEffect(() => {
    const caja = ref.current;
    if (!caja) return;

    const medir = () => {
      const cuerpo = caja.querySelector("tbody");
      // La fila N+1 es la primera que sobra. Sin ella, la lista entra entera
      // y no hay nada que cortar.
      const sobrante = cuerpo?.children[filas];
      if (!sobrante) { setTope(null); return; }
      // Por rects y no por offsetTop: el offsetParent de un <tr> es
      // impredecible entre navegadores. El scrollTop entra en la cuenta para
      // que medir con la lista ya scrolleada dé lo mismo.
      setTope(Math.round(
        sobrante.getBoundingClientRect().top
        - caja.getBoundingClientRect().top
        + caja.scrollTop
      ));
    };
    medir();

    // Al angostarse la pantalla las filas crecen y el tope medido en desktop
    // mostraría menos filas de las pedidas. Se mira solo el ANCHO: el alto lo
    // decide el propio tope, así que reaccionar a él sería observar la
    // consecuencia de la última medición y entrar en un ciclo.
    const observador = new ResizeObserver(([entrada]) => {
      const ancho = Math.round(entrada.contentRect.width);
      if (ancho === anchoPrevio.current) return;
      anchoPrevio.current = ancho;
      medir();
    });
    observador.observe(caja);
    return () => observador.disconnect();
  }, [filas, cantidad]);

  return (
    <div
      ref={ref}
      style={{
        maxHeight: tope ?? undefined,
        overflowY: tope ? "auto" : "visible",
        // Sin overscroll-behavior a propósito: el default encadena al llegar
        // al final, que es lo que deja seguir scrolleando la página. Poner
        // "contain" —el reflejo habitual— dejaría el dedo atrapado en la lista.
      }}
    >
      <table className="tabla-tope">
        <colgroup>
          {columnas.map((c, i) => <col key={i} style={c.ancho ? { width: c.ancho } : undefined}/>)}
        </colgroup>
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={i} className={c.num ? "num" : undefined}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {cantidad === 0 && vacio && (
        <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>{vacio}</div>
      )}
    </div>
  );
}
