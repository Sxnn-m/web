// ─── Firebase Storage: archivos de diseño ────────────────────────────
// Primer y único uso de Storage en el proyecto (las imágenes de producto
// son URLs externas de imgbb). Todo lo de acá es admin-only por
// storage.rules; ver el archivo, que NO se despliega solo.

import { storage, db } from '../firebase.js';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { DOC_PRIVADO, COL_PRODUCTS } from './productosPrivados.js';
import { rutaArchivo, nombreSeguro, validarArchivo } from './archivosDiseno.js';

/**
 * Sube un archivo con reporte de progreso.
 *
 * Usa uploadBytesResumable y no uploadBytes porque estos archivos pesan
 * varios MB: sin progreso, el formulario parece colgado.
 *
 * @param {Function} onProgress recibe 0-100
 * @returns {Promise<{nombre, path, tamanio, subidoAt}>} metadata para guardar
 */
export async function subirArchivoDiseno(productId, file, yaExistentes = [], onProgress) {
  const { valido, error } = validarArchivo(file);
  if (!valido) throw new Error(error);
  if (!productId) throw new Error("Guardá el producto antes de subirle archivos.");

  const nombre = nombreSeguro(file.name, yaExistentes);
  const path = rutaArchivo(productId, nombre);
  const tarea = uploadBytesResumable(ref(storage, path), file, {
    // Sin esto el navegador puede servirlos como texto al descargarlos.
    contentType: "application/octet-stream",
  });

  await new Promise((resolver, rechazar) => {
    tarea.on("state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      rechazar,
      resolver
    );
  });

  return {
    nombre,
    path,
    tamanio: file.size,
    // Date del cliente y no serverTimestamp: esto va DENTRO de un array, y
    // Firestore no resuelve sentinels anidados en arrays.
    subidoAt: new Date().toISOString(),
  };
}

/**
 * URL de descarga, resuelta en el momento del clic.
 *
 * A propósito NO se guarda en Firestore: getDownloadURL devuelve una URL con
 * token que funciona para cualquiera que la tenga, sin pasar por las reglas
 * de Storage. Persistirla sería dejar un link público permanente de un
 * archivo que tiene que ser privado. Pidiéndola al vuelo, la lectura pasa por
 * las reglas y solo un admin la obtiene.
 */
export const urlDeDescarga = (path) => getDownloadURL(ref(storage, path));

/** Borra el binario de Storage. El objeto ya borrado no se considera error. */
export async function eliminarArchivoDiseno(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (err?.code !== "storage/object-not-found") throw err;
  }
}

/**
 * Persiste la lista de archivos en products/{id}/privado/data sin tocar el
 * resto del documento.
 *
 * Se escribe apenas termina cada subida o borrado, no al guardar el
 * formulario: el binario ya está en Storage en ese momento, y si el usuario
 * cancelara el form quedaría un archivo huérfano que nadie ve ni puede borrar.
 */
export async function guardarArchivosPrivados(productId, archivos, coleccion = COL_PRODUCTS) {
  await setDoc(
    doc(db, coleccion, productId, "privado", DOC_PRIVADO),
    { archivos, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
