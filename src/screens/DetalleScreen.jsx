import { useState } from 'react';
import { normalizarVariantesPublicas, ordenarPorDisponibilidad } from '../lib/variantes.js';
import {
  normalizarGruposPublicos, seleccionInicial, precioDeSeleccion,
  etiquetaSeleccion, claveSeleccion, opcionElegida,
} from '../lib/variantesInsumo.js';
import { TKButton, TKInput, TKPill, Icon, ProductCard, fmtARS, SinStockBadge, sinStock } from '../components/UI.jsx';
import { formatTiempoProducto } from '../lib/tiempoImpresion.js';
import { descripcionPublica } from '../lib/descripcion.js';

/**
 * Specs que ve el público, con etiquetas legibles. Lista explícita a propósito:
 * los campos internos del tiempo (tiempoHoras, tiempoMinutos,
 * tiempoImpresionHorasDecimal) no deben aparecer nunca en el catálogo.
 */
function specsVisibles(product) {
  const specs = product?.specs || {};
  const tiempo = formatTiempoProducto(product);
  return [
    ["Material", specs.material],
    ["Peso", specs.peso],
    ["Tiempo de impresión", tiempo !== "—" ? tiempo : ""],
  ].filter(([, valor]) => valor);
}

export function DetalleScreen({ go, addToCart, productId, detalleVariant = "A", products = [], categories = [] }) {
  const product = products.find(p => p.id === productId) || products[0] || {};
  // product.cat guarda el ID de la categoría ("deco"), no su nombre. Si la
  // categoría ya no existe se muestra el valor crudo: perder el nivel del
  // camino sería peor que mostrarlo sin traducir.
  const nombreCategoria =
    categories.find(c => c.id === product.cat)?.name || product.cat || "";
  const agotado = sinStock(product);

  // Build gallery from images array or fallback to single img
  const gallery = product.images?.filter(u => u?.trim()) ||
    (product.img ? [product.img] : []);

  // La miniatura elegida es un OVERRIDE, no la fuente de verdad: si no
  // pertenece a la galería del producto que se está viendo, se descarta sola y
  // manda la primera imagen. Así la principal no queda pegada a la del producto
  // anterior al navegar (App.jsx además remonta la pantalla con key), ni vacía
  // cuando los productos terminan de cargar después del primer render.
  const [imgElegida, setImgElegida] = useState(null);
  const activeImg = gallery.includes(imgElegida) ? imgElegida : (gallery[0] || "");
  const setActiveImg = setImgElegida;
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState("");
  const [tab, setTab] = useState("desc");

  // Las variantes vienen del doc público del producto: nombre, aclaración y
  // si hay stock. Los colores de filamento que hay detrás nunca llegan acá.
  const variantes = normalizarVariantesPublicas(product.variantes);
  const conStock = variantes.filter(v => v.disponible);
  // Arranca en la primera con stock: nunca en una agotada.
  const [varianteId, setVarianteId] = useState(null);
  const variante = conStock.find(v => v.id === varianteId) || conStock[0] || null;
  const setVariante = (v) => setVarianteId(v?.id || null);

  // Grupos de insumo: cada uno cambia qué lleva la pieza y cuánto sale.
  const grupos = normalizarGruposPublicos(product.variantesInsumo);
  const [seleccion, setSeleccion] = useState(() => seleccionInicial(grupos));
  const elegir = (grupoId, opcionId) =>
    setSeleccion(s => ({ ...s, [grupoId]: opcionId }));

  // El precio base NO incluye ninguna opción (calcularRentabilidad solo suma
  // los insumos fijos), así que el precio real es base + lo elegido.
  const extra = precioDeSeleccion(grupos, seleccion);
  const precioFinal = (Number(product.price) || 0) + extra;

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
        {/* Categoría: filtra por ella sola, sin subcategoría. */}
        {nombreCategoria && (
          <>
            <span style={{ cursor: "pointer" }}
              onClick={() => go("catalogo", { cat: product.cat })}>
              {nombreCategoria.toUpperCase()}
            </span>
            {" / "}
          </>
        )}
        {/* Este crumb dice la SUBcategoría, así que tiene que filtrar por ella:
            antes navegaba con { cat }, y terminabas en la categoría padre
            entera. CatalogoScreen lee "sub" con el nombre exacto, el mismo
            valor que muestra el rótulo. */}
        {product.sub && (
          <>
            <span style={{ cursor: "pointer" }}
              onClick={() => go("catalogo", { cat: product.cat, sub: product.sub })}>
              {product.sub.toUpperCase()}
            </span>
            {" / "}
          </>
        )}
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
            {/* El ID (TKPx) es referencia interna del backoffice: no se muestra
                en el catálogo. */}
            <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1.5 }}>
              {product.sub}
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
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 36, color: "var(--accent)" }}>
                {fmtARS(precioFinal)}
              </div>
              {extra > 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {fmtARS(product.price)} + {fmtARS(extra)} por lo que elegiste
                </div>
              )}
            </div>
          )}

          {/* La descripción va en la pestaña "Descripción" de más abajo, con el
              mensaje de producción. Acá estaba repetida. */}

          {/* Color: las variantes reales del producto, no una paleta fija */}
          <SelectorDeVariante
            variantes={variantes}
            elegida={variante}
            onElegir={setVariante}
          />

          {/* Un selector por grupo de insumo, con el mismo estilo. */}
          {grupos.map(g => (
            <SelectorDeGrupo
              key={g.id}
              grupo={g}
              elegida={opcionElegida(g, seleccion)}
              onElegir={(o) => elegir(g.id, o.id)}
            />
          ))}

          {/* Texto personalizado */}
          <div style={{ marginBottom: 24 }}>
            <TKInput label="Texto personalizado (opcional)" placeholder='Ej: "Casa López"' value={custom} onChange={(e) => setCustom(e.target.value)} hint="Sin cargo adicional"/>
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
              {/* El cierre por Instagram pasó al carrito: acá se arma la
                  línea (producto + color + texto + cantidad) y listo. */}
              <TKButton size="lg" full icon={<Icon.cart size={16}/>} onClick={() => addToCart(product, {
                color: varianteComoColor(variante), custom, qty,
                // La línea del carrito congela el precio de ESTA combinación,
                // no el del producto pelado.
                precioUnitario: precioFinal,
                opciones: {
                  seleccion,
                  etiqueta: etiquetaSeleccion(grupos, seleccion),
                  clave: claveSeleccion(seleccion),
                },
              })}>
                Agregar al carrito — {fmtARS(precioFinal * qty)}
              </TKButton>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: 60 }}>
        <div style={{ display: "flex", gap: 32, borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
          {[{id:"desc",l:"Descripción"},{id:"specs",l:"Especificaciones"}].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "14px 0", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
              color: tab === t.id ? "var(--text)" : "var(--muted)",
            }}>{t.l}</button>
          ))}
        </div>
        <div style={{ maxWidth: 720, fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
          {tab === "desc" && <p>{descripcionPublica(product.desc)}</p>}
          {tab === "specs" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20 }}>
              {specsVisibles(product).map(([k, v]) => (
                <div key={k} style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k}</div>
                  <div style={{ fontSize: 18, color: "var(--text)" }}>{v}</div>
                </div>
              ))}
            </div>
          )}
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

