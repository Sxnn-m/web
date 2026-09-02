import { useState } from 'react';
import { COLORS_FILAMENT } from '../data.js';
import { TKButton, TKInput, TKPill, Icon, ProductCard, fmtARS, SinStockBadge, sinStock } from '../components/UI.jsx';

export function DetalleScreen({ go, addToCart, productId, detalleVariant = "A", products = [] }) {
  const product = products.find(p => p.id === productId) || products[0] || {};
  const agotado = sinStock(product);

  // Build gallery from images array or fallback to single img
  const gallery = product.images?.filter(u => u?.trim()) ||
    (product.img ? [product.img] : []);

  const [activeImg, setActiveImg] = useState(gallery[0] || "");
  const [color, setColor] = useState(COLORS_FILAMENT[2]);
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState("");
  const [tab, setTab] = useState("desc");

  const related = products.filter(p => p.cat === product.cat && p.id !== product.id).slice(0, 4);

  if (detalleVariant === "B") return <DetalleB go={go} addToCart={addToCart} productId={productId} products={products}/>;

  return (
    <div style={{ padding: "24px 0 80px" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1, marginBottom: 24 }}>
        <span style={{ cursor: "pointer" }} onClick={() => go("home")}>INICIO</span>
        {" / "}
        <span style={{ cursor: "pointer" }} onClick={() => go("catalogo")}>CATÁLOGO</span>
        {" / "}
        <span style={{ cursor: "pointer" }} onClick={() => go("catalogo", { cat: product.cat })}>{product.sub.toUpperCase()}</span>
        {" / "}
        <span style={{ color: "var(--text)" }}>{product.name.toUpperCase()}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 48 }} className="detalle-grid">
        {/* Gallery */}
        <div>
          {/* Main image */}
          <div
            style={{ background: "var(--beige)", aspectRatio: "4/3", overflow: "hidden", cursor: gallery.length > 1 ? "zoom-in" : "default", position: "relative" }}
          >
            {activeImg ? (
              <img
                src={activeImg}
                alt={product.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                <Icon.layers size={48}/>
              </div>
            )}
          </div>

          {/* Thumbnails strip — only if more than 1 image */}
          {gallery.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(gallery.length, 5)}, 1fr)`, gap: 8, marginTop: 8 }}>
              {gallery.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(img)}
                  style={{
                    padding: 0, border: "none", cursor: "pointer",
                    outline: img === activeImg ? "2px solid var(--accent)" : "2px solid transparent",
                    outlineOffset: 2,
                    background: "var(--beige)",
                    aspectRatio: "1/1",
                    overflow: "hidden",
                    opacity: img === activeImg ? 1 : 0.65,
                    transition: "opacity .15s, outline .15s",
                  }}
                >
                  <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1.5 }}>
              {product.id.toUpperCase()} · {product.sub}
            </span>
            {product.tag && <TKPill variant={product.tag === "Premium" ? "dark" : "default"}>{product.tag}</TKPill>}
          </div>
          <h1 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", letterSpacing: -1, lineHeight: 1, margin: "0 0 18px", color: "var(--text)" }}>
            {product.name}
          </h1>
          {agotado ? (
            <div style={{ marginBottom: 28 }}>
              <SinStockBadge/>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
                Estamos reponiendo material para esta pieza. Escribinos por Instagram y te avisamos
                cuando vuelva.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 36, color: "var(--accent)", marginBottom: 28 }}>
              {fmtARS(product.price)}
            </div>
          )}

          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6, marginBottom: 28 }}>
            {product.desc}
          </p>

          {/* Color */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              Color · <span style={{ color: "var(--text)" }}>{color.name}</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COLORS_FILAMENT.map(c => (
                <button key={c.id} onClick={() => setColor(c)} title={c.name}
                  style={{
                    width: 36, height: 36, borderRadius: "50%", cursor: "pointer",
                    background: c.hex, border: `2px solid ${color.id === c.id ? "var(--accent)" : "var(--line)"}`,
                    outline: color.id === c.id ? "2px solid var(--bg)" : "none",
                    outlineOffset: -4,
                  }}/>
              ))}
            </div>
          </div>

          {/* Texto personalizado */}
          <div style={{ marginBottom: 24 }}>
            <TKInput label="Texto personalizado (opcional)" placeholder='Ej: "Casa López"' value={custom} onChange={(e) => setCustom(e.target.value)} hint="Máx. 20 caracteres · Sin cargo adicional"/>
          </div>

          {/* Qty + Add */}
          {agotado ? (
            <div style={{ marginBottom: 24 }}>
              <TKButton size="lg" full disabled>Sin stock</TKButton>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-strong)" }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtn}><Icon.minus/></button>
                <span style={{ padding: "0 18px", fontSize: 16 }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} style={qtyBtn}><Icon.plus/></button>
              </div>
              <TKButton size="lg" full icon={<Icon.ig size={16}/>} onClick={() => addToCart(product, { color, custom, qty })}>
                Consultar por Instagram — {fmtARS(product.price * qty)}
              </TKButton>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: 60 }}>
        <div style={{ display: "flex", gap: 32, borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
          {[{id:"desc",l:"Descripción"},{id:"specs",l:"Especificaciones"},{id:"env",l:"Envío"}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "14px 0", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
              color: tab === t.id ? "var(--text)" : "var(--muted)",
            }}>{t.l}</button>
          ))}
        </div>
        <div style={{ maxWidth: 720, fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
          {tab === "desc" && <p>{product.desc} Cada pieza es impresa bajo pedido en nuestro taller en CABA. Los tiempos de producción varían según la demanda y el nivel de detalle.</p>}
          {tab === "specs" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20 }}>
              {Object.entries(product.specs).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 18, color: "var(--text)" }}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "env" && <p>Enviamos a todo Argentina por Correo Argentino y Andreani. Despacho en 48–72h hábiles luego de la producción (3–5 días hábiles). Envío gratuito en compras superiores a $25.000.</p>}
        </div>
      </div>

      {/* Relacionados */}
      <div style={{ marginTop: 60 }}>
        <h3 style={{ fontSize: 32, letterSpacing: -0.5, margin: "0 0 24px" }}>Podría gustarte</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
          {related.map(p => <ProductCard key={p.id} product={p} onClick={() => go("detalle", { id: p.id })} onAdd={addToCart}/>)}
        </div>
      </div>
    </div>
  );
}

function DetalleB({ go, addToCart, productId, products = [] }) {
  const product = products.find(p => p.id === productId) || products[0] || {};
  const agotado = sinStock(product);
  const [color, setColor] = useState(COLORS_FILAMENT[2]);
  const [qty, setQty] = useState(1);

  return (
    <div style={{ padding: "0", margin: "0 -24px" }}>
      {/* Hero full bleed */}
      <div style={{ position: "relative", minHeight: 600, background: "var(--beige)" }}>
        <img src={product.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }}/>
        <div style={{ position: "absolute", top: 20, left: 20 }}>
          <TKButton variant="outline" size="sm" onClick={() => go("catalogo")} icon={<Icon.back size={14}/>}>Volver</TKButton>
        </div>
        <div style={{ position: "absolute", bottom: 40, left: 40, right: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32, flexWrap: "wrap" }}>
          <div>
            <TKPill>{product.sub}</TKPill>
            <h1 style={{ fontSize: "clamp(40px, 7vw, 96px)", letterSpacing: -2, lineHeight: 0.92, margin: "16px 0 0", color: "var(--anchor)" }}>
              {product.name}
            </h1>
          </div>
          <div style={{ background: "var(--bg)", padding: "24px 32px", minWidth: 300 }}>
            {agotado ? (
              <SinStockBadge/>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>DESDE</div>
                <div style={{ fontSize: 48, color: "var(--accent)", letterSpacing: -1 }}>
                  {fmtARS(product.price)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: "60px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }} className="detalle-b-grid">
        <div>
          <h3 style={{ fontSize: 24, letterSpacing: -0.3, margin: "0 0 16px" }}>Sobre esta pieza</h3>
          <p style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.7 }}>{product.desc}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 32 }}>
            {Object.entries(product.specs).filter(([, v]) => v).map(([k,v]) => (
              <div key={k} style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 10 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
                <div style={{ fontSize: 18 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
            Color — {color.name}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
            {COLORS_FILAMENT.map(c => (
              <button key={c.id} onClick={() => setColor(c)}
                style={{ width: 40, height: 40, borderRadius: "50%", cursor: "pointer", background: c.hex, border: `2px solid ${color.id === c.id ? "var(--accent)" : "var(--line)"}`, outline: color.id === c.id ? "2px solid var(--bg)" : "none", outlineOffset: -4 }}/>
            ))}
          </div>
          {agotado ? (
            <TKButton size="lg" full disabled>Sin stock</TKButton>
          ) : (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-strong)" }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtn}><Icon.minus/></button>
                <span style={{ padding: "0 18px", fontSize: 16 }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} style={qtyBtn}><Icon.plus/></button>
              </div>
              <TKButton size="lg" full icon={<Icon.ig size={16}/>} onClick={() => addToCart(product, { color, qty })}>
                Consultar por Instagram
              </TKButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const qtyBtn = {
  padding: "14px 14px", background: "transparent", border: "none",
  cursor: "pointer", display: "flex", alignItems: "center", color: "var(--text)",
};
