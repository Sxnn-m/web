// ─── Lista con tope de filas visibles ────────────────────────────────
// Una tabla de 40 filas empuja todo lo que viene abajo fuera de la pantalla y
// obliga a scrollear la página entera para llegar al siguiente bloque. Acá se
// corta a N filas y el resto se ve scrolleando adentro.
//
// El tope NO sale de una constante de altura de fila. Las filas de este
// backoffice no miden todas lo mismo —una fila con pill mide 48, una simple
// 39, y una de reserva repartida 53 porque lleva una segunda línea— y en
// mobile la tipografía estira todo. Una constante quedaría desfasada al primer
// cambio de padding.
//
// Lo que se mide es el offsetTop de la fila N+1, o sea exactamente dónde
// empieza la que sobra. Eso corta en el lugar justo sea cual sea la altura
// real de cada fila. Y como es un max-height, con menos filas que el tope no
// hay nada que recortar: no queda espacio en blanco sin necesidad de un caso
// especial.

import { useRef, useState, useLayoutEffect, Children } from 'react';

/**
 * @param {number} filas     cuántas se ven antes de que aparezca el scroll
 * @param {ReactNode} cabecera  la fila de títulos; va adentro y sticky, así
 *   queda fija al scrollear y su alto entra solo en el cálculo
 */
export function ListaConTope({ filas = 10, cabecera, children }) {
  const ref = useRef(null);
  const anchoPrevio = useRef(0);
  const [tope, setTope] = useState(null);
  const cantidad = Children.count(children);

  useLayoutEffect(() => {
    const caja = ref.current;
    if (!caja) return;

    const medir = () => {
      // children[0] es la cabecera, así que la fila N+1 es children[filas + 1].
      const sobrante = caja.children[filas + 1];
      // Sin fila sobrante no hay nada que cortar: la lista entra entera.
      if (!sobrante) { setTope(null); return; }
      // offsetTop contra el propio contenedor (de ahí el position: relative):
      // ya incluye la cabecera, no hay que sumarla aparte.
      setTope(sobrante.offsetTop);
    };
    medir();

    // Al angostarse la pantalla las filas crecen —el texto pasa a dos líneas,
    // la tipografía estira— y el tope medido en desktop deja ver ocho filas
    // donde tendría que haber diez. Hay que volver a medir.
    //
    // Se mira solo el ANCHO: el alto de la caja lo decide el propio tope, así
    // que reaccionar a él sería observar la consecuencia de la última medición
    // y entrar en un ciclo.
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
        position: "relative",
        maxHeight: tope ?? undefined,
        overflowY: tope ? "auto" : "visible",
        // Sin overscroll-behavior a propósito: el default encadena al llegar
        // al final, que es lo que deja seguir scrolleando la página. Poner
        // "contain" acá —el reflejo habitual— dejaría el dedo atrapado en la
        // lista en mobile.
      }}
    >
      <div style={{ position: "sticky", top: 0, zIndex: 1 }}>{cabecera}</div>
      {children}
    </div>
  );
}
