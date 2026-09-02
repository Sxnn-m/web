import { useState, useMemo } from 'react';
import { CATEGORIES as FALLBACK_CATEGORIES } from '../data.js';
import { TKInput, Icon, ProductCard, fmtARS } from '../components/UI.jsx';

export function CatalogoScreen({ go, addToCart, initialCat, catalogoLayout = "grid", products = [], categories = FALLBACK_CATEGORIES }) {
  const [cat, setCat] = useState(initialCat || "all");
  const [sub, setSub] = useState(null);
  const [sort, setSort] = useState("relevance");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState(catalogoLayout);

  const maxPossiblePrice = useMemo(() => {
    const visible = products.filter(p => p.visible !== false);
    if (visible.length === 0) return 20000;
    const max = Math.max(...visible.map(p => p.price || 0));
    return max > 0 ? max : 20000;
  }, [products]);

  const [userPriceMax, setUserPriceMax] = useState(null);
  const priceMax = userPriceMax !== null ? userPriceMax : maxPossiblePrice;

  const filtered = useMemo(() => {
    let r = products.filter(p => p.visible !== false); // hide invisible products
    if (cat !== "all") r = r.filter(p => p.cat === cat);
    if (sub) r = r.filter(p => p.sub === sub);
    if (query) r = r.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
    r = r.filter(p => p.price <= priceMax);
    if (sort === "price-asc") r.sort((a,b) => a.price - b.price);
    if (sort === "price-desc") r.sort((a,b) => b.price - a.price);
    if (sort === "name") r.sort((a,b) => a.name.localeCompare(b.name));
    return r;
  }, [cat, sub, sort, query, priceMax, products]);

  const currentCat = categories.find(c => c.id === cat);

  return (
    <div style={{ padding: "40px 0 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
          Catálogo {cat !== "all" && "/ " + currentCat?.name}
        </div>
        <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", letterSpacing: -1.5, margin: 0, color: "var(--text)" }}>
          {cat === "all" ? "Todos los productos" : currentCat?.name}
        </h1>
      </div>

      {/* Tabs de categorías */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--line)", marginBottom: 24, paddingBottom: 0 }}>
        {[{ id: "all", name: "Todo" }, ...categories].map(c => (
          <button key={c.id} onClick={() => { setCat(c.id); setSub(null); }} style={{
            padding: "14px 18px", background: "transparent", border: "none",
            borderBottom: cat === c.id ? "2px solid var(--accent)" : "2px solid transparent",
            color: cat === c.id ? "var(--text)" : "var(--muted)",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
            marginBottom: -1,
          }}>{c.name}</button>
        ))}
      </div>

      {/* Subcategorías */}
      {currentCat && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          <button onClick={() => setSub(null)} style={subChipStyle(!sub)}>Todas</button>
          {currentCat.subs.map(s => (
            <button key={s} onClick={() => setSub(s)} style={subChipStyle(sub === s)}>{s}</button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 40 }} className="cat-layout">
        {/* Sidebar filtros */}
        <aside className="cat-sidebar">
          <div style={{ marginBottom: 28 }}>
            <TKInput label="Buscar" icon={<Icon.search size={16}/>} placeholder="Ej: lámpara" value={query} onChange={(e) => setQuery(e.target.value)}/>
          </div>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              Precio máx.
            </div>
            <input type="range" min={0} max={maxPossiblePrice} step={500} value={priceMax} onChange={(e) => setUserPriceMax(+e.target.value)} style={{ width: "100%", accentColor: "var(--accent)" }}/>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              <span>$0</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{fmtARS(priceMax)}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              Ordenar
            </div>
            {[
              { id: "relevance", label: "Relevancia" },
              { id: "price-asc", label: "Precio: menor a mayor" },
              { id: "price-desc", label: "Precio: mayor a menor" },
              { id: "name", label: "Nombre A–Z" },
            ].map(o => (
              <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer", fontSize: 13 }}>
                <input type="radio" name="sort" checked={sort === o.id} onChange={() => setSort(o.id)} style={{ accentColor: "var(--accent)" }}/>
                {o.label}
              </label>
            ))}
          </div>
        </aside>

        {/* Resultados */}
        <main>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {filtered.length} resultados
            </div>
            <div style={{ display: "flex", gap: 4, border: "1px solid var(--line)", padding: 3 }}>
              <button onClick={() => setLayout("grid")} style={layoutBtn(layout === "grid")}><Icon.grid/></button>
              <button onClick={() => setLayout("list")} style={layoutBtn(layout === "list")}><Icon.list/></button>
            </div>
          </div>

          {layout === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 28 }}>
              {filtered.map(p => (
                <ProductCard key={p.id} product={p} onClick={() => go("detalle", { id: p.id })} onAdd={addToCart}/>
              ))}
            </div>
          ) : (
            <div>
              {filtered.map(p => (
                <ProductCard key={p.id} product={p} layout="list" onClick={() => go("detalle", { id: p.id })} onAdd={addToCart}/>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const subChipStyle = (active) => ({
  padding: "6px 14px",
  background: active ? "var(--anchor)" : "transparent",
  color: active ? "#fff" : "var(--text)",
  border: `1px solid ${active ? "var(--anchor)" : "var(--line-strong)"}`,
  fontSize: 12, fontWeight: 600,
  cursor: "pointer", borderRadius: 999,
});

const layoutBtn = (active) => ({
  padding: "8px 10px",
  background: active ? "var(--anchor)" : "transparent",
  color: active ? "#fff" : "var(--muted)",
  border: "none", cursor: "pointer", display: "flex", alignItems: "center",
});
