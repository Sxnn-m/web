#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  TKPrints — simulación del cambio de criterio de disponibilidad por owner
 *
 *  SOLO LEE. No escribe absolutamente nada en Firestore.
 *
 *  Compara, producto por producto, el criterio VIEJO contra el NUEVO:
 *
 *    viejo: se miraba UN rollo por material+color, el primero que devolvía
 *           la consulta, e ignoraba los demás;
 *    nuevo: cada rollo se evalúa por separado y alcanza con que ALGUNO llegue
 *           solo al doble del consumo — el stock no se suma entre owners.
 *
 *  Uso:
 *    node simular-owners.mjs
 *
 *  Variables de entorno (opcionales; lo que falte se pregunta):
 *    ADMIN_EMAIL     email de tu usuario admin
 *    ADMIN_PASSWORD  su contraseña (si no está, se pide sin mostrarla)
 *
 *  A diferencia de migrar-firestore.mjs este script SÍ va al repo: no tiene
 *  ninguna credencial adentro —el mail y la contraseña se tipean al correrlo,
 *  nunca se escriben en ningún archivo— y sirve cada vez que haya que revisar
 *  el impacto de tocar el criterio de disponibilidad.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createInterface } from 'node:readline';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './src/firebase.js';

import { claveFilamento, FACTOR_DISPONIBILIDAD } from './src/lib/disponibilidad.js';
import { consumoDeVariante, disponibilidadDeVariante } from './src/lib/variantes.js';
import { enriquecerProductos, cargarPrivados } from './src/lib/productosPrivados.js';
import { cargarInsumos } from './src/lib/insumos.js';

// ── Credenciales, siempre en runtime ──
const preguntar = (texto, oculto = false) => new Promise(resolve => {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (oculto) {
    // Sin eco: la contraseña no queda en pantalla ni en el scrollback.
    const escribir = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => escribir(s.includes(texto) ? s : "");
  }
  rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write("\n"); resolve(r.trim()); });
});

const email = process.env.ADMIN_EMAIL || await preguntar("Email admin: ");
const password = process.env.ADMIN_PASSWORD || await preguntar("Contraseña: ", true);

console.log("\nEntrando…");
try {
  await signInWithEmailAndPassword(auth, email, password);
} catch (err) {
  console.error(`\nNo se pudo entrar (${err.code || err.message}).`);
  console.error("Tiene que ser un usuario con role \"admin\": las reglas no dejan leer");
  console.error("filamentos ni los datos privados de los productos a nadie más.");
  process.exit(1);
}

const leer = async (col) => (await getDocs(collection(db, col))).docs
  .map(d => ({ _id: d.id, ...d.data() }));

const [filamentos, insumos, catalogo, personalizados] = await Promise.all([
  leer("filamentos"), cargarInsumos(), leer("products"), leer("personalizados"),
]);
const productos = enriquecerProductos(catalogo, await cargarPrivados(catalogo));
const custom = enriquecerProductos(personalizados, await cargarPrivados(personalizados, "personalizados"));
const todos = [...productos.map(p => ({ ...p, origen: "catálogo" })),
               ...custom.map(p => ({ ...p, origen: "personalizado" }))];

console.log(`Leídos: ${filamentos.length} filamentos, ${todos.length} productos, ${insumos.length} insumos.\n`);

// ── Cuántos rollos hay por material+color ──
const porClave = new Map();
for (const f of filamentos) {
  const clave = claveFilamento(f.material, f.color);
  if (!porClave.has(clave)) porClave.set(clave, []);
  porClave.get(clave).push(f);
}
const duplicados = [...porClave.entries()].filter(([, fs]) => fs.length > 1);

console.log("── Material+color cargado por más de un owner ──");
if (duplicados.length === 0) {
  console.log("Ninguno. Sin material+color repetido entre owners, el cambio de criterio");
  console.log("no puede alterar la disponibilidad de ningún producto.\n");
} else {
  for (const [, fs] of duplicados) {
    console.log(`  ${fs[0].material} ${fs[0].color}: ` +
      fs.map(f => `${f.owner || "(sin owner)"} ${Number(f.cantidadGramos) || 0} g`).join(" · ") +
      `  → suman ${fs.reduce((s, f) => s + (Number(f.cantidadGramos) || 0), 0)} g, ` +
      `el más grande tiene ${Math.max(...fs.map(f => Number(f.cantidadGramos) || 0))} g`);
  }
  console.log("");
}

/**
 * El criterio VIEJO, reproducido tal cual estaba: por cada material+color de
 * cada variante, el PRIMER filamento que matchea, y el producto disponible si
 * alguna variante pasa entera.
 */
const primero = (material, color) => {
  const clave = claveFilamento(material, color);
  return filamentos.find(f => claveFilamento(f.material, f.color) === clave) || null;
};
function disponibleViejo(producto) {
  const variantes = Array.isArray(producto?.variantes) ? producto.variantes : [];
  if (variantes.length === 0) return false;
  return variantes.some(v => {
    const lineas = consumoDeVariante(producto.receta || [], v);
    if (lineas.length === 0 || lineas.some(l => l.incompleta)) return false;
    return lineas.every(l => {
      const f = primero(l.material, l.color);
      return f && (Number(f.cantidadGramos) || 0) >= l.gramos * FACTOR_DISPONIBILIDAD;
    });
  });
}

// ── El diff ──
const cambios = [];
for (const p of todos) {
  const viejo = disponibleViejo(p);
  // Solo el eje del filamento, que es lo único que este cambio toca: los
  // insumos entran igual en los dos criterios y meterlos taparía el diff.
  const nuevo = (p.variantes || [])
    .some(v => disponibilidadDeVariante(p.receta || [], v, filamentos).disponible);
  if (viejo !== nuevo) cambios.push({ p, viejo, nuevo });
}

console.log("── Productos que cambian de estado ──");
const ganan = cambios.filter(c => !c.viejo && c.nuevo);
const pierden = cambios.filter(c => c.viejo && !c.nuevo);

if (pierden.length > 0) {
  console.log(`\n⚠  ${pierden.length} producto(s) pasarían a SIN STOCK (no debería pasar nunca):`);
  for (const c of pierden) console.log(`   ${c.p.id || c.p._id} — ${c.p.name} (${c.p.origen})`);
} else {
  console.log("\n✓ Ninguno pasa de disponible a sin stock. Es lo esperado: el criterio nuevo");
  console.log("  mira el rollo MÁS GRANDE y el viejo miraba uno cualquiera, así que todo lo");
  console.log("  que hoy da OK sigue dando OK.");
}

if (ganan.length > 0) {
  console.log(`\n${ganan.length} producto(s) hoy marcados sin stock pasan a DISPONIBLE`);
  console.log("(hoy están mal marcados: hay un owner que sí puede imprimirlos).");
  console.log("Al correr «Recalcular desde recetas» se van a publicar en el catálogo:");
  for (const c of ganan) console.log(`   ${c.p.id || c.p._id} — ${c.p.name} (${c.p.origen})`);
} else {
  console.log("\nNingún producto cambia de estado con el criterio nuevo.");
}

console.log("");
await signOut(auth);
process.exit(0);
