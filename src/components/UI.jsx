import { useState } from 'react';
import logoFull from '../assets/logo-full.jpg';

export const fmtARS = (n) => "$ " + Math.round(n).toLocaleString("es-AR");

// ---------- Button ----------
export function TKButton({ children, variant = "primary", size = "md", full, onClick, disabled, icon }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid transparent",
    borderRadius: 4,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontWeight: 600,
    letterSpacing: 0.2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "transform .08s ease, background .15s ease, border-color .15s ease",
    width: full ? "100%" : "auto",
    textTransform: "none",
  };
  const sizes = {
    sm: { padding: "8px 14px", fontSize: 13 },
    md: { padding: "12px 20px", fontSize: 14 },
    lg: { padding: "16px 28px", fontSize: 15 },
  };
  const variants = {
    primary: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
    dark: { background: "var(--anchor)", color: "#fff", borderColor: "var(--anchor)" },
    outline: { background: "transparent", color: "var(--text)", borderColor: "var(--line-strong)" },
    ghost: { background: "transparent", color: "var(--text)" },
    beige: { background: "var(--beige)", color: "var(--anchor)", borderColor: "var(--beige)" },
  };
  return (
    <button
      style={{ ...base, ...sizes[size], ...variants[variant] }}
      onClick={onClick}
      disabled={disabled}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------- Input ----------
export function TKInput({ label, type = "text", value, onChange, placeholder, hint, error, icon }) {
  return (
    <label style={{ display: "block", width: "100%" }}>
      {label && (
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
          textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
        }}>{label}</div>
      )}
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>{icon}</span>}
        <input
          type={type}
          value={value || ""}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: icon ? "12px 14px 12px 38px" : "12px 14px",
            background: "var(--bg)",
            border: `1px solid ${error ? "#c64138" : "var(--line)"}`,
            borderRadius: 4,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: "var(--text)",
            outline: "none",
            transition: "border-color .15s",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = error ? "#c64138" : "var(--line)")}
        />
      </div>
      {(hint || error) && (
        <div style={{ fontSize: 12, color: error ? "#c64138" : "var(--muted)", marginTop: 6 }}>
          {error || hint}
        </div>
      )}
    </label>
  );
}

// ---------- Pill / Badge ----------
export function TKPill({ children, variant = "default" }) {
  const map = {
    default: { bg: "var(--beige)", fg: "var(--anchor)" },
    accent: { bg: "var(--accent)", fg: "#fff" },
    dark: { bg: "var(--anchor)", fg: "#fff" },
    outline: { bg: "transparent", fg: "var(--text)", border: "1px solid var(--line-strong)" },
  };
  const v = map[variant];
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 10px",
      background: v.bg,
      color: v.fg,
      border: v.border || "none",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 1,
      textTransform: "uppercase",
      borderRadius: 2,
    }}>{children}</span>
  );
}

// ---------- Icons (stroke SVG minimal) ----------
export const Icon = {
  cart: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/></svg>,
  user: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>,
  search: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  menu: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>,
  close: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  arrow: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  back: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>,
  check: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  plus: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  minus: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14"/></svg>,
  trash: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>,
  grid: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>,
  list: (p = {}) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
  google: (p = {}) => <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.6-.2-2.4H12v4.5h5.9c-.3 1.4-1 2.6-2.2 3.4v2.8h3.6c2.1-2 3.2-4.8 3.2-8.3z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2v2.9C3.8 20.7 7.6 23 12 23z"/><path fill="#FBBC05" d="M5.8 14.1c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V7H2c-.7 1.5-1.2 3.2-1.2 5s.4 3.5 1.2 5l3.8-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.4 2.1 14.9 1 12 1 7.6 1 3.8 3.3 2 7l3.8 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>,
  ig: (p = {}) => <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>,
  mail: (p = {}) => <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/></svg>,
  truck: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="12" height="10"/><path d="M14 10h5l3 4v3h-8"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>,
  shield: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>,
  spark: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>,
  layers: (p = {}) => <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/></svg>,
  home: (p = {}) => <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7v11H3z"/><path d="M9 21v-7h6v7"/></svg>,
  eye: (p = {}) => <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: (p = {}) => <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
};

// ---------- Logo TKPrints ----------
export function TKLogo({ size = 28 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center" }}>
      <img src={logoFull} alt="TKPrints" style={{ height: size, width: "auto", display: "block" }} />
    </div>
  );
}