/**
 * El carrito guarda el color como {id, name}: la variante entra con esa misma
 * forma, así la línea del pedido y el resumen de Instagram no cambian.
 */
const varianteComoColor = (v) => v ? { id: v.id, name: v.nombre } : null;

/**
 * Selector de variante. Lista TODAS las variantes del producto, con las
 * agotadas deshabilitadas y tachadas: el cliente ve la oferta completa de la
 * pieza y entiende que ese color existe pero hoy no está. Nunca se expone
 * qué filamento hay detrás ni cuánto queda.
 */
function SelectorDeVariante({ variantes, elegida, onElegir }) {
  const conStock = variantes.filter(v => v.disponible);
  // Sin ninguna disponible el producto ya muestra "Sin stock" arriba: un
  // selector con todo deshabilitado sería ruido.
  if (conStock.length === 0) return null;

  // Lo que se puede comprar va primero; las agotadas quedan juntas al final,
  // en vez de intercaladas entre las que sí están.
  const ordenadas = ordenarPorDisponibilidad(variantes);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
        Color · <span style={{ color: "var(--text)" }}>{elegida?.nombre || "—"}</span>
      </div>
      {elegida?.aclaracion && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
          {elegida.aclaracion}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {ordenadas.map(v => {
          const activa = v.id === elegida?.id;
          return (
            <button
              key={v.id}
              onClick={() => v.disponible && onElegir(v)}
              disabled={!v.disponible}
              title={v.disponible ? v.aclaracion || v.nombre : `${v.nombre} — sin stock`}
              style={{
                padding: "9px 14px", cursor: v.disponible ? "pointer" : "not-allowed",
                background: activa ? "var(--accent)" : "var(--bg)",
                color: activa ? "#fff" : v.disponible ? "var(--text)" : "var(--muted)",
                border: `1px solid ${activa ? "var(--accent)" : "var(--line-strong)"}`,
                borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13, fontWeight: activa ? 600 : 400,
                textDecoration: v.disponible ? "none" : "line-through",
                opacity: v.disponible ? 1 : 0.55,
              }}
            >
              {v.nombre}
              {!v.disponible && (
                <span style={{ fontSize: 10, marginLeft: 6, textDecoration: "none", display: "inline-block" }}>
                  sin stock
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Selector de un grupo de insumo. Mismo estilo que el de color: agotadas
 * deshabilitadas, tachadas y al final. Cada opción muestra lo que suma al
 * precio, que es la razón de ser del grupo.
 */
function SelectorDeGrupo({ grupo, elegida, onElegir }) {
  const conStock = grupo.opciones.filter(o => o.disponible);
  if (conStock.length === 0) return null;
  const ordenadas = [...grupo.opciones].sort(
    (a, b) => (b.disponible === true) - (a.disponible === true));

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
        {grupo.nombre} · <span style={{ color: "var(--text)" }}>{elegida?.nombre || "—"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ordenadas.map(o => {
          const activa = o.id === elegida?.id;
          return (
            <button
              key={o.id}
              onClick={() => o.disponible && onElegir(o)}
              disabled={!o.disponible}
              title={o.disponible ? o.nombre : `${o.nombre} — sin stock`}
              style={{
                padding: "9px 14px", cursor: o.disponible ? "pointer" : "not-allowed",
                background: activa ? "var(--accent)" : "var(--bg)",
                color: activa ? "#fff" : o.disponible ? "var(--text)" : "var(--muted)",
                border: `1px solid ${activa ? "var(--accent)" : "var(--line-strong)"}`,
                borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13, fontWeight: activa ? 600 : 400,
                textDecoration: o.disponible ? "none" : "line-through",
                opacity: o.disponible ? 1 : 0.55,
              }}
            >
              {o.nombre}
              {o.precio > 0 && (
                <span style={{ fontSize: 11, marginLeft: 6, textDecoration: "none", display: "inline-block", opacity: 0.85 }}>
                  +{fmtARS(o.precio)}
                </span>
              )}
              {!o.disponible && (
                <span style={{ fontSize: 10, marginLeft: 6, textDecoration: "none", display: "inline-block" }}>
                  sin stock
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetalleB({ go, addToCart, productId, products = [] }) {
  const product = products.find(p => p.id === productId) || products[0] || {};
  const agotado = sinStock(product);
  const variantes = normalizarVariantesPublicas(product.variantes);
  const conStock = variantes.filter(v => v.disponible);
  const [varianteId, setVarianteId] = useState(null);
  const variante = conStock.find(v => v.id === varianteId) || conStock[0] || null;
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
            {specsVisibles(product).map(([k,v]) => (
              <div key={k} style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 10 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
                <div style={{ fontSize: 18 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SelectorDeVariante
            variantes={variantes}
            elegida={variante}
            onElegir={v => setVarianteId(v?.id || null)}
          />
          {agotado ? (
            <TKButton size="lg" full disabled>Sin stock</TKButton>
          ) : (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-strong)" }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtn}><Icon.minus/></button>
                <span style={{ padding: "0 18px", fontSize: 16 }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} style={qtyBtn}><Icon.plus/></button>
              </div>
              <TKButton size="lg" full icon={<Icon.cart size={16}/>} onClick={() => addToCart(product, { color: varianteComoColor(variante), qty })}>
                Agregar al carrito
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
