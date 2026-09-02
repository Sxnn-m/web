import { useState, useEffect, useMemo } from 'react';
import './index.css';
import { PRODUCTS as FALLBACK_PRODUCTS, CATEGORIES as FALLBACK_CATEGORIES, COLORS_FILAMENT } from './data.js';
import { TKLogo, Icon } from './components/UI.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { CatalogoScreen } from './screens/CatalogoScreen.jsx';
import { DetalleScreen } from './screens/DetalleScreen.jsx';
import { CarritoScreen } from './screens/CarritoScreen.jsx';
import { AuthScreen } from './screens/AuthScreen.jsx';
import { CheckoutScreen, PagoScreen, ConfirmacionScreen } from './screens/CheckoutScreen.jsx';
import { PerfilScreen } from './screens/PerfilScreen.jsx';
import { AboutScreen } from './screens/AboutScreen.jsx';
import { AdminScreen } from './screens/AdminScreen.jsx';
import { MobileHome, MobileCatalogoHub, MobileCategoria, MobileBuscador, MobileTabBar, MobileHeader } from './screens/mobile/MobileScreens.jsx';
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

const TWEAK_DEFAULTS = {
  viewport: "desktop",
  theme: "light",
  accent: "#345C83",
  homeVariant: "A",
  catalogoLayout: "grid",
  detalleVariant: "A",
  cartVariant: "A",
};

const ACCENTS = [
  { id: "#345C83", name: "Azul Pizarra" },
  { id: "#2C353E", name: "Grafito" },
  { id: "#7A8A4A", name: "Verde oliva" },
  { id: "#B56B3E", name: "Terracota" },
  { id: "#C64138", name: "Rojo" },
];

function Nav({ route, go, cartCount, user, isAdmin }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 0", borderBottom: "1px solid var(--line)",
        position: "sticky", top: 0, background: "var(--bg)", zIndex: 50,
      }}>
        <div onClick={() => go("home")} style={{ cursor: "pointer" }}>
          <TKLogo size={22}/>
        </div>

        <div className="nav-desktop" style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <a onClick={() => go("home")} style={navLink(route === "home")}>Home</a>
          <a onClick={() => go("catalogo")} style={navLink(route === "catalogo")}>Catálogo</a>
          <a onClick={() => go("about")} style={navLink(route === "about")}>Sobre nosotros</a>
          {isAdmin && <a onClick={() => go("admin")} style={{...navLink(route === "admin"), display: "flex", alignItems: "center", gap: 6}}><Icon.layers size={14}/> Backoffice</a>}
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => go("catalogo")} style={iconBtn}><Icon.search/></button>
          <button onClick={() => go(user ? "perfil" : "auth")} style={{ ...iconBtn, gap: 7 }}>
            <Icon.user/>
            {user && (
              <span className="nav-username" style={{
                fontSize: 13, fontWeight: 600, color: "var(--text)",
                maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user.nombre || user.email}
              </span>
            )}
          </button>
          <button onClick={() => go("carrito")} style={{...iconBtn, position: "relative"}}>
            <Icon.cart/>
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: 6, right: 6, background: "var(--accent)", color: "#fff", fontSize: 10, fontWeight: 700, width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",  }}>
                {cartCount}
              </span>
            )}
          </button>
          <button className="nav-mobile" onClick={() => setOpen(!open)} style={{...iconBtn, display: "none"}}>
            {open ? <Icon.close/> : <Icon.menu/>}
          </button>
        </div>
      </nav>

      {open && (
        <div style={{ padding: "16px 0", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
          {[["catalogo","Catálogo"],["about","Sobre nosotros"],["perfil","Mi cuenta"], ...(isAdmin ? [["admin","Backoffice"]] : [])].map(([r,l]) => (
            <a key={r} onClick={() => { go(r); setOpen(false); }} style={{ padding: "10px 0", color: "var(--text)", fontWeight: 600, cursor: "pointer" }}>{l}</a>
          ))}
        </div>
      )}
    </>
  );
}

const navLink = (active) => ({
  fontSize: 14, fontWeight: 500, color: active ? "var(--accent)" : "var(--text)",
  textDecoration: "none", cursor: "pointer",
});