// ---------- Product image with overlay support ----------
export function ProductImage({ src, alt, ratio = "1 / 1", overlay }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      aspectRatio: ratio,
      background: "var(--beige)",
      overflow: "hidden",
    }}>
      <img src={src} alt={alt} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", mixBlendMode: "multiply",
      }} onError={(e) => { e.currentTarget.style.display = "none"; }}/>
      {overlay}
    </div>
  );
}

// ---------- "Sin stock" badge ----------
// El público nunca ve gramos ni datos de inventario: solo este cartel, que
// sale del booleano "disponible" guardado en el propio producto.
export function SinStockBadge({ size = "md" }) {
  return (
    <span style={{
      display: "inline-block",
      padding: size === "sm" ? "3px 8px" : "5px 12px",
      background: "var(--anchor)", color: "#fff",
      fontSize: size === "sm" ? 10 : 11,
      fontWeight: 700, letterSpacing: 1,
      textTransform: "uppercase", borderRadius: 2,
    }}>
      Sin stock
    </span>
  );
}

/** Un producto queda bloqueado solo si el backoffice lo marcó como no disponible. */
export const sinStock = (product) => product?.disponible === false;

// ---------- Product card ----------
export function ProductCard({ product, onClick, onAdd, layout = "grid" }) {
  const agotado = sinStock(product);
  const lowStock = !agotado && product.stock != null && product.stock < 5;

  if (layout === "list") {
    return (
      <div onClick={onClick} style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr auto",
        gap: 20,
        padding: "18px 0",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        alignItems: "center",
      }}>
        <div style={{ width: 140 }}>
          <ProductImage src={product.img} alt={product.name} />
        </div>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {product.id.toUpperCase()} · {product.sub}
            </span>
            {product.tag && <TKPill variant={product.tag === "Premium" ? "dark" : "default"}>{product.tag}</TKPill>}
            {lowStock && (
              <span style={{
                display: "inline-block", padding: "3px 8px",
                background: "#FFF3CD", color: "#9A6200",
                border: "1px solid #F0C040",
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", borderRadius: 2,
              }}>
                ¡Últimas {product.stock} unidad{product.stock === 1 ? "" : "es"}!
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, color: "var(--text)", letterSpacing: -0.3 }}>
            {product.name}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, maxWidth: 440 }}>
            {product.desc}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {agotado ? (
            <SinStockBadge/>
          ) : (
            <>
              <div style={{ fontSize: 20, color: "var(--text)", marginBottom: 10 }}>
                {fmtARS(product.price)}
              </div>
              <TKButton size="sm" icon={<Icon.ig size={13}/>} onClick={(e) => { e.stopPropagation(); onAdd?.(product); }}>
                Consultar
              </TKButton>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 12 }}
      onMouseEnter={(e) => { const img = e.currentTarget.querySelector('.pcard-img'); if (img) img.style.transform = "scale(1.03)"; }}
      onMouseLeave={(e) => { const img = e.currentTarget.querySelector('.pcard-img'); if (img) img.style.transform = "scale(1)"; }}
    >
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div className="pcard-img" style={{ transition: "transform .5s ease" }}>
          <ProductImage src={product.img} alt={product.name} />
        </div>
        {product.tag && (
          <div style={{ position: "absolute", top: 12, left: 12 }}>
            <TKPill variant={product.tag === "Premium" ? "dark" : "default"}>{product.tag}</TKPill>
          </div>
        )}
        {lowStock && (
          <div style={{
            position: "absolute", bottom: 12, left: 12,
            background: "#FFF3CD", color: "#9A6200",
            border: "1px solid #F0C040",
            padding: "4px 8px",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", borderRadius: 2,
            lineHeight: 1.4,
          }}>
            ¡Últimas {product.stock} unidad{product.stock === 1 ? "" : "es"}!
          </div>
        )}
        {agotado ? (
          <div style={{ position: "absolute", bottom: 0, right: 0 }}>
            <SinStockBadge/>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd?.(product); }}
            style={{
              position: "absolute", bottom: 0, right: 0,
              background: "var(--anchor)", color: "#fff",
              border: "none", padding: "12px 16px",
              fontWeight: 600, fontSize: 12,
              letterSpacing: 0.8, textTransform: "uppercase",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon.ig size={14}/> Consultar
          </button>
        )}
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          {product.sub}
        </div>
        <div style={{ fontSize: 18, color: "var(--text)", letterSpacing: -0.2, lineHeight: 1.15, marginBottom: 8 }}>
          {product.name}
        </div>
        {agotado ? (
          <SinStockBadge size="sm"/>
        ) : (
          <div style={{ fontSize: 16, color: "var(--accent)" }}>
            {fmtARS(product.price)}
          </div>
        )}
      </div>
    </div>
  );
}
