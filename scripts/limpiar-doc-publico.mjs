// ─── Limpieza del documento público de productos ─────────────────────
// PARA QUÉ
// products/{id} es la única colección con `allow read: if true`: cualquiera
// que abra el sitio se baja el documento entero. El guardado usa updateDoc,
// que FUSIONA, así que un campo escrito por una versión anterior de la app
// se queda ahí para siempre aunque el código de hoy ya no lo escriba.
//
// El caso que importa es "stock": era un contador manual que alimentaba un
// badge de "¡Últimas N unidades!". Dejó de leerse y de escribirse, pero en
// los productos que existían entonces sigue publicando una cantidad de
// inventario. También puede quedar specs.tiempoImpresionHorasDecimal, que
// este PR dejó de escribir porque no lo lee nadie.
//
// CÓMO SE CORRE
//   # 1. Vista previa. NO escribe nada.
//   TK_ADMIN_EMAIL=... TK_ADMIN_PASSWORD=... node scripts/limpiar-doc-publico.mjs
//
//   # 2. Recién después de revisar la vista previa:
//   TK_ADMIN_EMAIL=... TK_ADMIN_PASSWORD=... node scripts/limpiar-doc-publico.mjs --aplicar
//
// Las credenciales se leen del entorno y nunca se escriben acá. Tienen que
// ser de un usuario con role "admin": las reglas de Firestore no dejan
// escribir products a nadie más.
//
// QUÉ BORRA
// Solo los campos de primer nivel que no estén en CAMPOS_PUBLICOS_EN_DOC y
// las claves de specs que no estén en CAMPOS_SPECS. Nada más: no toca
// valores, no renombra, no borra documentos. Un campo que la app de hoy sí
// escribe no puede entrar en la lista de borrado, porque la lista se deriva
// del mismo módulo que arma el documento.

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import { auth, db } from '../src/firebase.js';
import { camposExtra } from '../src/lib/productoPublico.js';

const APLICAR = process.argv.includes("--aplicar");
const email = process.env.TK_ADMIN_EMAIL;
const password = process.env.TK_ADMIN_PASSWORD;

if (!email || !password) {
  console.error(
    "Faltan credenciales. Se leen del entorno, no se escriben en el script:\n" +
    "  TK_ADMIN_EMAIL=tu@mail  TK_ADMIN_PASSWORD=...  node scripts/limpiar-doc-publico.mjs"
  );
  process.exit(1);
}

await signInWithEmailAndPassword(auth, email, password);
console.log(`Autenticado como ${email}\n`);

const snap = await getDocs(collection(db, "products"));
const aLimpiar = [];

for (const d of snap.docs) {
  const datos = d.data();
  const extra = camposExtra(datos);
  if (extra.campos.length === 0 && extra.specs.length === 0) continue;
  aLimpiar.push({ id: d.id, nombre: datos.name || d.id, datos, extra });
}

// ── Vista previa ──────────────────────────────────────────────────────
console.log(`${snap.size} producto(s) revisados · ${aLimpiar.length} con campos de más\n`);

if (aLimpiar.length === 0) {
  console.log("Nada que limpiar.");
  await signOut(auth);
  process.exit(0);
}

// El valor se muestra para que se pueda decidir con el dato a la vista: si
// alguno resulta que SÍ hace falta, se agrega al allowlist en vez de borrarlo.
for (const p of aLimpiar) {
  console.log(`• ${p.nombre}  (${p.id})`);
  for (const c of p.extra.campos) {
    console.log(`    ${c} = ${JSON.stringify(p.datos[c])}`);
  }
  for (const c of p.extra.specs) {
    console.log(`    specs.${c} = ${JSON.stringify(p.datos.specs?.[c])}`);
  }
}

const cuenta = {};
for (const p of aLimpiar) {
  for (const c of p.extra.campos) cuenta[c] = (cuenta[c] || 0) + 1;
  for (const c of p.extra.specs) cuenta[`specs.${c}`] = (cuenta[`specs.${c}`] || 0) + 1;
}
console.log("\nResumen por campo:");
for (const [c, n] of Object.entries(cuenta).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${c.padEnd(34)} ${n} producto(s)`);
}

if (!APLICAR) {
  console.log(
    "\nVISTA PREVIA: no se escribió nada.\n" +
    "Para aplicarlo, volvé a correrlo con --aplicar."
  );
  await signOut(auth);
  process.exit(0);
}

// ── Aplicar ───────────────────────────────────────────────────────────
console.log("\nAplicando...");
let ok = 0;
for (const p of aLimpiar) {
  const patch = {};
  for (const c of p.extra.campos) patch[c] = deleteField();
  for (const c of p.extra.specs) patch[`specs.${c}`] = deleteField();
  try {
    await updateDoc(doc(db, "products", p.id), patch);
    ok++;
    console.log(`  ✓ ${p.nombre}`);
  } catch (err) {
    console.error(`  ✗ ${p.nombre}: ${err.message}`);
  }
}
console.log(`\n${ok}/${aLimpiar.length} productos limpiados.`);
await signOut(auth);
