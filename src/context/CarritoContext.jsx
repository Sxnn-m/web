import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  agregarLinea, cambiarCantidad, quitarLinea, totalCarrito, unidadesTotales,
  normalizarCarrito,
} from '../lib/carrito.js';

// ─── Estado del carrito ──────────────────────────────────────────────
// Vive solo en el navegador del cliente. Se persiste en localStorage para
// que sobreviva a un F5 o a navegar entre pantallas, pero NADA de esto
// llega a Firestore: es la intención de compra que el cliente arma antes
// de escribir por Instagram, no un pedido.

const CLAVE_STORAGE = "tkprints.carrito.v1";

const CarritoContext = createContext(null);

/** Lee el carrito guardado. Cualquier problema devuelve uno vacío. */
function leerGuardado() {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    return crudo ? normalizarCarrito(JSON.parse(crudo)) : [];
  } catch {
    // Modo incógnito, storage deshabilitado o JSON corrupto: se arranca
    // vacío en vez de romper la app entera.
    return [];
  }
}

export function CarritoProvider({ children }) {
  const [lineas, setLineas] = useState(leerGuardado);
  const [abierto, setAbierto] = useState(false);
  // Sube de 0 en cada alta: lo usa el ícono del header para destacarse.
  const [pulso, setPulso] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(lineas));
    } catch { /* sin storage el carrito igual funciona en memoria */ }
  }, [lineas]);

  const agregar = useCallback((producto, config) => {
    setLineas(actual => agregarLinea(actual, producto, config));
    setPulso(n => n + 1);
  }, []);

  const cambiar = useCallback((clave, cantidad) => {
    setLineas(actual => cambiarCantidad(actual, clave, cantidad));
  }, []);

  const quitar = useCallback((clave) => {
    setLineas(actual => quitarLinea(actual, clave));
  }, []);

  const vaciar = useCallback(() => setLineas([]), []);

  const valor = useMemo(() => ({
    lineas,
    total: totalCarrito(lineas),
    unidades: unidadesTotales(lineas),
    agregar, cambiar, quitar, vaciar,
    abierto, abrir: () => setAbierto(true), cerrar: () => setAbierto(false),
    pulso,
  }), [lineas, abierto, pulso, agregar, cambiar, quitar, vaciar]);

  return <CarritoContext.Provider value={valor}>{children}</CarritoContext.Provider>;
}

export function useCarrito() {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error("useCarrito necesita estar dentro de <CarritoProvider>");
  return ctx;
}
