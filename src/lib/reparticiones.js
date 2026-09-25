// ─── Dividir el consumo de una línea entre varios owners ─────────────
// Un pedido de 2 unidades puede imprimirlo una persona sola o dos a la vez,
// una unidad cada una. En el segundo caso el filamento sale de DOS rollos, y
// hasta ahora había que elegir uno solo y ajustar el otro a mano.
//
// La división no le enseña nada nuevo al descuento: una repartición es UNA
// LÍNEA MÁS DEL PLAN, con su propia clave y sus propios gramos. Todo lo que ya
// existe —agrupar por rollo, validar, descontar, registrar el gasto— trata dos
// reparticiones igual que trataba dos productos distintos que comen el mismo
// filamento, que es un caso que ya sabía resolver. De ahí sale gratis que el
// gasto quede separado por repartición, que el desperdicio sea de cada una, y
// que dos reparticiones del MISMO rollo se fusionen en un solo update (dos
// escrituras al mismo documento en una transacción se pisan).

/** La clave de la repartición i de una línea. */
export const claveRepart = (clave, i) => `${clave}#${i}`;

/** ¿Esta línea está dividida? */
export const esDividida = (reparticiones, clave) =>
  Array.isArray(reparticiones?.[clave]) && reparticiones[clave].length > 0;

/**
 * El reparto inicial al activar la división: dos partes, por unidades enteras.
 * Es el caso que motiva la función —"una unidad cada uno"— y deja los gramos
 * ya cuadrados, así no arranca en error.
 */
export function reparticionesPorDefecto(linea) {
  const cantidad = Number(linea?.cantidad) || 0;
  const gramos = Number(linea?.gramosPorUnidad) || 0;
  const consumo = Number(linea?.cantidadConsumida) || 0;
  if (cantidad < 2 || gramos <= 0) {
    // Sin unidades que repartir se parte el consumo al medio, y el resto va a
    // la primera para que la suma siga dando exacto.
    const mitad = Math.round(consumo / 2);
    return [{ gramos: consumo - mitad }, { gramos: mitad }];
  }
  const primera = Math.ceil(cantidad / 2);
  return [{ gramos: gramos * primera }, { gramos: gramos * (cantidad - primera) }];
}

/**
 * El plan con cada línea dividida abierta en sus reparticiones.
 *
 * La sub-línea conserva todo lo de la original salvo los gramos, que son los
 * de su parte, y lleva `reparticionDe` para poder volver a agruparlas en la
 * UI. Una línea sin color resuelto no se divide: no se sabe de qué rollo sale
 * ninguna de las partes.
 */
export function expandirReparticiones(plan = [], reparticiones = {}) {
  const salida = [];
  for (const linea of plan) {
    const partes = reparticiones?.[linea.clave];
    if (linea.sinVariante || !Array.isArray(partes) || partes.length === 0) {
      salida.push(linea);
      continue;
    }
    partes.forEach((parte, i) => salida.push({
      ...linea,
      clave: claveRepart(linea.clave, i),
      cantidadConsumida: Number(parte.gramos) || 0,
      reparticionDe: linea.clave,
      indiceRepart: i,
      totalReparticiones: partes.length,
    }));
  }
  return salida;
}

/**
 * Las líneas divididas que todavía no cierran.
 *
 * La suma tiene que dar EXACTO el consumo de la receta: de menos deja gramos
 * sin descontar de nadie, de más descuenta filamento que la pieza no usó. Y
 * una parte en 0 no es una repartición, es una fila de más que además dejaría
 * un gasto de 0 g en el historial.
 *
 * @returns {Array<{clave, productoNombre, material, color, suma, necesita, hayCero}>}
 */
export function descuadres(plan = [], reparticiones = {}) {
  const salida = [];
  for (const linea of plan) {
    const partes = reparticiones?.[linea.clave];
    if (!Array.isArray(partes) || partes.length === 0) continue;
    const suma = partes.reduce((s, p) => s + (Number(p.gramos) || 0), 0);
    const necesita = Number(linea.cantidadConsumida) || 0;
    const hayCero = partes.some(p => (Number(p.gramos) || 0) <= 0);
    if (suma === necesita && !hayCero) continue;
    salida.push({
      clave: linea.clave, productoNombre: linea.productoNombre,
      material: linea.material, color: linea.color, suma, necesita, hayCero,
    });
  }
  return salida;
}

/**
 * Del origen por sub-clave que devuelve usarOrigen() al que se guarda en el
 * pedido, con las reparticiones plegadas bajo la clave de su línea.
 *
 * Se guarda plegado y no plano para que la clave siga siendo la de la línea
 * del plan: así quien lee el pedido —las reservas, el propio modal— no tiene
 * que saber nada del formato de las sub-claves.
 */
export function plegarOrigen(planExpandido = [], origenPlano = {}) {
  const mapa = {};
  for (const linea of planExpandido) {
    const o = origenPlano[linea.clave];
    if (!o) continue;
    if (!linea.reparticionDe) { mapa[linea.clave] = o; continue; }
    const acum = mapa[linea.reparticionDe] || { reparticiones: [] };
    acum.reparticiones.push({ ...o, gramos: Number(linea.cantidadConsumida) || 0 });
    mapa[linea.reparticionDe] = acum;
  }
  return mapa;
}

/** La vuelta: del origen guardado al estado inicial del modal. */
export function desplegarOrigen(origen = {}) {
  const reparticiones = {};
  const plano = {};
  for (const [clave, o] of Object.entries(origen || {})) {
    if (!Array.isArray(o?.reparticiones)) { plano[clave] = o; continue; }
    reparticiones[clave] = o.reparticiones.map(r => ({ gramos: Number(r.gramos) || 0 }));
    o.reparticiones.forEach((r, i) => { plano[claveRepart(clave, i)] = r; });
  }
  return { reparticiones, plano };
}
