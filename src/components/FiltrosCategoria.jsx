import { useState, useMemo } from 'react';
import {
  TODAS, CAT_PERSONALIZADOS, subcategoriasDisponibles, coincideCategoria,
} from '../lib/filtros.js';

// ─── Filtros de categoría en cascada ─────────────────────────────────
// Los usan el tab Productos y la tabla de Rentabilidad del tab Costos.
// Antes esto vivía inline dentro de ProductsTab; se extrajo al agregar el
// mismo filtro en Rentabilidad, para no terminar con dos implementaciones
// que se corrigen por separado.

const labelStyle = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

const selectStyle = {
  width: "100%", padding: "12px 14px", background: "var(--bg)",
  border: "1px solid var(--line)",
  fontSize: 14, color: "var(--text)", borderRadius: 4, outline: "none",
};

/**
 * Estado de los dos selectores, con la cascada resuelta.
 *
 * Al cambiar de categoría la subcategoría vuelve a "Todas": la anterior puede
 * no existir dentro de la nueva, y dejarla puesta daría una tabla vacía sin
 * que se entienda por qué.
 *
 * @returns {{filtroCat, filtroSub, setFiltroSub, elegirCat, limpiar,
 *            subsDisponibles: string[], hayFiltro: boolean,
 *            coincide: (fila) => boolean}}
 */
export function useFiltrosCategoria(categories = []) {
  const [filtroCat, setFiltroCat] = useState(TODAS);
  const [filtroSub, setFiltroSub] = useState(TODAS);

  const subsDisponibles = useMemo(
    () => subcategoriasDisponibles(categories, filtroCat),
    [categories, filtroCat]
  );

  const elegirCat = (catId) => {
    setFiltroCat(catId);
    setFiltroSub(TODAS);
  };

  const limpiar = () => { setFiltroCat(TODAS); setFiltroSub(TODAS); };

  return {
    filtroCat, filtroSub, setFiltroSub, elegirCat, limpiar, subsDisponibles,
    hayFiltro: filtroCat !== TODAS || filtroSub !== TODAS,
    coincide: (fila) => coincideCategoria(fila, filtroCat, filtroSub),
  };
}

/**
 * Los dos desplegables. No son escribibles: las opciones salen de las
 * categorías cargadas.
 *
 * @param {Array<{value, label}>} opcionesExtra  opciones que no son una
 *   categoría real (Rentabilidad agrega "Personalizados"). Deshabilitan la
 *   subcategoría, porque no tienen.
 */
export function FiltrosCategoria({ filtros, categories = [], opcionesExtra = [] }) {
  const { filtroCat, filtroSub, setFiltroSub, elegirCat, subsDisponibles } = filtros;
  const sinSubs = subsDisponibles.length === 0;

  return (
    <>
      <div>
        <div style={labelStyle}>Categoría</div>
        <select value={filtroCat} onChange={e => elegirCat(e.target.value)} style={selectStyle}>
          <option value={TODAS}>Todas</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          {opcionesExtra.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <div style={labelStyle}>Subcategoría</div>
        <select
          value={filtroSub}
          onChange={e => setFiltroSub(e.target.value)}
          disabled={sinSubs}
          style={{ ...selectStyle, opacity: sinSubs ? 0.5 : 1 }}
          title={filtroCat === CAT_PERSONALIZADOS
            ? "Los personalizados no tienen subcategoría"
            : undefined}
        >
          <option value={TODAS}>Todas</option>
          {subsDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </>
  );
}
