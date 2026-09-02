import { useState, useEffect } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../components/UI.jsx';
import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { PRODUCTS as SEED_PRODUCTS, CATEGORIES } from '../data.js';

// ─── Shared cost helpers (used by ProductsTab & CostosTab) ───────────

const DEFAULT_COSTS = {
  horaMaquina: 150,
  materiales: {
    "PLA": 80, "PLA+": 95, "PLA tranúlcido": 110,
    "PETG": 100, "TPU": 130, "Resina": 200,
  },
};

const parseGrams = (str = "") => parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;
const parseHours = (str = "") => parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;

const calcCosto = (p, costs) => {
  const grams = parseGrams(p.specs?.peso);
  const hours = parseHours(p.specs?.tiempo);
  const mat = p.specs?.material || "";
  const matKey = Object.keys(costs.materiales || {}).find(
    k => mat.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(mat.toLowerCase())
  );
  const costoPorGramo = matKey ? (costs.materiales[matKey] || 0) : 0;
  return grams * costoPorGramo + hours * (costs.horaMaquina || 0);
};

// ─── Admin Screen ───────────────────────────────────────────────
export function AdminScreen({ go, onProductsChange, onCategoriesChange, categories: propCategories = [], products: propProductsAll = [] }) {
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [costSettings, setCostSettings] = useState(DEFAULT_COSTS);

  // ─── Load data ──────────────────────────────────────────────
  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      const list = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      setProducts(list);
    } catch (err) { console.error(err); }
  };

  const loadUsers = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      setUsers(list);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const loadCosts = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "costos"));
        if (snap.exists()) setCostSettings(snap.data());
      } catch (e) { /* silently ignore, use defaults */ }
    };
    Promise.all([loadProducts(), loadUsers(), loadCosts()]).then(() => setLoading(false));
  }, []);

  // ─── Seed hardcoded products to Firestore ───────────────────
  const seedProducts = async () => {
    setMsg("Migrando productos...");
    try {
      for (const p of SEED_PRODUCTS) {
        await addDoc(collection(db, "products"), {
          ...p,
          stock: Math.floor(Math.random() * 20) + 5,
          createdAt: serverTimestamp(),
        });
      }
      await loadProducts();
      setMsg(`✓ ${SEED_PRODUCTS.length} productos migrados exitosamente.`);
      onProductsChange?.();
    } catch (err) {
      console.error(err);
      setMsg("Error al migrar: " + err.message);
    }
  };

  // ─── Delete product ─────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este producto?")) return;
    try {
      await deleteDoc(doc(db, "products", id));
      await loadProducts();
      setMsg("✓ Producto eliminado.");
      onProductsChange?.();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  };

  // ─── Save product (create or update) ────────────────────────
  const handleSave = async (data) => {
    try {
      if (data._id) {
        const { _id, ...rest } = data;
        await updateDoc(doc(db, "products", _id), rest);
        setMsg("✓ Producto actualizado.");
      } else {
        await addDoc(collection(db, "products"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        setMsg("✓ Producto creado.");
      }
      await loadProducts();
      setShowForm(false);
      setEditProduct(null);
      onProductsChange?.();
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  };

  // ─── Update user role ───────────────────────────────────────
  const toggleRole = async (userId, currentRole) => {
    const newRole = currentRole === "admin" ? "customer" : "admin";
    if (!confirm(`¿Cambiar rol a "${newRole}"?`)) return;
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      await loadUsers();
      setMsg(`✓ Rol actualizado a "${newRole}".`);
    } catch (err) {
      setMsg("Error: " + err.message);
    }
  };

  // ─── Sidebar nav items ──────────────────────────────────────
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <Icon.home size={16}/> },
    { id: "productos", label: "Productos", icon: <Icon.grid size={16}/> },
    { id: "categorias", label: "Categorías", icon: <Icon.layers size={16}/> },
    { id: "usuarios", label: "Usuarios", icon: <Icon.user size={16}/> },
    { id: "costos", label: "Costos", icon: <Icon.spark size={16}/> },
  ];

  if (loading) {
    return (
      <div style={{ padding: "80px 0", textAlign: "center", color: "var(--muted)" }}>
        Cargando backoffice...
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 0 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
            Backoffice
          </div>
          <h1 style={{ fontSize: 36, letterSpacing: -1, margin: 0, color: "var(--text)" }}>
            Panel de Administración
          </h1>
        </div>
        <TKButton variant="outline" onClick={() => go("home")} icon={<Icon.back size={16}/>}>
          Volver a la tienda
        </TKButton>
      </div>

      {/* Toast message */}
      {msg && (
        <div style={{
          padding: "12px 16px", marginBottom: 20,
          background: msg.startsWith("✓") ? "#4a7a5215" : "#c6413815",
          color: msg.startsWith("✓") ? "#4a7a52" : "#c64138",
          fontSize: 13, fontWeight: 600, borderRadius: 6,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          {msg}
          <button onClick={() => setMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><Icon.close size={14}/></button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 40 }} className="cart-layout">
        {/* Sidebar */}
        <aside>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => { setTab(n.id); setShowForm(false); }} style={{
                textAlign: "left", padding: "12px 14px",
                background: tab === n.id ? "var(--bg-alt)" : "transparent",
                border: "none",
                borderLeft: `2px solid ${tab === n.id ? "var(--accent)" : "transparent"}`,
                color: tab === n.id ? "var(--text)" : "var(--muted)",
                fontWeight: 600, fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
              }}>
                {n.icon} {n.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main>
          {tab === "dashboard" && <DashboardTab products={products} users={users} seedProducts={() => {}} categories={propCategories} onCategoriesChange={onCategoriesChange} onProductsChange={onProductsChange} setMsg={setMsg} />}
          {tab === "productos" && (
            showForm
              ? <ProductForm product={editProduct} onSave={handleSave} onCancel={() => { setShowForm(false); setEditProduct(null); }} categories={propCategories}/>
              : <ProductsTab products={products} costs={costSettings} onEdit={(p) => { setEditProduct(p); setShowForm(true); }} onDelete={handleDelete} onNew={() => { setEditProduct(null); setShowForm(true); }} onToggleVisible={async (p) => {
                  await updateDoc(doc(db, "products", p._id), { visible: p.visible === false ? true : false });
                  await loadProducts();
                  onProductsChange?.();
                }}/>
          )}
          {tab === "categorias" && <CategoriesTab categories={propCategories} products={products} onCategoriesChange={onCategoriesChange} setMsg={setMsg}/>}
          {tab === "usuarios" && <UsersTab users={users} onToggleRole={toggleRole} />}
          {tab === "costos" && <CostosTab products={products} setMsg={setMsg} />}
        </main>
      </div>
    </div>
  );
}

// ─── Dashboard Tab ───────────────────────────────────
function DashboardTab({ products, users, categories, onCategoriesChange, onProductsChange, setMsg }) {
  const stats = [
    { label: "Productos", value: products.length, color: "var(--accent)" },
    { label: "Visibles", value: products.filter(p => p.visible !== false).length, color: "#4a7a52" },
    { label: "Categorías", value: categories.length, color: "#B56B3E" },
    { label: "Usuarios", value: users.length, color: "#345C83" },
  ];
  return (
    <>
      <h2 style={{ fontSize: 28, margin: "0 0 24px" }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            padding: 20, background: "var(--bg-alt)", borderLeft: `3px solid ${s.color}`,
          }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 8 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, color: "var(--text)" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Products Table ─────────────────────────────────────
function ProductsTab({ products, costs = DEFAULT_COSTS, onEdit, onDelete, onNew, onToggleVisible }) {
  const [search, setSearch] = useState("");
  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.cat?.toLowerCase().includes(search.toLowerCase())
  );

  const COL = "50px 2fr 1fr 90px 90px 70px 80px 100px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Productos</h2>
        <TKButton onClick={onNew} icon={<Icon.plus size={14}/>}>Nuevo producto</TKButton>
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <TKInput placeholder="Buscar producto..." icon={<Icon.search size={16}/>} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
      </div>

      {/* Table container with horizontal scroll for mobile */}
      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 820 }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase",
            letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700,
          }}>
            <div>ID</div><div>Nombre</div><div>Categoría</div><div>Precio</div><div>Costo fab.</div><div>Stock</div><div>Visible</div><div>Acciones</div>
          </div>

          {filtered.map(p => {
            const costo = calcCosto(p, costs);
            const sinDatos = !p.specs?.peso && !p.specs?.tiempo;
            return (
              <div key={p._id} style={{
                display: "grid", gridTemplateColumns: COL,
                gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
                fontSize: 13, alignItems: "center",
                opacity: p.visible === false ? 0.5 : 1,
              }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {(p.id || "").toUpperCase().slice(0, 4)}
                </div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                    <TKPill>{p.cat}</TKPill>
                    {p.sub && <TKPill variant="outline">{p.sub}</TKPill>}
                  </div>
                </div>
                <div>{fmtARS(p.price || 0)}</div>
                <div style={{ fontSize: 12 }}>
                  {sinDatos
                    ? <span style={{ color: "var(--muted)" }}>—</span>
                    : <span style={{ color: "var(--text)", fontWeight: 600 }}>{fmtARS(costo)}</span>
                  }
                </div>
                <div style={{
                  fontSize: 12,
                  color: (p.stock || 0) < 5 ? "#c64138" : "var(--text)",
                  fontWeight: (p.stock || 0) < 5 ? 700 : 400,
                }}>
                  {p.stock ?? "—"}
                </div>
                {/* Visibility eye */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <button
                    onClick={() => onToggleVisible(p)}
                    title={p.visible === false ? "Oculto — clic para mostrar" : "Visible — clic para ocultar"}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: 4,
                      color: p.visible === false ? "#c64138" : "#4a7a52",
                      display: "flex", alignItems: "center",
                      transition: "color .2s",
                    }}
                  >
                    {p.visible === false ? <Icon.eyeOff size={16}/> : <Icon.eye size={16}/>}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => onEdit(p)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
                  <button onClick={() => onDelete(p._id)} style={{...actionBtn, color: "#c64138"}} title="Eliminar"><Icon.trash size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No se encontraron productos.
        </div>
      )}
    </>
  );
}

const actionBtn = {
  background: "none", border: "1px solid var(--line)", padding: "6px 8px",
  cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center",
  borderRadius: 4,
};

// ─── Product Form (Create / Edit) ─────────────────────────────
function ProductForm({ product, onSave, onCancel, categories = [] }) {
  // Normalize: existing products may have img (string) or images (array)
  const initImages = () => {
    if (product?.images?.length) return [...product.images, "", "", "", "", ""].slice(0, 5);
    if (product?.img) return [product.img, "", "", "", ""];
    return ["", "", "", "", ""];
  };

  const [form, setForm] = useState({
    id: product?.id || "",
    name: product?.name || "",
    cat: product?.cat || (categories[0]?.id || "casa"),
    sub: product?.sub || "",
    price: product?.price || 0,
    desc: product?.desc || "",
    tag: product?.tag || "",
    stock: product?.stock || 0,
    visible: product?.visible !== false,
    specs: product?.specs || { material: "", tiempo: "", peso: "" },
  });
  const [images, setImages] = useState(initImages);

  const up = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const upSpec = (key, val) => setForm(f => ({ ...f, specs: { ...f.specs, [key]: val } }));
  const upImg = (i, val) => setImages(imgs => imgs.map((v, j) => j === i ? val : v));

  const currentCat = (categories.length ? categories : []).find(c => c.id === form.cat);
  const mainImg = images.find(u => u.trim()) || "";

  const handleSubmit = () => {
    if (!form.name.trim()) return alert("El nombre es obligatorio.");
    if (!form.price || form.price <= 0) return alert("El precio debe ser mayor a 0.");
    const cleanImages = images.filter(u => u.trim());
    const data = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock),
      visible: form.visible,
      images: cleanImages,
      img: cleanImages[0] || "",
    };
    if (product?._id) data._id = product._id;
    onSave(data);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>
          {product?._id ? "Editar producto" : "Nuevo producto"}
        </h2>
        <TKButton variant="ghost" onClick={onCancel} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 40, alignItems: "start" }} className="form-layout">
        {/* ── Left: fields ── */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <TKInput label="ID producto" value={form.id} onChange={e => up("id", e.target.value)} placeholder="p17" />
            <TKInput label="Nombre" value={form.name} onChange={e => up("name", e.target.value)} placeholder="Organizador..." />

            <div>
              <div style={labelStyle}>Categoría</div>
              <select value={form.cat} onChange={e => { up("cat", e.target.value); up("sub", ""); }} style={selectStyle}>
                {(categories.length ? categories : []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Subcategoría</div>
              <select value={form.sub} onChange={e => up("sub", e.target.value)} style={selectStyle}>
                <option value="">Seleccionar...</option>
                {currentCat?.subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <TKInput label="Precio (ARS)" type="number" value={form.price} onChange={e => up("price", e.target.value)} />
            <TKInput label="Stock" type="number" value={form.stock} onChange={e => up("stock", e.target.value)} />

            <div style={{ gridColumn: "1 / -1" }}>
              <TKInput label="Descripción" value={form.desc} onChange={e => up("desc", e.target.value)} placeholder="Descripción del producto..." />
            </div>

            <div>
              <div style={labelStyle}>Tag</div>
              <select value={form.tag} onChange={e => up("tag", e.target.value)} style={selectStyle}>
                <option value="">Sin tag</option>
                <option value="Best seller">Best seller</option>
                <option value="Nuevo">Nuevo</option>
                <option value="Premium">Premium</option>
              </select>
            </div>

            {/* Visible toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, gridColumn: "1 / -1", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <input
                id="visible-check"
                type="checkbox"
                checked={form.visible}
                onChange={e => up("visible", e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <label htmlFor="visible-check" style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                Visible en el catálogo
              </label>
              {!form.visible && <span style={{ fontSize: 12, color: "#c64138",  }}>OCULTO</span>}
            </div>
          </div>

          {/* Specs */}
          <div style={{ marginBottom: 16 }}>
            <div style={{...labelStyle, marginBottom: 12}}>Especificaciones</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <TKInput label="Material" value={form.specs.material} onChange={e => upSpec("material", e.target.value)} placeholder="PLA" />
              <TKInput label="Tiempo impresión" value={form.specs.tiempo} onChange={e => upSpec("tiempo", e.target.value)} placeholder="8h" />
              <TKInput label="Peso" value={form.specs.peso} onChange={e => upSpec("peso", e.target.value)} placeholder="180g" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <TKButton onClick={handleSubmit}>
              {product?._id ? "Guardar cambios" : "Crear producto"}
            </TKButton>
            <TKButton variant="outline" onClick={onCancel}>Cancelar</TKButton>
          </div>
        </div>

        {/* ── Right: images + preview ── */}
        <div>
          {/* Instructions */}
          <div style={{ padding: "10px 12px", background: "#345C8310", borderLeft: "3px solid var(--accent)", marginBottom: 16, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text)" }}>Cómo usar imgbb:</strong><br/>
            1. Subí la imagen en <a href="https://imgbb.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>imgbb.com</a><br/>
            2. En los resultados, copiá el <strong>"Direct link"</strong> (termina en .jpg, .png, etc.)<br/>
            3. Pegá esa URL en el campo. La preview se actualiza al instante.
          </div>

          {/* 4 image slots */}
          <div style={{...labelStyle, marginBottom: 10}}>Imágenes — 1 principal + 4 secundarias</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {images.map((url, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {/* Thumbnail */}
                <div style={{
                  width: 52, height: 52, flexShrink: 0,
                  background: "var(--bg-alt)", border: `1px solid ${i === 0 ? "var(--accent)" : "var(--line)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", position: "relative",
                }}>
                  {url.trim() ? (
                    <img
                      src={url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                    />
                  ) : null}
                  <div style={{
                    display: url.trim() ? "none" : "flex",
                    alignItems: "center", justifyContent: "center",
                    width: "100%", height: "100%",
                    color: i === 0 ? "var(--accent)" : "var(--muted)", fontSize: 9,
                    fontWeight: 700,
                  }}>
                    {i === 0 ? "MAIN" : `SEC ${i}`}
                  </div>
                </div>

                {/* URL input */}
                <input
                  value={url}
                  onChange={e => upImg(i, e.target.value)}
                  placeholder={i === 0 ? "URL imagen principal (obligatoria)..." : `URL secundaria ${i} (opcional)...`}
                  style={{
                    flex: 1, padding: "10px 12px", background: "var(--bg)",
                    border: "1px solid var(--line)",
                    fontSize: 12, color: "var(--text)", borderRadius: 4, outline: "none",
                    borderColor: url.trim() ? "var(--accent)" : "var(--line)",
                  }}
                />

                {/* Clear */}
                {url.trim() && (
                  <button onClick={() => upImg(i, "")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
                    <Icon.close size={12}/>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Live preview card */}
          <div style={{ marginTop: 20 }}>
            <div style={{...labelStyle, marginBottom: 10}}>Vista previa en catálogo</div>
            <PreviewCard
              name={form.name || "Nombre del producto"}
              price={Number(form.price) || 0}
              tag={form.tag || null}
              sub={form.sub || ""}
              img={mainImg}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Catalog Preview Card (no buttons, no blend mode) ─────────────
function PreviewCard({ name, price, tag, sub, img }) {
  return (
    <div style={{
      background: "var(--bg-alt)", maxWidth: 240,
      border: "1px solid var(--line)",
    }}>
      {/* Image area */}
      <div style={{
        aspectRatio: "4/3", background: "var(--beige)",
        position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {img ? (
          <img
            src={img}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 11, textAlign: "center" }}>
            <Icon.layers size={24}/><br/>Sin imagen
          </div>
        )}
        {tag && (
          <div style={{
            position: "absolute", top: 10, left: 10,
            background: "var(--anchor)", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "3px 8px",
            letterSpacing: 1,
          }}>{tag.toUpperCase()}</div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: "12px 14px" }}>
        {sub && <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, marginBottom: 4 }}>{sub.toUpperCase()}</div>}
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 6, lineHeight: 1.3 }}>{name}</div>
        <div style={{ fontSize: 18, color: "var(--accent)" }}>{fmtARS(price)}</div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: "var(--muted)",
};

const selectStyle = {
  width: "100%", padding: "12px 14px", background: "var(--bg)",
  border: "1px solid var(--line)",
  fontSize: 14, color: "var(--text)", borderRadius: 4, outline: "none",
};

// ─── Users Table ──────────────────────────────────────────────
function UsersTab({ users, onToggleRole }) {
  return (
    <>
      <h2 style={{ fontSize: 28, margin: "0 0 24px" }}>Usuarios</h2>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12,  }}>
        {users.length} usuario{users.length !== 1 ? "s" : ""} registrado{users.length !== 1 ? "s" : ""}
      </div>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 1.5fr 100px 120px",
        gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
        fontSize: 10, textTransform: "uppercase",
        letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700,
      }}>
        <div>Nombre</div><div>Email</div><div>Rol</div><div>Acciones</div>
      </div>

      {users.map(u => (
        <div key={u._id} style={{
          display: "grid", gridTemplateColumns: "2fr 1.5fr 100px 120px",
          gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
          fontSize: 13, alignItems: "center",
        }}>
          <div style={{ fontWeight: 600 }}>{u.nombre || "—"}</div>
          <div style={{ color: "var(--muted)" }}>{u.email}</div>
          <div>
            <TKPill variant={u.role === "admin" ? "accent" : "outline"}>
              {u.role || "customer"}
            </TKPill>
          </div>
          <div>
            <button onClick={() => onToggleRole(u._id, u.role)} style={actionBtn}>
              {u.role === "admin" ? "Quitar admin" : "Hacer admin"}
            </button>
          </div>
        </div>
      ))}

      {users.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No hay usuarios registrados.
        </div>
      )}
    </>
  );
}

// ─── Categories Tab ─────────────────────────────────────────────
function CategoriesTab({ categories, products, onCategoriesChange, setMsg }) {
  const [editingCat, setEditingCat] = useState(null);   // { _id, id, name, subs, order } or null=new
  const [catForm, setCatForm] = useState({ id: "", name: "" });
  const [showCatForm, setShowCatForm] = useState(false);

  const [editingSub, setEditingSub] = useState(null);   // { catId, oldName } or null=new
  const [subForm, setSubForm] = useState({ name: "" });
  const [expandedCat, setExpandedCat] = useState(null);

  // ── Category CRUD ─────────────────────────────────────────────
  const openNewCat = () => {
    setEditingCat(null);
    setCatForm({ id: "", name: "" });
    setShowCatForm(true);
  };
  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({ id: cat.id, name: cat.name });
    setShowCatForm(true);
  };
  const saveCat = async () => {
    if (!catForm.id.trim() || !catForm.name.trim()) return alert("ID y nombre son obligatorios.");
    try {
      if (editingCat?._id) {
        await updateDoc(doc(db, "categories", editingCat._id), { id: catForm.id, name: catForm.name });
        setMsg("✓ Categoría actualizada.");
      } else {
        await addDoc(collection(db, "categories"), { id: catForm.id, name: catForm.name, subs: [], order: categories.length });
        setMsg("✓ Categoría creada.");
      }
      onCategoriesChange?.();
      setShowCatForm(false);
    } catch (err) { setMsg("Error: " + err.message); }
  };
  const deleteCat = async (cat) => {
    const hasProducts = products.some(p => p.cat === cat.id);
    if (hasProducts) return alert(`No se puede eliminar "${cat.name}" porque tiene productos asociados.`);
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      await deleteDoc(doc(db, "categories", cat._id));
      setMsg("✓ Categoría eliminada.");
      onCategoriesChange?.();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  // ── Subcategory CRUD ──────────────────────────────────────────
  const openNewSub = (cat) => {
    setEditingSub({ catId: cat.id, cat, oldName: null });
    setSubForm({ name: "" });
  };
  const openEditSub = (cat, subName) => {
    setEditingSub({ catId: cat.id, cat, oldName: subName });
    setSubForm({ name: subName });
  };
  const saveSub = async () => {
    if (!subForm.name.trim()) return alert("El nombre de la subcategoría es obligatorio.");
    const cat = editingSub.cat;
    let newSubs = [...(cat.subs || [])];
    if (editingSub.oldName) {
      newSubs = newSubs.map(s => s === editingSub.oldName ? subForm.name : s);
    } else {
      if (newSubs.includes(subForm.name)) return alert("Ya existe esa subcategoría.");
      newSubs.push(subForm.name);
    }
    try {
      await updateDoc(doc(db, "categories", cat._id), { subs: newSubs });
      setMsg(`✓ Subcategoría ${editingSub.oldName ? "editada" : "creada"}.`);
      onCategoriesChange?.();
      setEditingSub(null);
    } catch (err) { setMsg("Error: " + err.message); }
  };
  const deleteSub = async (cat, subName) => {
    const hasProducts = products.some(p => p.cat === cat.id && p.sub === subName);
    if (hasProducts) return alert(`No se puede eliminar "${subName}" porque tiene productos asociados.`);
    if (!confirm(`¿Eliminar la subcategoría "${subName}" de "${cat.name}"?`)) return;
    try {
      const newSubs = (cat.subs || []).filter(s => s !== subName);
      await updateDoc(doc(db, "categories", cat._id), { subs: newSubs });
      setMsg("✓ Subcategoría eliminada.");
      onCategoriesChange?.();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const toggleCatVisibility = async (cat) => {
    try {
      await updateDoc(doc(db, "categories", cat._id), { visible: cat.visible === false ? true : false });
      setMsg(`✓ Categoría ${cat.visible === false ? "visible" : "oculta"}.`);
      onCategoriesChange?.();
    } catch(err) { setMsg("Error: " + err.message); }
  };

  const toggleSubVisibility = async (cat, subName) => {
    const isHidden = (cat.hiddenSubs || []).includes(subName);
    const newHidden = isHidden
      ? (cat.hiddenSubs || []).filter(s => s !== subName)
      : [...(cat.hiddenSubs || []), subName];
    try {
      await updateDoc(doc(db, "categories", cat._id), { hiddenSubs: newHidden });
      setMsg(`✓ Subcategoría ${isHidden ? "visible" : "oculta"}.`);
      onCategoriesChange?.();
    } catch(err) { setMsg("Error: " + err.message); }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Categorías</h2>
        <TKButton onClick={openNewCat} icon={<Icon.plus size={14}/>}>Nueva categoría</TKButton>
      </div>

      {/* Category form modal */}
      {showCatForm && (
        <div style={{ padding: 20, background: "var(--bg-alt)", border: "1px solid var(--line)", marginBottom: 20 }}>
          <div style={{ fontSize: 18, marginBottom: 16 }}>
            {editingCat ? "Editar categoría" : "Nueva categoría"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="form-layout">
            <TKInput label="ID (sin espacios)" value={catForm.id} onChange={e => setCatForm(f => ({...f, id: e.target.value.toLowerCase().replace(/\s+/g, "-")}))} placeholder="lamparas" />
            <TKInput label="Nombre visible" value={catForm.name} onChange={e => setCatForm(f => ({...f, name: e.target.value}))} placeholder="Lámparas" />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <TKButton onClick={saveCat}>{editingCat ? "Guardar cambios" : "Crear"}</TKButton>
            <TKButton variant="outline" onClick={() => setShowCatForm(false)}>Cancelar</TKButton>
          </div>
        </div>
      )}

      {/* Category tree */}
      {categories.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No hay categorías. Migrá las categorías iniciales desde el Dashboard.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {categories.map(cat => (
          <div key={cat._id || cat.id} style={{ border: "1px solid var(--line)", background: "var(--bg-alt)", opacity: cat.visible === false ? 0.6 : 1 }}>
            {/* Category row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
              <button onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0, display: "flex", fontSize: 16, transition: "transform .2s", transform: expandedCat === cat.id ? "rotate(90deg)" : "rotate(0deg)" }}>
                ›
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", textDecoration: cat.visible === false ? "line-through" : "none" }}>{cat.name}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  ID: {cat.id} · {(cat.subs || []).length} subcategorías · {products.filter(p => p.cat === cat.id).length} productos
                </div>
              </div>
              <button onClick={() => toggleCatVisibility(cat)} style={{...actionBtn, color: cat.visible === false ? "#c64138" : "#4a7a52"}} title={cat.visible === false ? "Oculta — clic para mostrar" : "Visible — clic para ocultar"}>
                {cat.visible === false ? <Icon.eyeOff size={14}/> : <Icon.eye size={14}/>}
              </button>
              <button onClick={() => openEditCat(cat)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
              <button onClick={() => deleteCat(cat)} style={{...actionBtn, color: "#c64138"}} title="Eliminar"><Icon.trash size={14}/></button>
            </div>

            {/* Subcategories (expanded) */}
            {expandedCat === cat.id && (
              <div style={{ borderTop: "1px solid var(--line)", padding: "8px 16px 16px 40px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, marginTop: 8 }}>
                  SUBCATEGORÍAS
                </div>

                {/* Subcategory inline form */}
                {editingSub?.catId === cat.id && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 12, padding: 12, background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <div style={{ flex: 1 }}>
                      <TKInput label={editingSub.oldName ? "Editar subcategoría" : "Nueva subcategoría"} value={subForm.name} onChange={e => setSubForm({ name: e.target.value })} placeholder="Nombre..."/>
                    </div>
                    <TKButton onClick={saveSub}>{editingSub.oldName ? "Guardar" : "Agregar"}</TKButton>
                    <TKButton variant="outline" onClick={() => setEditingSub(null)}>Cancelar</TKButton>
                  </div>
                )}

                {(cat.subs || []).map(sub => {
                  const prodCount = products.filter(p => p.cat === cat.id && p.sub === sub).length;
                  const isHidden = (cat.hiddenSubs || []).includes(sub);
                  return (
                    <div key={sub} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", opacity: isHidden ? 0.6 : 1 }}>
                      <div style={{ flex: 1, fontSize: 13, textDecoration: isHidden ? "line-through" : "none" }}>
                        {sub}
                        <span style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)", textDecoration: "none" }}>
                          ({prodCount} {prodCount === 1 ? "producto" : "productos"})
                        </span>
                      </div>
                      <button onClick={() => toggleSubVisibility(cat, sub)} style={{...actionBtn, color: isHidden ? "#c64138" : "#4a7a52"}} title={isHidden ? "Oculta — clic para mostrar" : "Visible — clic para ocultar"}>
                        {isHidden ? <Icon.eyeOff size={13}/> : <Icon.eye size={13}/>}
                      </button>
                      <button onClick={() => openEditSub(cat, sub)} style={actionBtn} title="Editar"><Icon.spark size={13}/></button>
                      <button onClick={() => deleteSub(cat, sub)}
                        style={{...actionBtn, color: prodCount > 0 ? "var(--muted)" : "#c64138", cursor: prodCount > 0 ? "not-allowed" : "pointer"}}
                        title={prodCount > 0 ? "Tiene productos, no se puede eliminar" : "Eliminar"}>
                        <Icon.trash size={13}/>
                      </button>
                    </div>
                  );
                })}

                {(cat.subs || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>Sin subcategorías.</div>
                )}

                <button onClick={() => openNewSub(cat)} style={{
                  marginTop: 10, background: "none", border: "1px dashed var(--line-strong)",
                  padding: "8px 14px", cursor: "pointer", color: "var(--muted)",
                  fontSize: 12, display: "flex", alignItems: "center", gap: 6,
                }}>
                  <Icon.plus size={12}/> Agregar subcategoría
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Costos Tab ──────────────────────────────────────────────────
function CostosTab({ products, setMsg }) {
  const [costs, setCosts] = useState(DEFAULT_COSTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMat, setNewMat] = useState("");

  // Load from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "costos"));
        if (snap.exists()) setCosts(snap.data());
      } catch (e) { console.warn("No se pudieron cargar costos:", e); }
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "costos"), costs);
      setMsg("✓ Costos guardados correctamente.");
    } catch (e) {
      setMsg("Error al guardar: " + e.message);
    }
    setSaving(false);
  };

  const upMat = (mat, val) => setCosts(c => ({
    ...c,
    materiales: { ...c.materiales, [mat]: parseFloat(val) || 0 },
  }));

  const addMaterial = () => {
    const name = newMat.trim();
    if (!name) return;
    if (costs.materiales[name] !== undefined) return alert("Ese material ya existe.");
    setCosts(c => ({ ...c, materiales: { ...c.materiales, [name]: 0 } }));
    setNewMat("");
  };

  const removeMaterial = (mat) => {
    const updated = { ...costs.materiales };
    delete updated[mat];
    setCosts(c => ({ ...c, materiales: updated }));
  };

  // uses module-level calcCosto(p, costs)

  const rows = products
    .filter(p => p.visible !== false)
    .map(p => {
      const costo = calcCosto(p, costs);
      const precio = p.price || 0;
      const ganancia = precio - costo;
      const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
      return { ...p, costo, ganancia, margen };
    })
    .sort((a, b) => a.margen - b.margen); // worst margin first

  if (loading) return <div style={{ padding: 40, color: "var(--muted)" }}>Cargando configuración...</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Costos de Fabricación</h2>
        <TKButton onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Guardar configuración"}
        </TKButton>
      </div>

      {/* ── Config section ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 40, alignItems: "start" }} className="form-layout">

        {/* Costo máquina */}
        <div style={{ padding: 24, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 16 }}>
            Operación de impresora
          </div>
          <TKInput
            label="Costo por hora de máquina (ARS)"
            type="number"
            value={costs.horaMaquina}
            onChange={e => setCosts(c => ({ ...c, horaMaquina: parseFloat(e.target.value) || 0 }))}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
            Incluye consumo eléctrico, amortización de equipo y mantenimiento por hora de impresión.
          </div>
        </div>

        {/* Materiales */}
        <div style={{ padding: 24, background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 16 }}>
            Costo por gramo de material (ARS/g)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(costs.materiales).map(([mat, val]) => (
              <div key={mat} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{mat}</div>
                <div style={{ width: 120 }}>
                  <TKInput
                    type="number"
                    value={val}
                    onChange={e => upMat(mat, e.target.value)}
                  />
                </div>
                <button
                  onClick={() => removeMaterial(mat)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
                  title="Eliminar material"
                >
                  <Icon.trash size={14}/>
                </button>
              </div>
            ))}

            {/* Add new material */}
            <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: 1 }}>
                <TKInput
                  placeholder="Nuevo material..."
                  value={newMat}
                  onChange={e => setNewMat(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addMaterial()}
                />
              </div>
              <TKButton variant="outline" onClick={addMaterial} icon={<Icon.plus size={14}/>}>Agregar</TKButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rentabilidad por producto ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
          Rentabilidad por producto
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          Ordenado de menor a mayor margen. Costos calculados con la configuración actual.
        </div>
      </div>

      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 820 }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 80px 80px 90px 100px 100px 90px",
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Producto</div>
            <div>Material</div>
            <div>Peso</div>
            <div>Tiempo</div>
            <div>Costo fab.</div>
            <div>Precio venta</div>
            <div>Ganancia</div>
          </div>

          {rows.map(p => {
            const sinDatos = !p.specs?.peso && !p.specs?.tiempo;
            const margenColor = p.margen < 0 ? "#c64138" : p.margen < 30 ? "#B56B3E" : "#4a7a52";
            return (
              <div key={p._id || p.id} style={{
                display: "grid",
                gridTemplateColumns: "2fr 80px 80px 90px 100px 100px 90px",
                gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
                fontSize: 13, alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{p.cat} · {p.sub}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.specs?.material || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.specs?.peso || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.specs?.tiempo || "—"}</div>
                <div style={{ fontWeight: 600 }}>
                  {sinDatos
                    ? <span style={{ color: "var(--muted)", fontSize: 11 }}>Sin datos</span>
                    : fmtARS(p.costo)
                  }
                </div>
                <div style={{ fontWeight: 600 }}>{fmtARS(p.price || 0)}</div>
                <div>
                  {sinDatos ? (
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 700, color: margenColor }}>
                        {fmtARS(p.ganancia)}
                      </div>
                      <div style={{
                        display: "inline-block", marginTop: 3,
                        padding: "2px 7px", borderRadius: 2,
                        background: margenColor + "18",
                        color: margenColor, fontSize: 11, fontWeight: 700,
                      }}>
                        {p.margen.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              No hay productos visibles para analizar.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
