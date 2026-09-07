// ─── Opciones ocultas de los combobox de filamento ───────────────────
// Material, color y marca NO tienen catálogo propio: sus opciones son un
// distinct sobre los filamentos cargados. Por eso "eliminar una opción" no
// puede ser borrar un elemento de una lista — el valor volvería a aparecer
// en el próximo render, porque el filamento que lo usa sigue existiendo.
//
// Acá se guarda qué valores dejaron de ofrecerse. Los filamentos que ya los
// usaban NO se tocan: conservan su material/color/marca y se siguen viendo
// en el listado de Inventario; simplemente no se sugieren para los nuevos.

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export const DOC_OCULTAS = "opcionesOcultas";

export const CAMPOS = ["material", "color", "marca"];

const vacio = () => ({ material: [], color: [], marca: [] });

/** Normaliza lo que venga guardado a la forma esperada. */
export function normalizarOcultas(data = {}) {
  const salida = vacio();
  for (const campo of CAMPOS) {
    const lista = Array.isArray(data?.[campo]) ? data[campo] : [];
    salida[campo] = [...new Set(lista.map(v => String(v || "").trim()).filter(Boolean))];
  }
  return salida;
}

/**
 * Quita de una lista de opciones las que estén ocultas para ese campo.
 * La comparación ignora mayúsculas y espacios, igual que el resto del
 * matcheo de filamentos.
 */
export function filtrarVisibles(opciones = [], ocultas = []) {
  const fuera = new Set(ocultas.map(o => String(o).trim().toLowerCase()));
  return opciones.filter(o => !fuera.has(String(o).trim().toLowerCase()));
}

export async function cargarOcultas() {
  try {
    const snap = await getDoc(doc(db, "settings", DOC_OCULTAS));
    return snap.exists() ? normalizarOcultas(snap.data()) : vacio();
  } catch (err) {
    console.warn("No se pudieron cargar las opciones ocultas:", err);
    return vacio();
  }
}

/** Oculta un valor para un campo. Devuelve el mapa completo actualizado. */
export async function ocultarOpcion(campo, valor, ocultas) {
  if (!CAMPOS.includes(campo)) throw new Error(`Campo desconocido: ${campo}`);
  const texto = String(valor || "").trim();
  if (!texto) return ocultas;

  const actual = normalizarOcultas(ocultas);
  const clave = texto.toLowerCase();
  if (actual[campo].some(v => v.toLowerCase() === clave)) return actual;

  const nuevo = { ...actual, [campo]: [...actual[campo], texto] };
  await setDoc(doc(db, "settings", DOC_OCULTAS), { ...nuevo, updatedAt: serverTimestamp() });
  return nuevo;
}
