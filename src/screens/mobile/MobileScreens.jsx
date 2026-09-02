import { useState, useEffect, useRef } from 'react';
import { PRODUCTS as FALLBACK_PRODUCTS, CATEGORIES as FALLBACK_CATEGORIES, CONTACT } from '../../data.js';
import { TKButton, TKLogo, TKPill, Icon, fmtARS } from '../../components/UI.jsx';

// ========== Mobile Home ==========
export function MobileHome({ go, addToCart, products = FALLBACK_PRODUCTS, categories = FALLBACK_CATEGORIES }) {
  const bestSellers = products.filter(p => p.tag === "Best seller" || p.tag === "Premium").slice(0, 5);
  const [carIdx, setCarIdx] = useState(0);
  const carRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setCarIdx(i => (i + 1) % bestSellers.length), 4500);
    return () => clearInterval(t);
  }, [bestSellers.length]);

  useEffect(() => {
    if (carRef.current) {
      const child = carRef.current.children[carIdx];
      if (child) carRef.current.scrollTo({ left: child.offsetLeft - 16, behavior: "smooth" });
    }
  }, [carIdx]);

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Hero compacto */}
      <section style={{ padding: "20px 0 28px" }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>
          Impresión 3D — Argentina
        </div>
        <h1 style={{ fontWeight: 700, fontSize: 44, lineHeight: 0.95, letterSpacing: -1.5, margin: 0, color: "var(--text)" }}>
          Precisión<br/><span style={{ color: "var(--accent)" }}>cálida.</span>
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 14, lineHeight: 1.5 }}>
          Objetos diseñados e impresos en Buenos Aires, para usar todos los días.
        </p>
        <div style={{ marginTop: 20 }}>
          <TKButton size="md" full onClick={() => go("catalogo")}>
            Ver catálogo <Icon.arrow/>
          </TKButton>
        </div>
      </section>

      {/* Carousel de más vendidos */}
      <section style={{ padding: "24px 0 8px", borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
              01 — Destacados
            </div>
            <h2 style={{ fontWeight: 700, fontSize: 26, margin: 0, letterSpacing: -0.5 }}>Más vendidos</h2>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setCarIdx(i => (i - 1 + bestSellers.length) % bestSellers.length)} style={carBtn}>
              <Icon.back size={14}/>
            </button>
            <button onClick={() => setCarIdx(i => (i + 1) % bestSellers.length)} style={carBtn}>
              <Icon.arrow size={14}/>
            </button>
          </div>
        </div>

        <div ref={carRef} style={{
          display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory",
          scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px 4px",
        }} onScroll={(e) => {
          const w = e.target.clientWidth - 32;
          const i = Math.round(e.target.scrollLeft / (w * 0.85 + 14));
          if (i !== carIdx && i < bestSellers.length) setCarIdx(i);
        }}>
          {bestSellers.map((p) => (
            <div key={p.id} onClick={() => go("detalle", { id: p.id })} style={{
              flex: "0 0 85%", scrollSnapAlign: "start", cursor: "pointer",
            }}>
              <div style={{ position: "relative", aspectRatio: "4/5", background: "var(--beige)", overflow: "hidden" }}>
                <img src={p.img} alt={p.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }}/>
                {p.tag && (
                  <div style={{ position: "absolute", top: 12, left: 12 }}>
                    <TKPill variant={p.tag === "Premium" ? "dark" : "default"}>{p.tag}</TKPill>
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.5)", letterSpacing: -0.3, lineHeight: 1.1 }}>
                      {p.name}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.5)", marginTop: 4 }}>
                      {fmtARS(p.price)}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} style={{
                    width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "#fff",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,.25)",
                  }}>
                    <Icon.ig size={18}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16 }}>
          {bestSellers.map((_, i) => (
            <button key={i} onClick={() => setCarIdx(i)} style={{
              width: carIdx === i ? 20 : 6, height: 6, borderRadius: 3,
              background: carIdx === i ? "var(--accent)" : "var(--line-strong)",
              border: "none", cursor: "pointer", padding: 0, transition: "all .25s",
            }}/>
          ))}
        </div>
      </section>

      {/* Categorías */}
      <section style={{ padding: "32px 0 20px", borderTop: "1px solid var(--line)", marginTop: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
          02 — Categorías
        </div>
        <h2 style={{ fontWeight: 700, fontSize: 26, margin: "0 0 16px", letterSpacing: -0.5 }}>Explorá</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {categories.map((c, i) => {
            const sampleImg = products.find(p => p.cat === c.id)?.img;
            const count = products.filter(p => p.cat === c.id).length;
            return (
              <div key={c.id} onClick={() => go("categoria", { cat: c.id })} style={{
                position: "relative", height: 120, cursor: "pointer", overflow: "hidden",
                background: i === 1 ? "var(--beige)" : "var(--bg-alt)",
              }}>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "50%" }}>
                  <img src={sampleImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply", opacity: 0.9 }}/>
                </div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, var(--bg-alt) 40%, transparent 80%)" }}/>
                <div style={{ position: "relative", height: "100%", padding: 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1.5 }}>0{i+1} · {count} productos</div>
                  <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: -0.5, color: "var(--text)", marginTop: 4 }}>
                    {c.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent)", fontSize: 12, fontWeight: 600, marginTop: 8 }}>
                    Ver <Icon.arrow size={12}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Valores */}
      <section style={{ padding: "28px 0", borderTop: "1px solid var(--line)", marginTop: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { icon: <Icon.truck size={22}/>, l: "Envío 48h", s: "Todo el país" },
            { icon: <Icon.shield size={22}/>, l: "Garantía", s: "30 días" },
            { icon: <Icon.spark size={22}/>, l: "Personalizable", s: "Color + texto" },
          ].map((v, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ color: "var(--accent)", marginBottom: 8, display: "flex", justifyContent: "center" }}>{v.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{v.l}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{v.s}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const carBtn = {
  width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--line-strong)",
  background: "var(--bg)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)",
};

// ========== Mobile Catalog hub ==========
export function MobileCatalogoHub({ go, products = FALLBACK_PRODUCTS, categories = FALLBACK_CATEGORIES }) {
  return (
    <div style={{ padding: "16px 0 80px" }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
        Catálogo
      </div>
      <h1 style={{ fontWeight: 700, fontSize: 36, letterSpacing: -1, margin: "0 0 6px" }}>
        Elegí una<br/>categoría.
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>
        {products.length} productos · {categories.length} categorías
      </p>

      <div onClick={() => go("buscador")} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        border: "1px solid var(--line)", background: "var(--bg-alt)",
        color: "var(--muted)", fontSize: 14, marginBottom: 24, cursor: "pointer",
      }}>
        <Icon.search size={18}/> Buscar producto...
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {categories.map((c, i) => {
          const prods = products.filter(p => p.cat === c.id);
          const previews = prods.slice(0, 3);
          return (
            <div key={c.id} onClick={() => go("categoria", { cat: c.id })} style={{
              border: "1px solid var(--line)", padding: 20, cursor: "pointer", background: "var(--bg)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1.5 }}>0{i+1}</div>
                  <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: -0.5, marginTop: 2, color: "var(--text)" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {prods.length} productos
                  </div>
                </div>
                <div style={{ color: "var(--accent)" }}><Icon.arrow size={18}/></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
                {previews.map(p => (
                  <div key={p.id} style={{ aspectRatio: "1/1", background: "var(--beige)", overflow: "hidden" }}>
                    <img src={p.img} style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }}/>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.subs.map(s => (
                  <span key={s} style={{
                    fontSize: 11, padding: "4px 10px", border: "1px solid var(--line-strong)", borderRadius: 999, color: "var(--text)",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== Mobile Category ==========
export function MobileCategoria({ go, addToCart, cat, products = FALLBACK_PRODUCTS, categories = FALLBACK_CATEGORIES }) {
  const category = categories.find(c => c.id === cat) || categories[0];
  const [sub, setSub] = useState(null);
  const [sort, setSort] = useState("relevance");

  let list = products.filter(p => p.cat === category.id);
  if (sub) list = list.filter(p => p.sub === sub);
  if (sort === "price-asc") list = [...list].sort((a,b) => a.price - b.price);
  if (sort === "price-desc") list = [...list].sort((a,b) => b.price - a.price);

  return (
    <div style={{ padding: "16px 0 80px" }}>
      <button onClick={() => go("catalogo")} style={{
        background: "none", border: "none", padding: 0, color: "var(--muted)", fontSize: 12,
        display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 14,
      }}>
        <Icon.back size={14}/> Catálogo
      </button>

      <h1 style={{ fontWeight: 700, fontSize: 38, letterSpacing: -1, margin: "0 0 6px" }}>
        {category.name}
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 20 }}>
        {list.length} de {products.filter(p => p.cat === category.id).length} productos
      </p>

      <div style={{
        display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none",
        margin: "0 -16px", padding: "0 16px 4px", marginBottom: 16,
      }}>
        <button onClick={() => setSub(null)} style={mobChip(!sub)}>Todo</button>
        {category.subs.map(s => (
          <button key={s} onClick={() => setSub(s)} style={mobChip(sub === s)}>{s}</button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {list.length} resultados
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{
          padding: "6px 10px", border: "1px solid var(--line-strong)", background: "var(--bg)",
          fontSize: 12, color: "var(--text)",
        }}>
          <option value="relevance">Relevancia</option>
          <option value="price-asc">Precio ↑</option>
          <option value="price-desc">Precio ↓</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {list.map(p => (
          <div key={p.id} onClick={() => go("detalle", { id: p.id })} style={{ cursor: "pointer" }}>
            <div style={{ position: "relative", aspectRatio: "1/1", background: "var(--beige)", overflow: "hidden", marginBottom: 8 }}>
              <img src={p.img} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }}/>
              {p.tag && <div style={{ position: "absolute", top: 8, left: 8 }}><TKPill variant={p.tag === "Premium" ? "dark" : "default"}>{p.tag}</TKPill></div>}
              <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} style={{
                position: "absolute", bottom: 6, right: 6, width: 32, height: 32, borderRadius: "50%",
                background: "var(--anchor)", color: "#fff", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon.ig size={14}/>
              </button>
            </div>
            <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
              {p.sub}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.15, letterSpacing: -0.2 }}>
              {p.name}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", marginTop: 4 }}>
              {fmtARS(p.price)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const mobChip = (active) => ({
  padding: "7px 14px", whiteSpace: "nowrap",
  background: active ? "var(--anchor)" : "transparent",
  color: active ? "#fff" : "var(--text)",
  border: `1px solid ${active ? "var(--anchor)" : "var(--line-strong)"}`,
  fontSize: 12, fontWeight: 600,
  cursor: "pointer", borderRadius: 999,
});

// ========== Mobile Buscador ==========
export function MobileBuscador({ go, addToCart, products = FALLBACK_PRODUCTS }) {
  const [q, setQ] = useState("");
  const list = q ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.sub.toLowerCase().includes(q.toLowerCase())) : [];
  const trending = ["Lámpara", "Organizador", "Soporte", "Maceta"];

  return (
    <div style={{ padding: "16px 0 80px" }}>
      <button onClick={() => go("catalogo")} style={{
        background: "none", border: "none", padding: 0, color: "var(--muted)", fontSize: 12,
        display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 14,
      }}>
        <Icon.back size={14}/> Volver
      </button>

      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        border: "1px solid var(--accent)", background: "var(--bg)", marginBottom: 24,
      }}>
        <Icon.search size={18}/>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto..." style={{
          flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--text)",
        }}/>
        {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}><Icon.close size={16}/></button>}
      </div>

      {!q && (
        <>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
            Búsquedas populares
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {trending.map(t => (
              <button key={t} onClick={() => setQ(t)} style={mobChip(false)}>{t}</button>
            ))}
          </div>
        </>
      )}

      {q && (
        <>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
            {list.length} resultados para "{q}"
          </div>
          <div>
            {list.map(p => (
              <div key={p.id} onClick={() => go("detalle", { id: p.id })} style={{
                display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 12, padding: "12px 0",
                borderBottom: "1px solid var(--line)", alignItems: "center", cursor: "pointer",
              }}>
                <div style={{ width: 72, height: 72, background: "var(--beige)", overflow: "hidden" }}>
                  <img src={p.img} style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }}/>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{p.sub}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2 }}>{p.name}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", marginTop: 2 }}>{fmtARS(p.price)}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} style={{
                  width: 36, height: 36, borderRadius: "50%", background: "var(--anchor)", color: "#fff",
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon.ig size={16}/>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ========== Mobile Tab Bar ==========
export function MobileTabBar({ route, go, user }) {
  const tabs = [
    { id: "home", label: "Inicio", icon: <Icon.home size={22}/> },
    { id: "catalogo", label: "Catálogo", icon: <Icon.grid size={22}/> },
    { id: "buscador", label: "Buscar", icon: <Icon.search size={22}/> },
    { id: "instagram", label: "Instagram", icon: <Icon.ig size={22}/>, external: CONTACT.instagramUrl },
    { id: user ? "admin" : "auth", label: user ? "Cuenta" : "Ingresar", icon: <Icon.user size={22}/> },
  ];
  const activeId = route === "categoria" ? "catalogo" : route;
  return (
    <div style={{
      position: "sticky", bottom: 0, left: 0, right: 0,
      background: "var(--bg)", borderTop: "1px solid var(--line)",
      display: "flex", justifyContent: "space-around", padding: "8px 4px 10px",
      margin: "24px -16px 0",
      zIndex: 40,
    }}>
      {tabs.map(t => {
        const active = activeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => t.external ? window.open(t.external, "_blank", "noopener,noreferrer") : go(t.id)}
            style={{
              flex: 1, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              color: active ? "var(--accent)" : "var(--muted)",
              fontSize: 10, fontWeight: 600,
              padding: "6px 4px", position: "relative",
            }}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ========== Mobile Header ==========
export function MobileHeader({ route, go, user }) {
  const title = {
    home: null, catalogo: null, buscador: null,
    categoria: null, detalle: null, auth: null, admin: "Backoffice", about: "Sobre nosotros",
  }[route];

  const iconBtnM = {
    background: "none", border: "none", padding: 8, color: "var(--text)",
    cursor: "pointer", display: "flex", alignItems: "center",
  };

  if (route === "home") {
    return (
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
        <TKLogo size={20}/>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => go("buscador")} style={iconBtnM}><Icon.search size={20}/></button>
          <button onClick={() => go(user ? "admin" : "auth")} style={iconBtnM}><Icon.user size={20}/></button>
        </div>
      </header>
    );
  }

  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
      <TKLogo size={18}/>
      {title && <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3 }}>{title}</div>}
      <div style={{ width: 24 }}/>
    </header>
  );
}
