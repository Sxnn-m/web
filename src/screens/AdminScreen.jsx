import { useState, useEffect, useMemo } from 'react';
import { TKButton, TKInput, TKPill, Icon, fmtARS } from '../components/UI.jsx';
import { db } from '../firebase.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  getDoc, setDoc, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { PRODUCTS as SEED_PRODUCTS, CATEGORIES } from '../data.js';
import { InventarioTab } from './admin/InventarioTab.jsx';
import { PedidosTab } from './admin/PedidosTab.jsx';
import {
  calcularDisponibilidad, motivoFaltante, motivoFaltanteInsumo,
  FACTOR_DISPONIBILIDAD, specsDesdeReceta,
} from '../lib/disponibilidad.js';
import { cargarInsumos } from '../lib/insumos.js';
import {
  cargarPersonalizadosCompletos, guardarPersonalizado, eliminarPersonalizado,
} from '../lib/personalizados.js';
import { InsumosTab } from './admin/InsumosTab.jsx';
import { EstadisticasTab } from './admin/EstadisticasTab.jsx';
import {
  cargarFilamentos, cargarPedidos, recalcularDisponibilidad,
} from '../lib/inventario.js';
import {
  cargarPrivados, guardarPrivado, enriquecerProductos, migrarDatosPrivados,
  CAMPOS_PRIVADOS,
} from '../lib/productosPrivados.js';
import {
  DEFAULT_COSTS, MARGEN_MATERIAL, calcularRentabilidad, calcularPrecioSugerido,
  filasDeRentabilidad,
} from '../lib/costos.js';
import {
  tiempoDeProducto, specsDeTiempo, formatTiempo, formatTiempoProducto,
} from '../lib/tiempoImpresion.js';
import { siguienteIdProducto, idsDuplicados, planDeRenumeracion } from '../lib/idsProducto.js';
import { aplicarRenumeracionIds } from '../lib/migracionIds.js';