const iconBtn = {
  background: "none", border: "none", padding: 10, color: "var(--text)",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

function Footer({ go }) {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 60, padding: "48px 0 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40 }} className="about-grid">
        <div>
          <TKLogo size={24}/>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, marginTop: 16, maxWidth: 280 }}>
            Impresión 3D diseñada y producida en Buenos Aires. Precisión cálida, objetos que se usan.
          </p>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>Tienda</div>
          <FL onClick={() => go("catalogo", {cat:"casa"})}>Para la Casa</FL>
          <FL onClick={() => go("catalogo", {cat:"gadgets"})}>Gadgets</FL>
          <FL onClick={() => go("catalogo", {cat:"lamparas"})}>Lámparas</FL>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>Info</div>
          <FL onClick={() => go("about")}>Sobre nosotros</FL>
          <FL onClick={() => go("about")}>Contacto</FL>
          <FL>Envíos y devoluciones</FL>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>Contacto</div>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}><Icon.ig size={14}/> @tk.prints.3d</div>
          <div style={{ fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}><Icon.mail size={14}/> tk.prints.ok@hotmail.com</div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--line)", marginTop: 36, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", letterSpacing: 1 }}>
        <span>© 2026 TKPRINTS — ARGENTINA</span>
        <span>SIMPLE · CONFIABLE · SÓLIDO</span>
      </div>
    </footer>
  );
}

function FL({ children, onClick }) {
  return <a onClick={onClick} style={{ display: "block", padding: "6px 0", fontSize: 13, color: "var(--text)", cursor: "pointer", textDecoration: "none" }}>{children}</a>;
}

