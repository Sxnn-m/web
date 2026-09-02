import { useState, useMemo } from 'react';
import { CATEGORIES as FALLBACK_CATEGORIES } from '../data.js';
import { TKButton, TKPill, Icon, ProductImage, ProductCard } from '../components/UI.jsx';

export function HomeScreen({ go, addToCart, homeVariant = "A", products = [], categories = FALLBACK_CATEGORIES }) {
  const featured = useMemo(() => {
    const bestSellers = products.filter(p => p.tag === "Best seller");
    if (bestSellers.length >= 3) return bestSellers.slice(0, 3);
    // Fill with random products if not enough best sellers
    const ids = new Set(bestSellers.map(p => p.id));
    const others = products.filter(p => !ids.has(p.id));
    return [...bestSellers, ...others].slice(0, 3);
  }, [products]);

  if (homeVariant === "B") return <HomeB go={go} addToCart={addToCart} products={products}/>;
  if (homeVariant === "C") return <HomeC go={go} addToCart={addToCart} products={products}/>;

  // Variante A: minimal editorial con hero tipográfico grande
  return (
    <div>
      {/* Hero */}
      <section style={{ padding: "80px 0 60px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <span style={{ width: 32, height: 1, background: "var(--accent)" }}/>
          <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)" }}>
            Impresión 3D · Argentina · Desde 2023
          </span>
        </div>
        <h1 style={{
          fontSize: "clamp(48px, 9vw, 128px)",
          lineHeight: 0.92,
          letterSpacing: -2,
          margin: 0,
          color: "var(--text)",
          textWrap: "balance",
        }}>
          Diseño que se<br/>
          <span style={{ color: "var(--accent)" }}>imprime.</span><br/>
          Soluciones que<br/>funcionan.
        </h1>
        <div style={{ marginTop: 40, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <TKButton size="lg" onClick={() => go("catalogo")}>
            Ver catálogo <Icon.arrow/>
          </TKButton>
          <TKButton size="lg" variant="outline" onClick={() => go("about")}>
            Sobre TKPrints
          </TKButton>
        </div>
      </section>

      {/* Categorías */}
      <section style={{ padding: "60px 0", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 36, flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
              01 — Categorías
            </div>
            <h2 style={{ fontSize: "clamp(32px, 5vw, 56px)", margin: 0, letterSpacing: -1, color: "var(--text)" }}>
              Ideas hechas<br/>objeto.
            </h2>
          </div>
          <TKButton variant="ghost" onClick={() => go("catalogo")}>
            Ver todos <Icon.arrow/>
          </TKButton>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {categories.map((c, i) => {
            const prods = products.filter(p => p.cat === c.id);
            const bgColors = ["var(--bg-alt)", "var(--beige)", "#f2f5f7", "#fdfaf6", "#f5f7f2"];
            return (
              <div key={c.id} onClick={() => go("catalogo", { cat: c.id })} style={{
                cursor: "pointer",
                background: bgColors[i % bgColors.length],
                padding: 28,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 340,
                position: "relative",
                overflow: "hidden",
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1.5 }}>
                    {i < 9 ? `0${i+1}` : i+1}
                  </div>
                  <h3 style={{ fontSize: c.name.length > 18 ? 26 : 36, letterSpacing: -0.5, margin: "16px 0 0", color: "var(--text)", lineHeight: 1.1 }}>
                    {c.name}
                  </h3>
                  <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {c.subs.map(s => (
                      <span key={s} style={{ fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--line-strong)", paddingBottom: 2 }}>{s}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 24 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {prods.length} productos
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
                    Explorar <Icon.arrow/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Destacados — Carrusel */}
      <BestSellersCarousel featured={featured} go={go} addToCart={addToCart} />

      {/* Proceso / valores */}
      <section style={{ padding: "60px 0", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28 }}>
          {[
            { icon: <Icon.spark/>, title: "Diseño propio", text: "Piezas desarrolladas en casa. Iteramos prototipos hasta afinar cada detalle." },
            { icon: <Icon.layers/>, title: "Impresión FDM & Resina", text: "Usamos PLA, PETG, TPU y resina según la función y acabado de cada pieza." },
            { icon: <Icon.shield/>, title: "Control de calidad", text: "Cada producto pasa por revisión manual antes de salir al envío." },
            { icon: <Icon.truck/>, title: "Envíos a todo el país", text: "Despachamos a todo Argentina. Retiro por punto de encuentro en CABA." },
          ].map((v, i) => (
            <div key={i}>
              <div style={{ color: "var(--accent)", marginBottom: 16 }}>{v.icon}</div>
              <div style={{ fontSize: 18, letterSpacing: -0.2, color: "var(--text)", marginBottom: 8 }}>
                {v.title}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{v.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section style={{ background: "var(--anchor)", margin: "0 -24px", padding: "80px 24px" }}>
        <div style={{ maxWidth: 800 }}>
          <h2 style={{ fontSize: "clamp(36px, 6vw, 72px)", letterSpacing: -1, margin: 0, color: "#fff", lineHeight: 0.95 }}>
            ¿Tenés una idea?<br/>
            <span style={{ color: "var(--beige)" }}>La imprimimos.</span>
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,.7)", marginTop: 20, maxWidth: 520 }}>
            Hacemos piezas personalizadas bajo pedido. Escribinos tu idea y te cotizamos.
          </p>
          <div style={{ marginTop: 28 }}>
            <TKButton variant="beige" size="lg" onClick={() => go("about")}>
              Contactar <Icon.arrow/>
            </TKButton>
          </div>
        </div>
      </section>
    </div>
  );
}

function BestSellersCarousel({ featured, go, addToCart }) {
  const [idx, setIdx] = useState(0);
  const total = featured.length;

  if (total === 0) return null;

  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  return (
    <section style={{ padding: "60px 0", borderBottom: "1px solid var(--line)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
            02 — Best sellers
          </div>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 56px)", margin: 0, letterSpacing: -1, color: "var(--text)" }}>
            Los más pedidos.
          </h2>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          {idx + 1} / {total}
        </div>
      </div>

      {/* Carousel track */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div style={{
          display: "flex",
          transform: `translateX(-${idx * 100}%)`,
          transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          {featured.map((p, i) => (
            <div key={p.id} style={{
              flex: "0 0 100%",
              display: "grid",
              gridTemplateColumns: "280px 1fr",
              gap: 48,
              alignItems: "center",
            }} className="carousel-slide-grid">
              {/* Product image side */}
              <div style={{ position: "relative", overflow: "hidden" }}
                onClick={() => go("detalle", { id: p.id })}
                onMouseEnter={e => { const img = e.currentTarget.querySelector('.pcard-img'); if(img) img.style.transform = "scale(1.04)"; }}
                onMouseLeave={e => { const img = e.currentTarget.querySelector('.pcard-img'); if(img) img.style.transform = "scale(1)"; }}
                style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
              >
                <div className="pcard-img" style={{ transition: "transform 0.5s ease" }}>
                  <ProductImage src={p.img} alt={p.name} ratio="1 / 1" />
                </div>
                {p.tag && (
                  <div style={{ position: "absolute", top: 16, left: 16 }}>
                    <TKPill variant={p.tag === "Premium" ? "dark" : "default"}>{p.tag}</TKPill>
                  </div>
                )}
              </div>

              {/* Product info side */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
                    {p.sub}
                  </div>
                  <div style={{ fontSize: "clamp(28px, 3.5vw, 44px)", letterSpacing: -0.8, lineHeight: 1.05, color: "var(--text)", marginBottom: 16 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, maxWidth: 360 }}>
                    {p.desc}
                  </div>
                </div>

                <div style={{ fontSize: 32, color: "var(--accent)", letterSpacing: -0.5 }}>
                  {`$ ${Math.round(p.price).toLocaleString("es-AR")}`}
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <TKButton onClick={() => go("detalle", { id: p.id })}>
                    Ver producto <Icon.arrow/>
                  </TKButton>
                  <TKButton variant="outline" onClick={() => addToCart(p)}>
                    <Icon.ig size={14}/> Consultar por Instagram
                  </TKButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation: arrows + dots */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 36 }}>
        {/* Left arrow */}
        <button
          onClick={prev}
          aria-label="Anterior"
          style={{
            width: 44, height: 44,
            border: "1px solid var(--line-strong)",
            background: "var(--bg)",
            color: "var(--text)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s",
            borderRadius: 2,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--anchor)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--anchor)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--line-strong)"; }}
        >
          <Icon.back size={16}/>
        </button>

        {/* Dot indicators */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Ir a producto ${i + 1}`}
              style={{
                width: idx === i ? 28 : 8,
                height: 8,
                borderRadius: 4,
                background: idx === i ? "var(--accent)" : "var(--line-strong)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={next}
          aria-label="Siguiente"
          style={{
            width: 44, height: 44,
            border: "1px solid var(--line-strong)",
            background: "var(--bg)",
            color: "var(--text)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s",
            borderRadius: 2,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--anchor)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--anchor)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--line-strong)"; }}
        >
          <Icon.arrow size={16}/>
        </button>
      </div>
    </section>
  );
}

function HomeB({ go, addToCart, products = [] }) {
  const featured = products.filter(p => p.tag).slice(0, 4);
  return (
    <div>
      <section style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        minHeight: 520,
        borderBottom: "1px solid var(--line)",
        margin: "0 -24px",
      }} className="home-b-hero">
        <div style={{ padding: "80px 24px 80px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <TKPill>Nueva colección · Otoño 26</TKPill>
          <h1 style={{
            fontSize: "clamp(40px, 6vw, 88px)", lineHeight: 0.95, letterSpacing: -1.5,
            margin: "24px 0", color: "var(--text)",
          }}>
            Impresión 3D<br/>con carácter.
          </h1>
          <p style={{ fontSize: 16, color: "var(--muted)", maxWidth: 420, lineHeight: 1.5 }}>
            Lámparas, organizadores y gadgets diseñados y producidos en Buenos Aires.
            Cada pieza, pensada para durar.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <TKButton size="lg" onClick={() => go("catalogo")}>Ver productos</TKButton>
            <TKButton size="lg" variant="outline" onClick={() => go("catalogo", { cat: "lamparas" })}>Ver lámparas</TKButton>
          </div>
        </div>
        <div style={{ position: "relative", overflow: "hidden", background: "var(--beige)" }}>
          <img src={PRODUCTS[12].img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }}/>
          <div style={{ position: "absolute", bottom: 20, left: 20, background: "var(--bg)", padding: "10px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: 1, color: "var(--muted)" }}>DESTACADO</div>
            <div style={{ fontSize: 14 }}>Lámpara Origami</div>
          </div>
        </div>
      </section>
      <section style={{ padding: "60px 0" }}>
        <h2 style={{ fontSize: 48, letterSpacing: -1, margin: "0 0 32px" }}>Lo más buscado</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28 }}>
          {featured.map(p => <ProductCard key={p.id} product={p} onClick={() => go("detalle", { id: p.id })} onAdd={addToCart}/>)}
        </div>
      </section>
    </div>
  );
}

function HomeC({ go, addToCart, products = [] }) {
  const picks = products.length >= 15
    ? [products[12], products[0], products[6], products[14]].filter(Boolean)
    : products.slice(0, 4);
  return (
    <div>
      {/* Ticker */}
      <div style={{ margin: "0 -24px", padding: "14px 24px", background: "var(--accent)", color: "#fff", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 48, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", whiteSpace: "nowrap", animation: "tk-ticker 30s linear infinite" }}>
          {Array(4).fill("Envío gratis +$25.000 · Personalización con texto · Despacho en 48h · PLA · PETG · Resina ·").map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      {/* Hero grid */}
      <section style={{ padding: "60px 0", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 32 }} className="home-c-grid">
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 20 }}>
              Issue 04 / Abril 2026
            </div>
            <h1 style={{ fontSize: "clamp(52px, 8vw, 120px)", lineHeight: 0.9, letterSpacing: -2, margin: 0, color: "var(--text)" }}>
              Hecho a medida.<br/>
              <em style={{ fontStyle: "italic", color: "var(--accent)",  }}>Capa por capa.</em>
            </h1>
            <div style={{ marginTop: 36, maxWidth: 480, fontSize: 15, color: "var(--muted)", lineHeight: 1.6 }}>
              Cada producto es impreso bajo pedido en nuestro taller. Elegís el color, nosotros nos ocupamos del resto.
            </div>
          </div>
          <div>
            <ProductImage src={picks[0].img} alt=""/>
          </div>
        </div>
      </section>

      <section style={{ padding: "60px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }} className="home-c-feat">
          {picks.slice(1).map(p => <ProductCard key={p.id} product={p} onClick={() => go("detalle", { id: p.id })} onAdd={addToCart}/>)}
        </div>
      </section>
    </div>
  );
}