// La fórmula de costo/precio/ganancia vive en src/lib/costos.js: una sola
// implementación para la tabla de Rentabilidad y para la columna "Costo fab.".

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
  const [filamentos, setFilamentos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [personalizados, setPersonalizados] = useState([]);
  const [editPersonalizado, setEditPersonalizado] = useState(null);
  const [showFormPers, setShowFormPers] = useState(false);
  const [privados, setPrivados] = useState({});
  // Productos cuyo tiempo de impresión viejo no se pudo parsear: hay que
  // cargarlos a mano.
  const [tiemposIlegibles, setTiemposIlegibles] = useState([]);

  // ─── Load data ──────────────────────────────────────────────
  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      const list = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      setProducts(list);
      return list;
    } catch (err) { console.error(err); return []; }
  };

  // receta / origenUrl / notas viven en products/{id}/privado/data
  const loadPrivados = async (lista) => {
    try {
      const mapa = await cargarPrivados(lista || products);
      setPrivados(mapa);
      return mapa;
    } catch (err) { console.error(err); return {}; }
  };

  /**
   * Productos + sus datos privados. Todo lo que necesite la receta
   * (disponibilidad, plan de consumo de un pedido, formulario) usa ESTA
   * lista; el doc público de "products" ya no la tiene.
   */
  const productosFull = useMemo(
    () => enriquecerProductos(products, privados),
    [products, privados]
  );

  const loadFilamentos = async () => {
    try {
      const list = await cargarFilamentos();
      setFilamentos(list);
      return list;
    } catch (err) { console.error(err); return []; }
  };

  const loadInsumos = async () => {
    try {
      const list = await cargarInsumos();
      setInsumos(list);
      return list;
    } catch (err) { console.error(err); return []; }
  };

  const loadPersonalizados = async () => {
    try {
      const list = await cargarPersonalizadosCompletos();
      setPersonalizados(list);
      return list;
    } catch (err) { console.error(err); return []; }
  };

  // ─── Personalizados: alta/edición/borrado ───────────────────
  const handleSavePersonalizado = async (data) => {
    try {
      await guardarPersonalizado(data);
      setMsg(data._id ? "✓ Personalizado actualizado." : "✓ Personalizado creado.");
      await loadPersonalizados();
      setShowFormPers(false);
      setEditPersonalizado(null);
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const handleDeletePersonalizado = async (p) => {
    if (!confirm(`¿Eliminar el personalizado "${p.name}" de ${p.clienteNombre || "—"}?`)) return;
    try {
      await eliminarPersonalizado(p._id);
      setMsg("✓ Personalizado eliminado.");
      await loadPersonalizados();
    } catch (err) { setMsg("Error: " + err.message); }
  };

  const loadPedidos = async () => {
    try {
      const list = await cargarPedidos();
      setPedidos(list);
      return list;
    } catch (err) { console.error(err); return []; }
  };

  /**
   * Punto único donde el catálogo público se entera de un cambio de stock:
   * recalcula el booleano "disponible" de cada producto y lo persiste.
   * Recibe siempre productos ya enriquecidos con su receta privada.
   */
  const sincronizarDisponibilidad = async (prodsFull, films, insus) => {
    try {
      const resultado = await recalcularDisponibilidad(prodsFull, films, insus);
      if (resultado.actualizados > 0) {
        await loadProducts();
        onProductsChange?.();
      }
      return resultado;
    } catch (err) {
      console.error(err);
      setMsg("Error al recalcular: " + err.message);
      return {
        actualizados: 0, disponibilidadActualizada: 0, specsActualizadas: 0,
        tiemposMigrados: 0, tiemposIlegibles: [],
      };
    }
  };

  /** Recarga productos + recetas privadas + inventario y devuelve todo fresco. */
  const recargarTodo = async () => {
    const [prods, films, insus] = await Promise.all([
      loadProducts(), loadFilamentos(), loadInsumos(),
    ]);
    const privs = await loadPrivados(prods);
    return { prodsFull: enriquecerProductos(prods, privs), films, insus };
  };

  // Inventario cambió (alta/edición de filamento o restock) → recalcular productos
  const handleInventarioChange = async () => {
    const { prodsFull, films, insus } = await recargarTodo();
    await sincronizarDisponibilidad(prodsFull, films, insus);
  };

  // Botón manual: recalcula desde la receta todo lo derivado — disponibilidad
  // y specs.material / specs.peso — sobre el catálogo completo.
  const handleRecalcular = async () => {
    setMsg("Recalculando desde las recetas...");
    const { prodsFull, films, insus } = await recargarTodo();
    const { disponibilidadActualizada, specsActualizadas, tiemposMigrados, tiemposIlegibles } =
      await sincronizarDisponibilidad(prodsFull, films, insus);
    const sinReceta = prodsFull.filter(p => (p.receta || []).length === 0).length;
    setMsg(
      `✓ Recalculado sobre ${prodsFull.length} productos: ` +
      `${disponibilidadActualizada} con disponibilidad actualizada, ` +
      `${specsActualizadas} con material/peso actualizados, ` +
      `${tiemposMigrados} con tiempo de impresión migrado.` +
      (sinReceta > 0 ? ` ${sinReceta} sin receta quedaron NO disponibles.` : "")
    );
    setTiemposIlegibles(tiemposIlegibles || []);
  };

  // Renumeración de IDs: escribe el plan exacto que se revisó en el modal.
  const handleRenumerarIds = async (plan) => {
    setMsg("Renumerando IDs...");
    try {
      const { actualizados, errores } = await aplicarRenumeracionIds(plan);
      await loadProducts();
      onProductsChange?.();
      if (errores.length > 0) {
        setMsg(
          `Renumerados ${actualizados} productos, pero ${errores.length} fallaron: ` +
          errores.map(e => e.nombre).join(", ") + ". Volvé a correr el botón para completarlos."
        );
      } else {
        setMsg(`✓ ${actualizados} producto(s) renumerados. Los IDs quedaron correlativos y únicos.`);
      }
    } catch (err) {
      setMsg("Error al renumerar: " + err.message);
    }
  };

  // Botón manual: mueve receta/origenUrl/notas del doc público a la subcolección
  const handleMigrarPrivados = async () => {
    const pendientes = products.filter(p => CAMPOS_PRIVADOS.some(c => p[c] !== undefined));
    if (pendientes.length === 0) {
      return setMsg("✓ No hay datos privados en el documento público: nada para migrar.");
    }
    if (!confirm(
      `Se moverán receta/origen/notas de ${pendientes.length} producto(s) a la subcolección ` +
      `privada y se borrarán del documento público. ¿Continuar?`
    )) return;

    setMsg("Migrando datos privados...");
    try {
      const { migrados } = await migrarDatosPrivados(pendientes);
      const { prodsFull, films, insus } = await recargarTodo();
      await sincronizarDisponibilidad(prodsFull, films, insus);
      onProductsChange?.();
      setMsg(`✓ ${migrados} producto(s) migrados a products/{id}/privado/data.`);
    } catch (err) {
      setMsg("Error al migrar: " + err.message);
    }
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
    Promise.all([loadProducts(), loadUsers(), loadCosts(), loadFilamentos(), loadPedidos(), loadInsumos(), loadPersonalizados()])
      .then(([prods]) => loadPrivados(prods))
      .then(() => setLoading(false));
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
      // El catálogo público solo lee este booleano: se recalcula al guardar,
      // porque la receta pudo haber cambiado.
      const disponible = calcularDisponibilidad(data, filamentos, insumos).disponible;

      // El doc público NO lleva receta/origenUrl/notas/insumos: van a la
      // subcolección privada, que solo pueden leer los admins.
      // Se renombra al destructurar para no tapar el estado `insumos` (el
      // catálogo), que se usa arriba en el mismo bloque.
      const { _id, receta, origenUrl, notas, insumos: insumosProducto, ...publico } = data;
      const privado = {
        receta: receta || [],
        origenUrl: origenUrl || "",
        notas: notas || "",
        insumos: insumosProducto || [],
      };

      // Al crear, el ID visible se recalcula contra la lista fresca para que
      // dos altas seguidas no puedan quedarse con el mismo número.
      if (!_id) {
        const frescos = await loadProducts();
        publico.id = siguienteIdProducto(frescos);
      }

      let productId = _id;
      if (productId) {
        // deleteField() limpia los campos que hayan quedado en el doc público
        // de antes de la mudanza: guardar un producto lo migra solo.
        await updateDoc(doc(db, "products", productId), {
          ...publico,
          disponible,
          receta: deleteField(),
          origenUrl: deleteField(),
          notas: deleteField(),
          insumos: deleteField(),
        });
        setMsg("✓ Producto actualizado.");
      } else {
        const ref = await addDoc(collection(db, "products"), {
          ...publico,
          disponible,
          createdAt: serverTimestamp(),
        });
        productId = ref.id;
        setMsg("✓ Producto creado.");
      }
      await guardarPrivado(productId, privado);

      const prods = await loadProducts();
      await loadPrivados(prods);
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
    { id: "personalizados", label: "Personalizados", icon: <Icon.spark size={16}/> },
    { id: "categorias", label: "Categorías", icon: <Icon.layers size={16}/> },
    { id: "inventario", label: "Inventario", icon: <Icon.layers size={16}/> },
    { id: "insumos", label: "Insumos", icon: <Icon.grid size={16}/> },
    { id: "pedidos", label: "Pedidos", icon: <Icon.truck size={16}/> },
    { id: "estadisticas", label: "Estadísticas", icon: <Icon.list size={16}/> },
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
              ? <ProductForm product={editProduct} onSave={handleSave} onCancel={() => { setShowForm(false); setEditProduct(null); }} categories={propCategories} filamentos={filamentos} costs={costSettings} nextId={siguienteIdProducto(products)} catalogoInsumos={insumos}/>
              : <ProductsTab
                  products={productosFull}
                  costs={costSettings}
                  filamentos={filamentos}
                  insumos={insumos}
                  categories={propCategories}
                  pendientesDeMigrar={products.filter(p => CAMPOS_PRIVADOS.some(c => p[c] !== undefined)).length}
                  onEdit={(p) => { setEditProduct(p); setShowForm(true); }}
                  onDelete={handleDelete}
                  onNew={() => { setEditProduct(null); setShowForm(true); }}
                  onRecalcular={handleRecalcular}
                  onMigrarPrivados={handleMigrarPrivados}
                  onRenumerarIds={handleRenumerarIds}
                  tiemposIlegibles={tiemposIlegibles}
                  onCerrarTiempos={() => setTiemposIlegibles([])}
                  onToggleVisible={async (p) => {
                    await updateDoc(doc(db, "products", p._id), { visible: p.visible === false ? true : false });
                    await loadProducts();
                    onProductsChange?.();
                  }}/>
          )}
          {tab === "personalizados" && (
            showFormPers
              ? <ProductForm
                  modo="personalizado"
                  product={editPersonalizado}
                  onSave={handleSavePersonalizado}
                  onCancel={() => { setShowFormPers(false); setEditPersonalizado(null); }}
                  filamentos={filamentos}
                  costs={costSettings}
                  catalogoInsumos={insumos}
                />
              : <PersonalizadosTab
                  personalizados={personalizados}
                  costs={costSettings}
                  filamentos={filamentos}
                  insumos={insumos}
                  onEdit={(p) => { setEditPersonalizado(p); setShowFormPers(true); }}
                  onDelete={handleDeletePersonalizado}
                  onNew={() => { setEditPersonalizado(null); setShowFormPers(true); }}
                />
          )}
          {tab === "categorias" && <CategoriesTab categories={propCategories} products={products} onCategoriesChange={onCategoriesChange} setMsg={setMsg}/>}
          {tab === "inventario" && (
            <InventarioTab filamentos={filamentos} onChanged={handleInventarioChange} setMsg={setMsg}/>
          )}
          {tab === "insumos" && (
            <InsumosTab insumos={insumos} onChanged={handleInventarioChange} setMsg={setMsg}/>
          )}
          {tab === "pedidos" && (
            <PedidosTab
              pedidos={pedidos}
              productos={productosFull}
              personalizados={personalizados}
              filamentos={filamentos}
              insumos={insumos}
              onPedidosChange={loadPedidos}
              onInventarioChange={handleInventarioChange}
              setMsg={setMsg}
            />
          )}
          {tab === "estadisticas" && (
            <EstadisticasTab
              pedidos={pedidos}
              productos={productosFull}
              personalizados={personalizados}
              filamentos={filamentos}
              categories={propCategories}
              costs={costSettings}
            />
          )}
          {tab === "usuarios" && <UsersTab users={users} onToggleRole={toggleRole} />}
          {tab === "costos" && (
            <CostosTab products={productosFull} personalizados={personalizados} setMsg={setMsg} />
          )}
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
function ProductsTab({
  products, costs = DEFAULT_COSTS, filamentos = [], insumos = [], categories = [], pendientesDeMigrar = 0,
  onEdit, onDelete, onNew, onToggleVisible, onRecalcular, onMigrarPrivados,
  onRenumerarIds, tiemposIlegibles = [], onCerrarTiempos,
}) {
  const [search, setSearch] = useState("");
  const [planRenumeracion, setPlanRenumeracion] = useState(null);
  const [filtroCat, setFiltroCat] = useState("all");
  const [filtroSub, setFiltroSub] = useState("all");
  const [expandido, setExpandido] = useState(null);

  // Subcategorías del selector: las de la categoría elegida, o todas las
  // existentes (sin repetir) cuando la categoría está en "Todas".
  const subsDisponibles = useMemo(() => {
    if (filtroCat !== "all") {
      return categories.find(c => c.id === filtroCat)?.subs || [];
    }
    return [...new Set(categories.flatMap(c => c.subs || []))].sort((a, b) => a.localeCompare(b));
  }, [categories, filtroCat]);

  const elegirCat = (catId) => {
    setFiltroCat(catId);
    setFiltroSub("all"); // la subcategoría anterior puede no existir en la nueva
  };

  // Texto AND categoría AND subcategoría
  const filtered = products.filter(p => {
    const texto = search.trim().toLowerCase();
    const coincideTexto = !texto ||
      p.name?.toLowerCase().includes(texto) ||
      p.cat?.toLowerCase().includes(texto) ||
      p.id?.toLowerCase().includes(texto);
    const coincideCat = filtroCat === "all" || p.cat === filtroCat;
    const coincideSub = filtroSub === "all" || p.sub === filtroSub;
    return coincideTexto && coincideCat && coincideSub;
  });

  const hayFiltros = Boolean(search.trim()) || filtroCat !== "all" || filtroSub !== "all";
  const limpiarFiltros = () => { setSearch(""); setFiltroCat("all"); setFiltroSub("all"); };

  const sinReceta = products.filter(p => (p.receta || []).length === 0).length;
  const duplicados = useMemo(() => idsDuplicados(products), [products]);

  const COL = "70px 2fr 1fr 90px 90px 70px 110px 70px 70px 90px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Productos</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {pendientesDeMigrar > 0 && (
            <TKButton variant="outline" onClick={onMigrarPrivados} icon={<Icon.layers size={14}/>}>
              Migrar datos privados ({pendientesDeMigrar})
            </TKButton>
          )}
          <TKButton
            variant="outline"
            onClick={() => setPlanRenumeracion(planDeRenumeracion(products))}
            icon={<Icon.list size={14}/>}
          >
            Renumerar IDs
          </TKButton>
          <TKButton variant="outline" onClick={onRecalcular} icon={<Icon.spark size={14}/>}>
            Recalcular desde recetas
          </TKButton>
          <TKButton onClick={onNew} icon={<Icon.plus size={14}/>}>Nuevo producto</TKButton>
        </div>
      </div>

      {/* Buscador + filtros en cascada (se combinan con AND) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 320px) 1fr 1fr auto", gap: 12, alignItems: "end", marginBottom: 16 }} className="form-layout">
        <TKInput placeholder="Buscar producto..." icon={<Icon.search size={16}/>} value={search} onChange={e => setSearch(e.target.value)} />
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Categoría</div>
          <select value={filtroCat} onChange={e => elegirCat(e.target.value)} style={selectStyle}>
            <option value="all">Todas</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Subcategoría</div>
          <select
            value={filtroSub}
            onChange={e => setFiltroSub(e.target.value)}
            disabled={subsDisponibles.length === 0}
            style={{ ...selectStyle, opacity: subsDisponibles.length === 0 ? 0.5 : 1 }}
          >
            <option value="all">Todas</option>
            {subsDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {hayFiltros && (
          <TKButton variant="ghost" onClick={limpiarFiltros} icon={<Icon.close size={14}/>}>Limpiar</TKButton>
        )}
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
        {hayFiltros && <> de {products.length}</>}
        {sinReceta > 0 && (
          <> · <span style={{ color: "#B56B3E", fontWeight: 700 }}>
            {sinReceta} sin receta (no disponibles hasta cargarla)
          </span></>
        )}
      </div>

      {duplicados.size > 0 && (
        <div style={{ padding: "12px 14px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
          <strong style={{ color: "#B56B3E" }}>
            {duplicados.size} ID de producto repetido{duplicados.size !== 1 ? "s" : ""}: {[...duplicados].join(", ")}
          </strong>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>
            Marcados en rojo en la columna ID. El catálogo público rutea el detalle por este ID, así
            que con IDs repetidos siempre abre el primero de la lista. Los productos nuevos ya toman
            un ID correlativo automático; los repetidos actuales hay que reasignarlos.
          </div>
        </div>
      )}

      {tiemposIlegibles.length > 0 && (
        <div style={{ padding: "12px 14px", background: "#c6413812", borderLeft: "3px solid #c64138", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <strong style={{ color: "#c64138" }}>
                {tiemposIlegibles.length} producto(s) con tiempo de impresión que no se pudo migrar
              </strong>
              <div style={{ color: "var(--muted)", marginTop: 4 }}>
                Quedaron en 0h 0min. Cargales el tiempo a mano desde el formulario:
              </div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {tiemposIlegibles.map((t, i) => (
                  <li key={i}>
                    <strong style={{ color: "var(--text)" }}>{t.nombre}</strong>
                    {t.texto ? <> — texto original: "{t.texto}"</> : null}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={onCerrarTiempos} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
              <Icon.close size={14}/>
            </button>
          </div>
        </div>
      )}

      {pendientesDeMigrar > 0 && (
        <div style={{ padding: "12px 14px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
          Hay {pendientesDeMigrar} producto(s) con receta, origen o notas todavía guardados en el
          documento público de <code>products</code>. Usá "Migrar datos privados" para moverlos a
          <code> products/&#123;id&#125;/privado/data</code> y borrarlos del documento público.
        </div>
      )}

      {/* Table container with horizontal scroll for mobile */}
      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 1040 }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase",
            letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700,
          }}>
            <div>ID</div><div>Nombre</div><div>Categoría</div><div>Precio</div><div>Costo fab.</div><div>Stock</div><div>Disponible</div><div>Origen</div><div>Visible</div><div>Acciones</div>
          </div>

          {filtered.map(p => {
            const rent = calcularRentabilidad(p, costs);
            const disp = calcularDisponibilidad(p, filamentos, insumos);
            const abierto = expandido === p._id;
            return (
              <div key={p._id} style={{ borderBottom: "1px solid var(--line)", opacity: p.visible === false ? 0.5 : 1 }}>
                <div style={{
                  display: "grid", gridTemplateColumns: COL,
                  gap: 12, padding: "14px 12px",
                  fontSize: 13, alignItems: "center",
                }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: duplicados.has((p.id || "").toUpperCase()) ? "#c64138" : "var(--muted)",
                      fontWeight: duplicados.has((p.id || "").toUpperCase()) ? 700 : 400,
                    }}
                    title={duplicados.has((p.id || "").toUpperCase())
                      ? `ID repetido: más de un producto usa ${p.id}`
                      : undefined}
                  >
                    {p.id || "—"}
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
                    {rent.calculable
                      ? <span style={{ color: "var(--text)", fontWeight: 600 }}>{fmtARS(rent.costoFabricacion)}</span>
                      : <span style={{ color: "var(--muted)" }} title={rent.motivo}>—</span>
                    }
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: (p.stock || 0) < 5 ? "#c64138" : "var(--text)",
                    fontWeight: (p.stock || 0) < 5 ? 700 : 400,
                  }}>
                    {p.stock ?? "—"}
                  </div>
                  {/* Disponibilidad calculada desde receta + inventario.
                      "Sin receta" y "No" comparten el color de alerta pero se
                      distinguen: uno se arregla cargando la receta, el otro
                      reponiendo filamento. */}
                  <div>
                    <button
                      onClick={() => setExpandido(abierto ? null : p._id)}
                      title={disp.sinReceta
                        ? "Sin receta cargada — no disponible"
                        : "Ver detalle de disponibilidad"}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        display: "flex", alignItems: "center", gap: 6,
                        color: disp.disponible ? "#4a7a52" : "#c64138",
                        fontWeight: 700, fontSize: disp.sinReceta ? 12 : 13,
                      }}
                    >
                      <span style={{ transition: "transform .2s", transform: abierto ? "rotate(90deg)" : "none" }}>›</span>
                      {disp.disponible ? "Sí" : disp.sinReceta ? "Sin receta" : "No"}
                    </button>
                  </div>
                  {/* Origen del diseño — solo backoffice */}
                  <div style={{ fontSize: 12 }}>
                    {p.origenUrl ? (
                      <a href={p.origenUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Link</a>
                    ) : <span style={{ color: "var(--muted)" }}>—</span>}
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

                {abierto && <DisponibilidadDetalle disp={disp} producto={p}/>}
              </div>
            );
          })}
        </div>
      </div>

      {planRenumeracion && (
        <ModalRenumeracion
          plan={planRenumeracion}
          onClose={() => setPlanRenumeracion(null)}
          onConfirm={async () => {
            const plan = planRenumeracion;
            setPlanRenumeracion(null);
            await onRenumerarIds(plan);
          }}
        />
      )}

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