function TweaksPanel({ state, setState, onClose }) {
  const up = (k, v) => setState(s => ({ ...s, [k]: v }));
  return (
    <div className="tk-tweaks">
      <h4>Tweaks
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)"}}><Icon.close size={16}/></button>
      </h4>

      <label>
        <div className="lab">Viewport</div>
        <div className="seg">
          <button className={state.viewport === "desktop" ? "on" : ""} onClick={() => up("viewport", "desktop")}>Desktop</button>
          <button className={state.viewport === "mobile" ? "on" : ""} onClick={() => up("viewport", "mobile")}>Mobile</button>
        </div>
      </label>

      <label>
        <div className="lab">Tema</div>
        <div className="seg">
          <button className={state.theme === "light" ? "on" : ""} onClick={() => up("theme", "light")}>Claro</button>
          <button className={state.theme === "dark" ? "on" : ""} onClick={() => up("theme", "dark")}>Grafito</button>
        </div>
      </label>

      <label>
        <div className="lab">Acento</div>
        <div className="swatch-row">
          {ACCENTS.map(a => (
            <button key={a.id} className={"swatch " + (state.accent === a.id ? "on" : "")} style={{background: a.id}} onClick={() => up("accent", a.id)} title={a.name}/>
          ))}
        </div>
      </label>

      <label>
        <div className="lab">Home</div>
        <div className="seg">
          {["A","B","C"].map(v => (
            <button key={v} className={state.homeVariant === v ? "on" : ""} onClick={() => up("homeVariant", v)}>{v}</button>
          ))}
        </div>
      </label>

      <label>
        <div className="lab">Catálogo</div>
        <div className="seg">
          <button className={state.catalogoLayout === "grid" ? "on" : ""} onClick={() => up("catalogoLayout", "grid")}>Grid</button>
          <button className={state.catalogoLayout === "list" ? "on" : ""} onClick={() => up("catalogoLayout", "list")}>Lista</button>
        </div>
      </label>

      <label>
        <div className="lab">Detalle</div>
        <div className="seg">
          <button className={state.detalleVariant === "A" ? "on" : ""} onClick={() => up("detalleVariant", "A")}>Clásico</button>
          <button className={state.detalleVariant === "B" ? "on" : ""} onClick={() => up("detalleVariant", "B")}>Editorial</button>
        </div>
      </label>

      <label style={{marginBottom:0}}>
        <div className="lab">Carrito</div>
        <div className="seg">
          <button className={state.cartVariant === "A" ? "on" : ""} onClick={() => up("cartVariant", "A")}>Editorial</button>
          <button className={state.cartVariant === "B" ? "on" : ""} onClick={() => up("cartVariant", "B")}>Compacto</button>
        </div>
      </label>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState("home");
  const [routeData, setRouteData] = useState({});
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [tweaks, setTweaks] = useState({...TWEAK_DEFAULTS});
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [products, setProducts] = useState(FALLBACK_PRODUCTS);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);

  // Load products from Firestore (falls back to hardcoded if Firestore empty)
  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (!snap.empty) {
        setProducts(snap.docs.map(d => ({ ...d.data(), _id: d.id })));
      }
    } catch (err) {
      console.error("Could not load products from Firestore:", err);
    }
  };

  // Load categories from Firestore (falls back to hardcoded if Firestore empty)
  const loadCategories = async () => {
    try {
      const snap = await getDocs(collection(db, "categories"));
      if (!snap.empty) {
        const cats = snap.docs
          .map(d => ({ ...d.data(), _id: d.id }))
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setCategories(cats);
      }
    } catch (err) {
      console.error("Could not load categories from Firestore:", err);
    }
  };

  useEffect(() => { loadProducts(); loadCategories(); }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme);
    document.documentElement.style.setProperty("--accent", tweaks.accent);
  }, [tweaks.theme, tweaks.accent]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser({ email: currentUser.email, nombre: currentUser.displayName || currentUser.email });
        // Check user role from Firestore
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setIsAdmin(userDoc.data().role === "admin");
          } else {
            setIsAdmin(false);
          }
        } catch (err) {
          console.error("Error fetching user role:", err);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const go = (r, data = {}) => {
    setRoute(r);
    setRouteData(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addToCart = (product, opts = {}) => {
    setCart(c => [...c, {
      product,
      qty: opts.qty || 1,
      color: opts.color || COLORS_FILAMENT[2],
      custom: opts.custom || "",
    }]);
    const toast = document.createElement("div");
    toast.textContent = "✓ Agregado al carrito";
    toast.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--anchor);color:#fff;padding:12px 20px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.2)";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  };

  const updateQty = (i, qty) => setCart(c => c.map((it, j) => j === i ? {...it, qty} : it));
  const removeItem = (i) => setCart(c => c.filter((_, j) => j !== i));
  const placeOrder = () => {
    const id = "TK-" + Math.floor(2900 + Math.random() * 100);
    setLastOrder({ id });
    setCart([]);
  };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const isMobile = tweaks.viewport === "mobile";

  const publicCategories = useMemo(() => {
    return categories.filter(c => c.visible !== false).map(c => ({
      ...c,
      subs: (c.subs || []).filter(s => !(c.hiddenSubs || []).includes(s))
    }));
  }, [categories]);

  const publicProducts = useMemo(() => {
    return products.filter(p => {
      if (p.visible === false) return false;
      const cat = categories.find(c => c.id === p.cat);
      if (!cat || cat.visible === false) return false;
      if (p.sub && (cat.hiddenSubs || []).includes(p.sub)) return false;
      return true;
    });
  }, [products, categories]);

  const renderScreen = () => {
    if (isMobile) {
      switch(route) {
        case "home": return <MobileHome go={go} addToCart={addToCart} products={publicProducts}/>;
        case "catalogo": return <MobileCatalogoHub go={go} products={publicProducts}/>;
        case "categoria": return <MobileCategoria go={go} addToCart={addToCart} cat={routeData.cat} products={publicProducts}/>;
        case "buscador": return <MobileBuscador go={go} addToCart={addToCart} products={publicProducts}/>;
        case "detalle": return <DetalleScreen go={go} addToCart={addToCart} productId={routeData.id} detalleVariant={tweaks.detalleVariant} products={publicProducts}/>;
        case "carrito": return <CarritoScreen go={go} cart={cart} updateQty={updateQty} removeItem={removeItem} cartVariant={tweaks.cartVariant}/>;
        case "auth": return <AuthScreen go={go} onLogin={setUser}/>;
        case "checkout": return <CheckoutScreen go={go} cart={cart} user={user}/>;
        case "pago": return <PagoScreen go={go} cart={cart} placeOrder={placeOrder}/>;
        case "confirmacion": return <ConfirmacionScreen go={go} lastOrder={lastOrder}/>;
        case "perfil": return <PerfilScreen go={go} user={user}/>;
        case "about": return <AboutScreen go={go} categories={publicCategories}/>;
        case "admin": return isAdmin ? <AdminScreen go={go} onProductsChange={loadProducts} onCategoriesChange={loadCategories} categories={categories} products={products}/> : <AuthScreen go={go} onLogin={setUser}/>;
        default: return <MobileHome go={go} addToCart={addToCart} products={publicProducts}/>;
      }
    }
    switch(route) {
      case "home": return <HomeScreen go={go} addToCart={addToCart} homeVariant={tweaks.homeVariant} products={publicProducts} categories={publicCategories}/>;
      case "catalogo":
      case "categoria": return <CatalogoScreen go={go} addToCart={addToCart} initialCat={routeData.cat} catalogoLayout={tweaks.catalogoLayout} products={publicProducts} categories={publicCategories}/>;
      case "buscador": return <CatalogoScreen go={go} addToCart={addToCart} catalogoLayout={tweaks.catalogoLayout} products={publicProducts} categories={publicCategories}/>;
      case "detalle": return <DetalleScreen go={go} addToCart={addToCart} productId={routeData.id} detalleVariant={tweaks.detalleVariant} products={publicProducts}/>;
      case "carrito": return <CarritoScreen go={go} cart={cart} updateQty={updateQty} removeItem={removeItem} cartVariant={tweaks.cartVariant}/>;
      case "auth": return <AuthScreen go={go} onLogin={setUser}/>;
      case "checkout": return <CheckoutScreen go={go} cart={cart} user={user}/>;
      case "pago": return <PagoScreen go={go} cart={cart} placeOrder={placeOrder}/>;
      case "confirmacion": return <ConfirmacionScreen go={go} lastOrder={lastOrder}/>;
      case "perfil": return <PerfilScreen go={go} user={user}/>;
      case "about": return <AboutScreen go={go} categories={publicCategories}/>;
      case "admin": return isAdmin ? <AdminScreen go={go} onProductsChange={loadProducts} onCategoriesChange={loadCategories} categories={categories} products={products}/> : <AuthScreen go={go} onLogin={setUser}/>;
      default: return <HomeScreen go={go} addToCart={addToCart} homeVariant={tweaks.homeVariant} products={publicProducts}/>;
    }
  };

  const content = isMobile ? (
    <div className="app-wrap mobile-wrap" style={{ padding: "0 16px", display: "flex", flexDirection: "column", minHeight: 824 }}>
      <MobileHeader route={route} go={go} user={user}/>
      <div style={{ flex: 1 }}>{renderScreen()}</div>
      <MobileTabBar route={route} go={go} cartCount={cartCount} user={user}/>
    </div>
  ) : (
    <div className="app-wrap" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
      <Nav route={route} go={go} cartCount={cartCount} user={user} isAdmin={isAdmin}/>
      {renderScreen()}
      <Footer go={go}/>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <div style={{ minHeight: "100vh", background: "var(--bg-alt)", padding: "20px 0" }}>
          <div className="frame-mobile-sim">{content}</div>
        </div>
      ) : content}

      {/* Tweaks toggle button */}
      <button
        onClick={() => setTweaksOpen(!tweaksOpen)}
        style={{
          position: "fixed", bottom: tweaksOpen ? 380 : 20, right: 20, zIndex: 101,
          background: "var(--anchor)", color: "#fff", border: "none", padding: "10px 16px",
          fontSize: 11, letterSpacing: 1,
          textTransform: "uppercase", cursor: "pointer", transition: "bottom .2s",
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        <Icon.spark size={14}/> Tweaks
      </button>

      {tweaksOpen && <TweaksPanel state={tweaks} setState={setTweaks} onClose={() => setTweaksOpen(false)}/>}
    </>
  );
}
