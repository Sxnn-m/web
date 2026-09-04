import { useState, useEffect, useMemo } from 'react';
import './index.css';
import { PRODUCTS as FALLBACK_PRODUCTS, CATEGORIES as FALLBACK_CATEGORIES, CONTACT } from './data.js';
import { TKLogo, Icon } from './components/UI.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { CatalogoScreen } from './screens/CatalogoScreen.jsx';
import { DetalleScreen } from './screens/DetalleScreen.jsx';
import { AuthScreen } from './screens/AuthScreen.jsx';
import { AboutScreen } from './screens/AboutScreen.jsx';
import { AdminScreen } from './screens/AdminScreen.jsx';
import { MobileHome, MobileCatalogoHub, MobileCategoria, MobileBuscador, MobileTabBar, MobileHeader } from './screens/mobile/MobileScreens.jsx';
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

function Nav({ route, go, user, isAdmin }) {
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
          <a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer" style={iconBtn} title="Seguinos en Instagram">
            <Icon.ig/>
          </a>
          <button onClick={() => go(user ? "admin" : "auth")} style={{ ...iconBtn, gap: 7 }} title="Acceso backoffice">
            <Icon.user/>
          </button>
          <button className="nav-mobile" onClick={() => setOpen(!open)} style={{...iconBtn, display: "none"}}>
            {open ? <Icon.close/> : <Icon.menu/>}
          </button>
        </div>
      </nav>

      {open && (
        <div style={{ padding: "16px 0", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
          {[["catalogo","Catálogo"],["about","Sobre nosotros"], ...(isAdmin ? [["admin","Backoffice"]] : [])].map(([r,l]) => (
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
            Impresión 3D diseñada y producida en Buenos Aires. Precisión, calidad y productos que se usan.
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
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>Contacto</div>
          <a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--text)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}><Icon.ig size={14}/> @{CONTACT.instagramHandle}</a>
          <a href="mailto:tk.prints.ok@hotmail.com" style={{ fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}><Icon.mail size={14}/> tk.prints.ok@hotmail.com</a>
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

export default function App() {
  const [route, setRoute] = useState("home");
  const [routeData, setRouteData] = useState({});
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
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

  // El panel de Tweaks escribía acá data-theme y --accent en <html>. Ya no
  // hace falta: index.css define el tema claro en :root y --accent: var(--azul),
  // que es exactamente el valor que el panel seteaba. El tema oscuro sigue
  // definido en [data-theme="dark"] por si algún día se ofrece de verdad.

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

  // Reemplaza el viejo "agregar al carrito": lleva la consulta del producto a Instagram DM
  const addToCart = (product) => {
    const toast = document.createElement("div");
    toast.textContent = `Te llevamos a Instagram — @${CONTACT.instagramHandle}`;
    toast.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--anchor);color:#fff;padding:12px 20px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.2)";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
    window.open(CONTACT.instagramDmUrl, "_blank", "noopener,noreferrer");
  };

  // El sitio siempre renderiza el árbol desktop, que se adapta por media
  // queries en index.css. El árbol de MobileScreens era un simulador de
  // teléfono que solo se alcanzaba desde el panel de Tweaks: sin el panel,
  // nunca se activaba en producción. Se deja el código por si más adelante se
  // conecta a una detección real de dispositivo.
  const isMobile = false;

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
        case "catalogo": return <MobileCatalogoHub go={go} products={publicProducts} categories={publicCategories}/>;
        case "categoria": return <MobileCategoria go={go} addToCart={addToCart} cat={routeData.cat} products={publicProducts} categories={publicCategories}/>;
        case "buscador": return <MobileBuscador go={go} addToCart={addToCart} products={publicProducts}/>;
        case "detalle": return <DetalleScreen go={go} addToCart={addToCart} productId={routeData.id} products={publicProducts}/>;
        case "auth": return <AuthScreen go={go} onLogin={setUser}/>;
        case "about": return <AboutScreen go={go} categories={publicCategories}/>;
        case "admin": return isAdmin ? <AdminScreen go={go} onProductsChange={loadProducts} onCategoriesChange={loadCategories} categories={categories} products={products}/> : <AuthScreen go={go} onLogin={setUser}/>;
        default: return <MobileHome go={go} addToCart={addToCart} products={publicProducts}/>;
      }
    }
    switch(route) {
      case "home": return <HomeScreen go={go} addToCart={addToCart} products={publicProducts} categories={publicCategories}/>;
      case "catalogo":
      case "categoria": return <CatalogoScreen go={go} addToCart={addToCart} initialCat={routeData.cat} products={publicProducts} categories={publicCategories}/>;
      case "buscador": return <CatalogoScreen go={go} addToCart={addToCart} products={publicProducts} categories={publicCategories}/>;
      case "detalle": return <DetalleScreen go={go} addToCart={addToCart} productId={routeData.id} products={publicProducts}/>;
      case "auth": return <AuthScreen go={go} onLogin={setUser}/>;
      case "about": return <AboutScreen go={go} categories={publicCategories}/>;
      case "admin": return isAdmin ? <AdminScreen go={go} onProductsChange={loadProducts} onCategoriesChange={loadCategories} categories={categories} products={products}/> : <AuthScreen go={go} onLogin={setUser}/>;
      default: return <HomeScreen go={go} addToCart={addToCart} products={publicProducts}/>;
    }
  };

  const content = isMobile ? (
    <div className="app-wrap mobile-wrap" style={{ padding: "0 16px", display: "flex", flexDirection: "column", minHeight: 824 }}>
      <MobileHeader route={route} go={go} user={user}/>
      <div style={{ flex: 1 }}>{renderScreen()}</div>
      <MobileTabBar route={route} go={go} user={user}/>
    </div>
  ) : (
    <div className="app-wrap" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
      <Nav route={route} go={go} user={user} isAdmin={isAdmin}/>
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

      {/* Botón flotante de Instagram */}
      <a
        href={CONTACT.instagramDmUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Escribinos por Instagram — @${CONTACT.instagramHandle}`}
        style={{
          position: "fixed", bottom: 20, left: 20, zIndex: 101,
          width: 52, height: 52, borderRadius: "50%",
          background: "var(--accent)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)", textDecoration: "none",
        }}
      >
        <Icon.ig size={24}/>
      </a>

    </>
  );
}