// ─── Personalizados: listado ─────────────────────────────────────────
// Piezas a pedido de un cliente puntual. Mismo formato de tabla que
// Productos, pero con "Cliente" en vez de ID y sin Categoría/Subcategoría.
// Estos documentos NUNCA se consultan desde el catálogo público.
function PersonalizadosTab({
  personalizados, costs = DEFAULT_COSTS, filamentos = [], insumos = [],
  onEdit, onDelete, onNew,
}) {
  const [search, setSearch] = useState("");
  const [expandido, setExpandido] = useState(null);

  const filtered = personalizados.filter(p => {
    const t = search.trim().toLowerCase();
    return !t ||
      p.name?.toLowerCase().includes(t) ||
      p.clienteNombre?.toLowerCase().includes(t);
  });

  const COL = "1.2fr 1.6fr 100px 100px 110px 70px 90px";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Personalizados</h2>
        <TKButton onClick={onNew} icon={<Icon.plus size={14}/>}>Nuevo personalizado</TKButton>
      </div>

      <div style={{ padding: "10px 12px", background: "var(--bg-alt)", borderLeft: "3px solid var(--accent)", fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
        Piezas hechas a pedido de un cliente. <strong style={{ color: "var(--text)" }}>Nunca
        aparecen en el catálogo público</strong>, sin importar cómo estén cargadas.
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <TKInput placeholder="Buscar por pieza o cliente..." icon={<Icon.search size={16}/>}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {filtered.length} personalizado{filtered.length !== 1 ? "s" : ""}
        {search.trim() && <> de {personalizados.length}</>}
      </div>

      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 860 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COL,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase",
            letterSpacing: 1.5, color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Cliente</div><div>Pieza</div><div>Precio</div><div>Costo fab.</div>
            <div>Disponible</div><div>Origen</div><div>Acciones</div>
          </div>

          {filtered.map(p => {
            const rent = calcularRentabilidad(p, costs);
            const disp = calcularDisponibilidad(p, filamentos, insumos);
            const abierto = expandido === p._id;
            return (
              <div key={p._id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: COL,
                  gap: 12, padding: "14px 12px", fontSize: 13, alignItems: "center",
                }}>
                  <div style={{ fontWeight: 600 }}>{p.clienteNombre || "—"}</div>
                  <div>{p.name}</div>
                  <div>{fmtARS(p.price || 0)}</div>
                  <div style={{ fontSize: 12 }}>
                    {rent.calculable
                      ? <span style={{ fontWeight: 600 }}>{fmtARS(rent.costoFabricacion)}</span>
                      : <span style={{ color: "var(--muted)" }} title={rent.motivo}>—</span>}
                  </div>
                  <div>
                    <button
                      onClick={() => setExpandido(abierto ? null : p._id)}
                      title={disp.sinReceta ? "Sin receta cargada" : "Ver detalle de disponibilidad"}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        display: "flex", alignItems: "center", gap: 6,
                        color: disp.disponible ? "#4a7a52" : "#c64138",
                        fontWeight: 700, fontSize: disp.sinReceta ? 12 : 13,
                      }}
                    >
                      <span style={{ transition: "transform .2s", transform: abierto ? "rotate(90deg)" : "none" }}>›</span>
                      {disp.disponible ? "Sí" : disp.sinReceta ? "Sin receta" : "No"}
                    </button>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {p.origenUrl
                      ? <a href={p.origenUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Link</a>
                      : <span style={{ color: "var(--muted)" }}>—</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => onEdit(p)} style={actionBtn} title="Editar"><Icon.spark size={14}/></button>
                    <button onClick={() => onDelete(p)} style={{...actionBtn, color: "#c64138"}} title="Eliminar"><Icon.trash size={14}/></button>
                  </div>
                </div>

                {abierto && <DisponibilidadDetalle disp={disp} producto={p}/>}
              </div>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          {personalizados.length === 0
            ? "No hay personalizados cargados."
            : "No se encontraron personalizados con ese criterio."}
        </div>
      )}
    </>
  );
}

// ─── Modal: revisar la renumeración antes de escribir ─────────────────
function ModalRenumeracion({ plan, onClose, onConfirm }) {
  const cambian = plan.filter(p => p.cambia);
  const sinFecha = plan.filter(p => p.sinFecha).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg)", border: "1px solid var(--line)",
          maxWidth: 640, width: "100%", maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h3 style={{ fontSize: 24, margin: 0 }}>Renumerar IDs de producto</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
            <Icon.close size={18}/>
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 0, marginBottom: 8 }}>
          Todo el catálogo pasa a TKP1…TKP{plan.length} por orden de creación. Se escribe
          únicamente el campo <code>id</code> de cada producto: no se tocan las recetas, el
          inventario, los pedidos ni los datos privados.
        </p>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
          <strong style={{ color: "var(--text)" }}>{cambian.length}</strong> de {plan.length} productos
          cambian de ID.
          {sinFecha > 0 && ` ${sinFecha} sin fecha de creación van al final, ordenados por nombre.`}
        </div>

        <div style={{ flex: 1, overflowY: "auto", border: "1px solid var(--line)", marginBottom: 20 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px 20px 90px",
            gap: 10, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2,
            color: "var(--muted)", fontWeight: 700,
            position: "sticky", top: 0,
          }}>
            <div>Producto</div><div>Antes</div><div/><div>Después</div>
          </div>
          {plan.map(item => (
            <div key={item._id} style={{
              display: "grid", gridTemplateColumns: "1fr 90px 20px 90px",
              gap: 10, padding: "10px 12px", borderTop: "1px solid var(--line)",
              fontSize: 12, alignItems: "center",
              opacity: item.cambia ? 1 : 0.5,
            }}>
              <div style={{ fontWeight: 600 }}>
                {item.nombre}
                {item.sinFecha && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · sin fecha</span>}
              </div>
              <div style={{ color: "var(--muted)", textDecoration: item.cambia ? "line-through" : "none" }}>
                {item.idViejo}
              </div>
              <div style={{ color: "var(--muted)" }}>{item.cambia ? "→" : "="}</div>
              <div style={{ fontWeight: 700, color: item.cambia ? "#4a7a52" : "var(--muted)" }}>
                {item.idNuevo}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <TKButton variant="outline" onClick={onClose}>Cancelar</TKButton>
          <TKButton onClick={onConfirm} disabled={cambian.length === 0}>
            {cambian.length === 0 ? "No hay nada que cambiar" : `Aplicar a ${cambian.length} producto(s)`}
          </TKButton>
        </div>
      </div>
    </div>
  );
}

// ─── Detalle expandible de disponibilidad (solo backoffice) ───────────
function DisponibilidadDetalle({ disp, producto }) {
  if (disp.sinReceta) {
    return (
      <div style={{ padding: "12px 16px 16px 34px", background: "var(--bg-alt)", fontSize: 12, color: "#c64138", lineHeight: 1.6 }}>
        <strong>"{producto.name}" no tiene receta de consumo cargada.</strong>{" "}
        <span style={{ color: "var(--muted)" }}>
          Sin receta no se puede evaluar el inventario, así que queda NO disponible y en el catálogo
          público aparece como "Sin stock". Cargá la receta desde el formulario del producto para
          habilitarlo.
        </span>
      </div>
    );
  }
  return (
    <div style={{ padding: "12px 16px 18px 34px", background: "var(--bg-alt)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>
        Receta vs. inventario — se exige {FACTOR_DISPONIBILIDAD}× el consumo de una unidad
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "1.4fr 1fr 110px 120px 120px 90px",
        gap: 10, padding: "8px 0", fontSize: 10, textTransform: "uppercase",
        letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700,
      }}>
        <div>Material</div><div>Color</div><div>Por unidad</div><div>Necesario (×{FACTOR_DISPONIBILIDAD})</div><div>En inventario</div><div>Estado</div>
      </div>
      {disp.detalle.map((d, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "1.4fr 1fr 110px 120px 120px 90px",
          gap: 10, padding: "8px 0", fontSize: 12, borderTop: "1px solid var(--line)",
          alignItems: "center",
        }}>
          <div style={{ fontWeight: 600 }}>{d.material}</div>
          <div>{d.color}</div>
          <div>{d.gramosPorUnidad} g</div>
          <div style={{ fontWeight: 600 }}>{d.requerido} g</div>
          <div style={{ color: d.ok ? "var(--text)" : "#c64138", fontWeight: d.ok ? 400 : 700 }}>
            {d.existe ? `${d.enInventario} g` : "sin cargar"}
          </div>
          <div style={{ color: d.ok ? "#4a7a52" : "#c64138", fontWeight: 700 }}>{d.ok ? "OK" : "Falta"}</div>
        </div>
      ))}
      {disp.faltantes.length > 0 && (
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12, color: "#c64138", lineHeight: 1.7 }}>
          {disp.faltantes.map((f, i) => <li key={i}>{motivoFaltante(f)}</li>)}
        </ul>
      )}

      {/* Insumos: mismo criterio pero a 1x, no el doble */}
      {(disp.detalleInsumos || []).length > 0 && (
        <>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700, margin: "18px 0 8px" }}>
            Insumos vs. catálogo — alcanza con tener lo que consume una unidad
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "2.4fr 110px 120px 120px 90px",
            gap: 10, padding: "8px 0", fontSize: 10, textTransform: "uppercase",
            letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Insumo</div><div>Por unidad</div><div>Necesario</div><div>En catálogo</div><div>Estado</div>
          </div>
          {disp.detalleInsumos.map((d, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "2.4fr 110px 120px 120px 90px",
              gap: 10, padding: "8px 0", fontSize: 12, borderTop: "1px solid var(--line)",
              alignItems: "center",
            }}>
              <div style={{ fontWeight: 600 }}>{d.nombre || "(sin nombre)"}</div>
              <div>{d.cantidadPorUnidad} u.</div>
              <div style={{ fontWeight: 600 }}>{d.requerido} u.</div>
              <div style={{ color: d.ok ? "var(--text)" : "#c64138", fontWeight: d.ok ? 400 : 700 }}>
                {d.existe ? `${d.enCatalogo} u.` : "no está en el catálogo"}
              </div>
              <div style={{ color: d.ok ? "#4a7a52" : "#c64138", fontWeight: 700 }}>{d.ok ? "OK" : "Falta"}</div>
            </div>
          ))}
          {disp.faltantesInsumos.length > 0 && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12, color: "#c64138", lineHeight: 1.7 }}>
              {disp.faltantesInsumos.map((f, i) => <li key={i}>{motivoFaltanteInsumo(f)}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ─── Editor de receta de consumo (dentro del ProductForm) ─────────────
function RecetaEditor({ receta, setReceta, filamentos }) {
  const materiales = [...new Set(filamentos.map(f => f.material).filter(Boolean))];
  const colores = [...new Set(filamentos.map(f => f.color).filter(Boolean))];

  const up = (i, patch) => setReceta(r => r.map((l, j) => j === i ? { ...l, ...patch } : l));
  const quitar = (i) => setReceta(r => r.filter((_, j) => j !== i));
  const agregar = () => setReceta(r => [...r, { material: "", color: "", gramos: 0 }]);

  const totalGramos = receta.reduce((s, l) => s + (Number(l.gramos) || 0), 0);

  return (
    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>Receta de consumo</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Cuánto filamento consume <strong>una unidad</strong>. Un producto puede usar varios
        materiales/colores. La disponibilidad exige tener al menos {FACTOR_DISPONIBILIDAD}× estos
        gramos en inventario, para cada línea.
      </div>

      <datalist id="materiales-inventario">
        {materiales.map(m => <option key={m} value={m}/>)}
      </datalist>
      <datalist id="colores-inventario">
        {colores.map(c => <option key={c} value={c}/>)}
      </datalist>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {receta.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px 36px", gap: 10, alignItems: "center" }}>
            <input
              list="materiales-inventario"
              value={l.material}
              onChange={e => up(i, { material: e.target.value })}
              placeholder="Material (PLA)"
              style={recetaInput}
            />
            <input
              list="colores-inventario"
              value={l.color}
              onChange={e => up(i, { color: e.target.value })}
              placeholder="Color (Negro)"
              style={recetaInput}
            />
            <input
              type="number"
              value={l.gramos}
              onChange={e => up(i, { gramos: e.target.value })}
              placeholder="Gramos"
              style={recetaInput}
            />
            <button onClick={() => quitar(i)} style={{ ...actionBtn, color: "#c64138", justifyContent: "center" }} title="Quitar línea">
              <Icon.trash size={14}/>
            </button>
          </div>
        ))}
      </div>

      {receta.length === 0 && (
        <div style={{ fontSize: 12, color: "#c64138", padding: "6px 0" }}>
          Sin receta cargada: el producto queda NO disponible en el catálogo.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
        <button onClick={agregar} style={{
          background: "none", border: "1px dashed var(--line-strong)",
          padding: "8px 14px", cursor: "pointer", color: "var(--muted)",
          fontSize: 12, display: "flex", alignItems: "center", gap: 6,
        }}>
          <Icon.plus size={12}/> Agregar material
        </button>
        {receta.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Total por unidad: <strong style={{ color: "var(--text)" }}>{totalGramos} g</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Campo Precio: automático por fórmula, o manual con toggle ────────
function PrecioField({ manual, onToggleManual, valorManual, onChangeManual, sugerido, precioFinal }) {
  const noCalculable = !sugerido.calculable;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={labelStyle}>Precio (ARS)</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={manual}
            onChange={e => onToggleManual(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer" }}
          />
          Editar precio manualmente
        </label>
      </div>

      {manual ? (
        <input
          type="number"
          value={valorManual}
          onChange={e => onChangeManual(e.target.value)}
          placeholder="0"
          style={{
            width: "100%", padding: "12px 14px", background: "var(--bg)",
            border: "1px solid var(--accent)", borderRadius: 4,
            fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
            color: "var(--text)", outline: "none", boxSizing: "border-box",
          }}
        />
      ) : (
        <div style={{
          padding: "12px 14px", background: "var(--bg-alt)",
          border: "1px dashed var(--line)", borderRadius: 4,
          fontSize: 14, fontWeight: noCalculable ? 400 : 600,
          color: noCalculable ? "var(--muted)" : "var(--text)",
          boxSizing: "border-box",
        }}>
          {noCalculable
            ? `${fmtARS(0)} (sin receta, no se puede calcular)`
            : fmtARS(precioFinal)}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
        {manual ? (
          <>
            Precio fijado a mano.{" "}
            {sugerido.calculable
              ? <>La fórmula sugiere <strong style={{ color: "var(--text)" }}>{fmtARS(sugerido.precio)}</strong>
                  {sugerido.insumos > 0 && <> (incluye {fmtARS(sugerido.insumos)} de insumos)</>}.</>
              : <>No hay precio sugerido: {sugerido.motivo?.toLowerCase()}.</>}
            {sugerido.insumos > 0 && (
              <div style={{ color: "#B56B3E", marginTop: 4 }}>
                Los {fmtARS(sugerido.insumos)} de insumos NO se suman solos en modo manual.
              </div>
            )}
          </>
        ) : (
          <>
            (calculado automáticamente)
            {sugerido.calculable && sugerido.insumos > 0 && (
              <> — {fmtARS(sugerido.base)} de material y máquina + {fmtARS(sugerido.insumos)} de insumos</>
            )}
            {noCalculable && <> — {sugerido.motivo}</>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Editor de insumos del producto (opcional) ────────────────────────
// Cada línea elige un insumo del catálogo y cuántas unidades consume UNA
// unidad del producto. El precio no se escribe a mano: sale de
// cantidad × precioUnidad del catálogo, igual que Material y Peso.
function InsumosEditor({ lineas, setLineas, catalogo }) {
  const up = (i, patch) => setLineas(list => list.map((l, j) => j === i ? { ...l, ...patch } : l));
  const quitar = (i) => setLineas(list => list.filter((_, j) => j !== i));
  const agregar = () => setLineas(list => [...list, { insumoId: "", cantidad: 1 }]);

  /** Precio vigente del catálogo; si el insumo ya no existe, el del snapshot. */
  const precioDe = (l) => {
    const insumo = catalogo.find(i => i._id === l.insumoId);
    return insumo ? Number(insumo.precioUnidad) || 0 : Number(l.precioUnidad) || 0;
  };
  const subtotalDe = (l) => precioDe(l) * Math.max(1, Number(l.cantidad) || 1);

  const total = lineas.filter(l => l.insumoId).reduce((s, l) => s + subtotalDe(l), 0);
  const yaElegidos = new Set(lineas.map(l => l.insumoId).filter(Boolean));

  return (
    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>Insumos (opcional)</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Componentes que no son filamento, tomados del catálogo del tab Insumos. Su precio se suma
        al precio final <strong>sin margen</strong>. La cantidad es por <strong>una</strong> unidad
        del producto (ej. 2 imanes por pieza).
      </div>

      {catalogo.length === 0 && (
        <div style={{ padding: "10px 12px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E", fontSize: 12, marginBottom: 12 }}>
          El catálogo de insumos está vacío. Cargá los insumos en el tab Insumos para poder usarlos acá.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lineas.map((l, i) => {
          const insumo = catalogo.find(x => x._id === l.insumoId);
          const huerfano = l.insumoId && !insumo;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 36px", gap: 10, alignItems: "center" }}>
              <div>
                {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Insumo</div>}
                <select
                  value={l.insumoId}
                  onChange={e => up(i, { insumoId: e.target.value })}
                  style={{ ...selectStyle, borderColor: huerfano ? "#c64138" : "var(--line)" }}
                >
                  <option value="">Seleccionar insumo...</option>
                  {catalogo.map(x => (
                    <option key={x._id} value={x._id} disabled={yaElegidos.has(x._id) && x._id !== l.insumoId}>
                      {x.nombre} — {fmtARS(x.precioUnidad || 0)}/u ({x.cantidadDisponible ?? 0} disp.)
                    </option>
                  ))}
                </select>
                {huerfano && (
                  <div style={{ fontSize: 11, color: "#c64138", marginTop: 4 }}>
                    "{l.nombre || "insumo"}" ya no está en el catálogo. Elegí otro o quitá la línea.
                  </div>
                )}
              </div>
              <div>
                {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Cantidad</div>}
                <input
                  type="number" min="1"
                  value={l.cantidad}
                  onChange={e => up(i, { cantidad: e.target.value })}
                  style={recetaInput}
                />
              </div>
              <div>
                {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Subtotal</div>}
                <div style={{
                  padding: "10px 12px", background: "var(--bg-alt)",
                  border: "1px dashed var(--line)", borderRadius: 4,
                  fontSize: 13, fontWeight: 600, boxSizing: "border-box",
                }}>
                  {l.insumoId ? fmtARS(subtotalDe(l)) : "—"}
                </div>
              </div>
              <button
                onClick={() => quitar(i)}
                style={{ ...actionBtn, color: "#c64138", justifyContent: "center", height: 40, marginTop: i === 0 ? 20 : 0 }}
                title="Quitar insumo"
              >
                <Icon.trash size={14}/>
              </button>
            </div>
          );
        })}
      </div>

      {lineas.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 0" }}>
          Sin insumos: el precio sale solo de la receta y la hora de máquina.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
        <button
          onClick={agregar}
          disabled={catalogo.length === 0}
          style={{
            background: "none", border: "1px dashed var(--line-strong)",
            padding: "8px 14px", cursor: catalogo.length === 0 ? "not-allowed" : "pointer",
            color: "var(--muted)", opacity: catalogo.length === 0 ? 0.5 : 1,
            fontSize: 12, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Icon.plus size={12}/> Agregar insumo
        </button>
        {lineas.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Total insumos: <strong style={{ color: "var(--text)" }}>{fmtARS(total)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Spec de solo lectura, calculada desde la receta ──────────────────
function SpecCalculada({ label, valor, vacio }) {
  const hayValor = Boolean(valor);
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      <div style={{
        padding: "12px 14px", background: "var(--bg-alt)",
        border: "1px dashed var(--line)", borderRadius: 4,
        fontSize: 14, color: hayValor ? "var(--text)" : "var(--muted)",
        fontWeight: hayValor ? 600 : 400,
        minHeight: 20, boxSizing: "border-box",
      }}>
        {hayValor ? valor : vacio}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
        (calculado desde la receta)
      </div>
    </div>
  );
}

// ─── Preview en vivo de la disponibilidad mientras se edita la receta ──
function DisponibilidadPreview({ receta, filamentos, insumos = [], catalogoInsumos = [] }) {
  const limpia = receta
    .filter(l => l.material.trim() && l.color.trim() && (Number(l.gramos) || 0) > 0)
    .map(l => ({ material: l.material.trim(), color: l.color.trim(), gramos: Number(l.gramos) }));

  if (limpia.length === 0) {
    return (
      <div style={{ padding: "12px 14px", background: "#c6413812", borderLeft: "3px solid #c64138", fontSize: 12, lineHeight: 1.6 }}>
        <strong style={{ color: "#c64138" }}>Sin receta: el producto queda NO disponible</strong>
        <div style={{ color: "var(--muted)", marginTop: 4 }}>
          En el catálogo público se muestra con el badge "Sin stock" hasta que cargues al menos
          una línea de consumo.
        </div>
      </div>
    );
  }

  const disp = calcularDisponibilidad({ receta: limpia, insumos }, filamentos, catalogoInsumos);
  const color = disp.disponible ? "#4a7a52" : "#c64138";

  return (
    <div style={{ padding: "12px 14px", background: color + "12", borderLeft: `3px solid ${color}`, fontSize: 12, lineHeight: 1.6 }}>
      <strong style={{ color }}>
        {disp.disponible ? "Disponible con el inventario actual" : "No disponible con el inventario actual"}
      </strong>
      {(disp.faltantes.length > 0 || disp.faltantesInsumos.length > 0) && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
          {disp.faltantes.map((f, i) => <li key={`f${i}`}>{motivoFaltante(f)}</li>)}
          {disp.faltantesInsumos.map((f, i) => <li key={`i${i}`}>{motivoFaltanteInsumo(f)}</li>)}
        </ul>
      )}
    </div>
  );
}

const recetaInput = {
  width: "100%", padding: "10px 12px", background: "var(--bg)",
  border: "1px solid var(--line)", fontSize: 13, color: "var(--text)",
  borderRadius: 4, outline: "none", boxSizing: "border-box",
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

// ─── Product Form (Create / Edit) ─────────────────────────────
function ProductForm({
  product, onSave, onCancel, categories = [], filamentos = [], costs = DEFAULT_COSTS,
  nextId = "", catalogoInsumos = [], modo = "producto",
}) {
  // modo "personalizado": sin categoría, subcategoría, tag ni visible, y el ID
  // correlativo se reemplaza por el nombre del cliente.
  const esPersonalizado = modo === "personalizado";
  // Normalize: existing products may have img (string) or images (array)
  const initImages = () => {
    if (product?.images?.length) return [...product.images, "", "", "", "", ""].slice(0, 5);
    if (product?.img) return [product.img, "", "", "", ""];
    return ["", "", "", "", ""];
  };

  const [form, setForm] = useState({
    id: product?.id || nextId,
    clienteNombre: product?.clienteNombre || "",
    name: product?.name || "",
    cat: product?.cat || (categories[0]?.id || "casa"),
    sub: product?.sub || "",
    // price no vive en el form: sale de la fórmula o del modo manual.
    desc: product?.desc || "",
    tag: product?.tag || "",
    stock: product?.stock || 0,
    visible: product?.visible !== false,
    specs: product?.specs || { material: "", tiempo: "", peso: "" },
    origenUrl: product?.origenUrl || "",
    notas: product?.notas || "",
  });
  const [images, setImages] = useState(initImages);
  const [receta, setReceta] = useState(() =>
    (product?.receta || []).map(l => ({
      material: l.material || "",
      color: l.color || "",
      gramos: l.gramos ?? 0,
    }))
  );
  // Líneas de insumo del producto. Se conserva el snapshot (nombre/precioUnidad)
  // por si el insumo desapareció del catálogo.
  const [lineasInsumo, setLineasInsumo] = useState(() =>
    (product?.insumos || [])
      .filter(i => i && i.insumoId)
      .map(i => ({
        insumoId: i.insumoId,
        cantidad: Math.max(1, Number(i.cantidad) || 1),
        nombre: i.nombre || "",
        precioUnidad: Number(i.precioUnidad) || 0,
      }))
  );
  // Tiempo de impresión: dos números. Si el producto todavía tiene el texto
  // libre viejo, se parsea para precargar los campos.
  const [tiempo, setTiempo] = useState(() => {
    const t = tiempoDeProducto(product || {});
    return { horas: t.horas, minutos: t.minutos };
  });
  // El modo manual se persiste en el producto: si no, al reabrir el formulario
  // volvería a modo automático y el próximo guardado pisaría el precio a mano.
  const [precioManual, setPrecioManual] = useState(product?.precioManual === true);
  const [precioEditado, setPrecioEditado] = useState(product?.price || 0);

  const up = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const upSpec = (key, val) => setForm(f => ({ ...f, specs: { ...f.specs, [key]: val } }));
  const upImg = (i, val) => setImages(imgs => imgs.map((v, j) => j === i ? val : v));

  const currentCat = (categories.length ? categories : []).find(c => c.id === form.cat);
  const mainImg = images.find(u => u.trim()) || "";

  // Líneas de receta válidas — base de las specs derivadas y de lo que se guarda.
  const recetaLimpia = useMemo(() => receta
    .filter(l => l.material.trim() && l.color.trim() && (Number(l.gramos) || 0) > 0)
    .map(l => ({
      material: l.material.trim(),
      color: l.color.trim(),
      gramos: Number(l.gramos),
    })), [receta]);

  // Material y peso salen de la receta y se recalculan en vivo mientras se edita.
  const specsCalculadas = useMemo(() => specsDesdeReceta(recetaLimpia), [recetaLimpia]);

  // Snapshot al guardar: nombre y precioUnidad quedan congelados en el producto,
  // así cambiar el precio en el catálogo no reescribe el histórico.
  const insumosLimpios = useMemo(() => lineasInsumo
    .filter(l => l.insumoId)
    .map(l => {
      const insumo = catalogoInsumos.find(x => x._id === l.insumoId);
      const cantidad = Math.max(1, Number(l.cantidad) || 1);
      const precioUnidad = insumo ? Number(insumo.precioUnidad) || 0 : Number(l.precioUnidad) || 0;
      return {
        insumoId: l.insumoId,
        nombre: insumo?.nombre || l.nombre || "",
        cantidad,
        precioUnidad,
        subtotal: cantidad * precioUnidad,
      };
    }), [lineasInsumo, catalogoInsumos]);

  // Precio sugerido: misma fórmula que el tab de Costos (hora de máquina +
  // material con margen) más los insumos sumados sin margen. Se recalcula solo
  // al tocar receta, tiempo de impresión o insumos.
  const specsTiempo = useMemo(
    () => specsDeTiempo(tiempo.horas, tiempo.minutos),
    [tiempo.horas, tiempo.minutos]
  );

  const sugerido = useMemo(
    () => calcularPrecioSugerido(
      { receta: recetaLimpia, insumos: insumosLimpios, specs: specsTiempo },
      costs
    ),
    [recetaLimpia, insumosLimpios, specsTiempo, costs]
  );

  // En automático manda la fórmula; en manual, lo que escribió el usuario.
  const precioFinal = precioManual
    ? (Number(precioEditado) || 0)
    : (sugerido.precio || 0);

  const activarManual = (activo) => {
    setPrecioManual(activo);
    // Al activar arranca desde el precio calculado; al desactivar se descarta
    // lo escrito a mano y vuelve a mandar la fórmula.
    if (activo) setPrecioEditado(sugerido.precio || 0);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return alert("El nombre es obligatorio.");
    if (esPersonalizado && !form.clienteNombre.trim()) {
      return alert("El nombre del cliente es obligatorio.");
    }
    const cleanImages = images.filter(u => u.trim());
    // Se descarta el texto libre viejo: al guardar el specs se reemplaza entero.
    const { tiempo: _tiempoTextoViejo, ...specsBase } = form.specs;
    const data = {
      ...form,
      price: Number(precioFinal) || 0,
      precioManual,
      insumos: insumosLimpios,
      stock: Number(form.stock),
      visible: form.visible,
      images: cleanImages,
      img: cleanImages[0] || "",
      receta: recetaLimpia,
      // specs.material y specs.peso salen de la receta; el tiempo, de los dos
      // campos numéricos. El texto libre "5h 30min" ya no se guarda: se genera
      // al mostrar a partir de tiempoHoras/tiempoMinutos.
      specs: {
        ...specsBase,
        material: specsCalculadas.material,
        peso: specsCalculadas.peso,
        ...specsTiempo,
      },
      origenUrl: form.origenUrl.trim(),
      notas: form.notas,
    };
    if (esPersonalizado) {
      // Se sacan los campos que no aplican para que no queden en el documento.
      delete data.id;
      delete data.cat;
      delete data.sub;
      delete data.tag;
      delete data.visible;
      data.clienteNombre = form.clienteNombre.trim();
    } else {
      delete data.clienteNombre;
    }

    if (product?._id) data._id = product._id;
    onSave(data);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>
          {product?._id
            ? (esPersonalizado ? "Editar personalizado" : "Editar producto")
            : (esPersonalizado ? "Nuevo personalizado" : "Nuevo producto")}
        </h2>
        <TKButton variant="ghost" onClick={onCancel} icon={<Icon.back size={14}/>}>Volver</TKButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 40, alignItems: "start" }} className="form-layout">
        {/* ── Left: fields ── */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* En productos el ID es correlativo y no se carga a mano; en
                personalizados lo reemplaza el nombre del cliente, texto libre. */}
            {esPersonalizado ? (
              <TKInput
                label="Nombre del cliente"
                value={form.clienteNombre}
                onChange={e => up("clienteNombre", e.target.value)}
                placeholder="Ana Pérez"
                hint="Obligatorio"
              />
            ) : (
              <div>
                <div style={{ ...labelStyle, marginBottom: 6 }}>ID producto</div>
                <div style={{
                  padding: "12px 14px", background: "var(--bg-alt)",
                  border: "1px dashed var(--line)", borderRadius: 4,
                  fontSize: 14, fontWeight: 600, color: "var(--text)", boxSizing: "border-box",
                }}>
                  {form.id || "—"}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  {product?._id ? "(no editable)" : "(autogenerado al guardar)"}
                </div>
              </div>
            )}
            <TKInput label="Nombre" value={form.name} onChange={e => up("name", e.target.value)} placeholder="Organizador..." />

            {!esPersonalizado && (
              <>
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
              </>
            )}

            <PrecioField
              manual={precioManual}
              onToggleManual={activarManual}
              valorManual={precioEditado}
              onChangeManual={setPrecioEditado}
              sugerido={sugerido}
              precioFinal={precioFinal}
            />
            <TKInput label="Stock manual (heredado)" type="number" value={form.stock} onChange={e => up("stock", e.target.value)} hint="La disponibilidad real sale de la receta + inventario" />

            <div style={{ gridColumn: "1 / -1" }}>
              <TKInput label="Descripción" value={form.desc} onChange={e => up("desc", e.target.value)} placeholder="Descripción del producto..." />
            </div>

            {/* Tag y "visible en el catálogo" no aplican a un personalizado:
                nunca sale al catálogo público. */}
            {!esPersonalizado && (
              <>
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
              </>
            )}
          </div>

          {/* Specs — material y peso derivan de la receta, no se editan a mano */}
          <div style={{ marginBottom: 16 }}>
            <div style={{...labelStyle, marginBottom: 12}}>Especificaciones</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <SpecCalculada
                label="Material"
                valor={specsCalculadas.material}
                vacio="Sin receta cargada"
              />
              <div>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Tiempo impresión</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    type="number" min="0"
                    value={tiempo.horas}
                    onChange={e => setTiempo(t => ({ ...t, horas: e.target.value }))}
                    placeholder="Horas"
                    aria-label="Horas"
                    style={recetaInput}
                  />
                  <input
                    type="number" min="0" max="59"
                    value={tiempo.minutos}
                    onChange={e => setTiempo(t => ({ ...t, minutos: e.target.value }))}
                    placeholder="Minutos"
                    aria-label="Minutos"
                    style={recetaInput}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  <span>Horas</span><span>Minutos</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {formatTiempo(tiempo.horas, tiempo.minutos)}
                  {specsTiempo.tiempoImpresionHorasDecimal > 0 &&
                    ` = ${specsTiempo.tiempoImpresionHorasDecimal.toFixed(2)} h para el precio`}
                </div>
              </div>
              <SpecCalculada
                label="Peso"
                valor={specsCalculadas.peso}
                vacio="Sin receta cargada"
              />
            </div>
          </div>

          {/* Receta de consumo de filamento */}
          <RecetaEditor receta={receta} setReceta={setReceta} filamentos={filamentos}/>

          {/* Insumos opcionales (imanes, tornillos, cable...) */}
          <InsumosEditor lineas={lineasInsumo} setLineas={setLineasInsumo} catalogo={catalogoInsumos}/>

          {/* Vista previa de disponibilidad con el inventario actual */}
          <DisponibilidadPreview receta={receta} filamentos={filamentos}
            insumos={insumosLimpios} catalogoInsumos={catalogoInsumos}/>

          {/* ── Datos internos: nunca se muestran en el catálogo público ── */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div style={{ ...labelStyle, marginBottom: 4 }}>Datos internos</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
              Visibles solo acá, en el backoffice. No se renderizan en el catálogo ni en el detalle público.
            </div>
            <div style={{ marginBottom: 16 }}>
              <TKInput
                label="Origen del diseño (URL)"
                value={form.origenUrl}
                onChange={e => up("origenUrl", e.target.value)}
                placeholder="https://www.printables.com/model/..."
                hint="Thingiverse, Printables, Cults3D, etc. Se muestra como link en la tabla de Productos."
              />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Notas internas</div>
              <textarea
                value={form.notas}
                onChange={e => up("notas", e.target.value)}
                rows={4}
                placeholder="Ajustes de impresión, problemas conocidos, proveedor del diseño..."
                style={{
                  width: "100%", padding: "12px 14px", background: "var(--bg)",
                  border: "1px solid var(--line)", borderRadius: 4,
                  fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
                  color: "var(--text)", outline: "none", resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
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
              price={precioFinal}
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

// Columnas de la tabla de Rentabilidad. Header y filas son grids separados:
// se alinean solo mientras compartan este valor.
//   Producto | Categoría | Material/es | Peso | Tiempo | Costo | Precio | Ganancia
const COL_RENTABILIDAD = "2fr 130px 110px 130px 80px 100px 100px 90px";

function CostosTab({ products, personalizados = [], setMsg }) {
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

  // Fórmula y armado de filas en src/lib/costos.js: catálogo y personalizados
  // mezclados, con la misma fórmula para los dos.
  const rows = filasDeRentabilidad(products, personalizados, costs);

  const noCalculables = rows.filter(r => !r.rent.calculable).length;
  const cantidadPersonalizados = rows.filter(r => r.tipo === "personalizado").length;

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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Costo de fabricación por gramo (ARS/g)
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
            Lo que <strong style={{ color: "var(--text)" }}>te cuesta a vos producir un gramo</strong> de
            cada material, no el precio de venta.
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

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
            El precio de venta se deriva de este costo con un margen fijo de{" "}
            <strong style={{ color: "var(--text)" }}>×{MARGEN_MATERIAL}</strong> sobre el material,
            más la hora de máquina sumada aparte (sin margen). El nombre del material tiene que
            coincidir con el que usás en las recetas.
          </div>
        </div>
      </div>

      {/* ── Rentabilidad por producto ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
          Rentabilidad por producto
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
          Ordenado de menor a mayor margen. Costo fab. = gramos × costo/g por material + insumos
          (plata real que se paga para producir). Precio venta = el precio real del producto: el
          cargado a mano si tiene precio manual, si no hora de máquina + gramos × costo/g × {MARGEN_MATERIAL} + insumos.
          {cantidadPersonalizados > 0 && (
            <> · Incluye {cantidadPersonalizados} personalizado(s), con la misma fórmula.</>
          )}
          {noCalculables > 0 && (
            <> · <span style={{ color: "#B56B3E", fontWeight: 700 }}>
              {noCalculables} sin calcular (falta receta o costo de material)
            </span></>
          )}
        </div>
      </div>

      {/* El header y cada fila son grids independientes: se alinean solo
          porque comparten este template, así que va en una constante y no
          repetido en dos literales. minWidth = 848 de columnas fijas, gaps y
          padding + ~190 para el nombre. El contenedor scrollea solo, el body
          nunca queda con scroll horizontal en mobile. */}
      <div style={{ overflowX: "auto", margin: "0 -16px", padding: "0 16px" }}>
        <div style={{ minWidth: 1040 }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: COL_RENTABILIDAD,
            gap: 12, padding: "10px 12px", background: "var(--bg-alt)",
            fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
            color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Producto</div>
            <div>Categoría</div>
            <div>Material/es</div>
            <div>Peso</div>
            <div>Tiempo</div>
            <div>Costo fab.</div>
            <div>Precio venta</div>
            <div>Ganancia</div>
          </div>

          {rows.map(p => {
            const { rent } = p;
            const margenColor = !rent.calculable ? "var(--muted)"
              : rent.margen < 0 ? "#c64138" : rent.margen < 30 ? "#B56B3E" : "#4a7a52";
            const noCalc = <span style={{ color: "var(--muted)", fontSize: 12 }} title={rent.motivo}>—</span>;
            return (
              <div key={p.clave} style={{
                display: "grid",
                gridTemplateColumns: COL_RENTABILIDAD,
                gap: 12, padding: "14px 12px", borderBottom: "1px solid var(--line)",
                fontSize: 13, alignItems: "center",
              }}>
                {/* Producto: solo el nombre. Para un personalizado, debajo el
                    cliente, que es lo que lo identifica al no tener ID TKPx. */}
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                    {p.name}
                    {!rent.calculable && (
                      <span title={rent.motivo} style={{ color: "#B56B3E", display: "inline-flex" }}>
                        <Icon.shield size={13}/>
                      </span>
                    )}
                  </div>
                  {p.referencia && (
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                      {p.referencia}
                    </div>
                  )}
                  {/* El motivo no es categoría: es por qué la fila no calcula.
                      Se queda acá, junto al ícono de alerta que lo anuncia. */}
                  {!rent.calculable && (
                    <div style={{ fontSize: 10, color: "#B56B3E", marginTop: 2 }}>
                      {rent.motivo}
                    </div>
                  )}
                </div>

                {/* Categoría: el catálogo por categoría · subcategoría; un
                    personalizado no las tiene y se rotula como tal. */}
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.categoria}</div>

                {/* Material/es: todos los materiales distintos de la receta */}
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {rent.materiales.length > 0
                    ? rent.materiales.map(m => m.material).join(", ")
                    : "—"}
                </div>

                {/* Peso: total unificado con un material, desglosado con varios */}
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {rent.materiales.length === 0 ? "—"
                    : rent.materiales.length === 1
                      ? `${rent.gramosTotales} g`
                      : rent.materiales.map(m => (
                          <div key={m.material} style={{ whiteSpace: "nowrap" }}>
                            <strong style={{ color: "var(--text)", fontWeight: 600 }}>{m.material}:</strong> {m.gramos} g
                          </div>
                        ))}
                </div>

                <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatTiempoProducto(p)}</div>
                <div style={{ fontWeight: 600 }}>
                  {rent.calculable ? (
                    <>
                      {fmtARS(rent.costoFabricacion)}
                      {rent.insumos > 0 && (
                        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>
                          {fmtARS(rent.costoMaterial)} mat. + {fmtARS(rent.insumos)} ins.
                        </div>
                      )}
                    </>
                  ) : noCalc}
                </div>
                <div style={{ fontWeight: 600 }}>
                  {rent.calculable ? (
                    <>
                      {fmtARS(rent.precioVenta)}
                      {rent.esManual ? (
                        <div
                          style={{ fontSize: 10, color: "#B56B3E", fontWeight: 700 }}
                          title={`Precio cargado a mano. La fórmula daría ${fmtARS(rent.precioFormula)}.`}
                        >
                          (manual)
                        </div>
                      ) : rent.insumos > 0 ? (
                        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>
                          incl. {fmtARS(rent.insumos)} insumos
                        </div>
                      ) : null}
                    </>
                  ) : noCalc}
                </div>
                <div>
                  {!rent.calculable ? noCalc : (
                    <div>
                      <div style={{ fontWeight: 700, color: margenColor }}>
                        {fmtARS(rent.ganancia)}
                      </div>
                      <div style={{
                        display: "inline-block", marginTop: 3,
                        padding: "2px 7px", borderRadius: 2,
                        background: margenColor + "18",
                        color: margenColor, fontSize: 11, fontWeight: 700,
                      }}>
                        {rent.margen.toFixed(1)}%
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
