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
  motivoFaltante, motivoFaltanteInsumo,
  FACTOR_DISPONIBILIDAD, specsDesdeReceta, filamentosDe, necesitaRestock,
} from '../lib/disponibilidad.js';
import {
  calcularDisponibilidad, disponibilidadPorVariantes, normalizarReceta,
  nombreSugerido, nuevoId, filamentosDeVariantes, variantesPublicas,
  variantesPrivadas, filasDeInventario, filasDeInsumos,
} from '../lib/variantes.js';
import {
  nuevoIdInsumo, disponibilidadDeGrupo, insumosDuplicados, gruposPublicos,
  gruposPrivados, normalizarGruposPublicos, permiteManual, manualesIgnorados,
  cantidadDeOpcion,
} from '../lib/variantesInsumo.js';
import { cargarInsumos } from '../lib/insumos.js';
import {
  tiposDe, buscarTipo, esMultiTipo, resolverInsumoTipo, etiquetaInsumoTipo,
  etiquetaDeReferencia, tipoIdEfectivo, claveTipo,
} from '../lib/tiposInsumo.js';
import {
  cargarPersonalizadosCompletos, guardarPersonalizado, eliminarPersonalizado,
} from '../lib/personalizados.js';
import { InsumosTab } from './admin/InsumosTab.jsx';
import { EstadisticasTab } from './admin/EstadisticasTab.jsx';
import { MensajeriaTab } from './admin/MensajeriaTab.jsx';
import { cargarMensajes, asignarNumerosFaltantes } from '../lib/mensajes.js';
import { contarNoLeidos } from '../lib/consultas.js';
import { useFiltrosCategoria, FiltrosCategoria } from '../components/FiltrosCategoria.jsx';
import { ArchivosDiseno } from './admin/ArchivosDiseno.jsx';
import { normalizarArchivos } from '../lib/archivosDiseno.js';
import { CAT_PERSONALIZADOS } from '../lib/filtros.js';
import {
  cargarFilamentos, cargarPedidos, recalcularDisponibilidad, migrarProductosAVariantes,
  asegurarFilamentosDeReceta,
} from '../lib/inventario.js';
import { materialesUsados, coloresUsados, resolverValor } from '../lib/opcionesFilamento.js';
import { SelectorConAgregar } from '../components/SelectorConAgregar.jsx';
import { cargarTags, guardarTags, eliminarTag, productosConTag } from '../lib/tags.js';
import {
  cargarPrivados, guardarPrivado, enriquecerProductos, migrarDatosPrivados,
  CAMPOS_PRIVADOS,
} from '../lib/productosPrivados.js';
import {
  DEFAULT_COSTS, MARGEN_MATERIAL, margenDeCostos, calcularRentabilidad, calcularPrecioSugerido,
  filasDeRentabilidad, filtrarFilas, materialesDeCostos,
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
  const [mensajes, setMensajes] = useState([]);
  const [tags, setTags] = useState([]);
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
      // Igual que en el catálogo: los colores salen de las variantes. Un
      // personalizado normalmente tiene una sola, la que se acordó con el
      // cliente, pero pasa por el mismo camino.
      const { creados } = await asegurarFilamentosDeReceta(
        filamentosDeVariantes(data.receta, data.variantes), filamentos);
      if (creados.length > 0) await loadFilamentos();
      await guardarPersonalizado(data);
      setMsg(
        (data._id ? "✓ Personalizado actualizado." : "✓ Personalizado creado.") +
        (creados.length > 0
          ? ` Se crearon en Inventario con 0 g: ${creados.map(c => `${c.material} · ${c.color}`).join(", ")}.`
          : "")
      );
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

  /**
   * Carga la bandeja y, de paso, le pone número a las consultas que llegaron
   * sin él. El formulario público no puede numerar (necesitaría leer la
   * colección, que las reglas le prohíben), así que el correlativo se asigna
   * acá, con la sesión admin. Si ya están todas numeradas no escribe nada.
   */
  const loadMensajes = async () => {
    try {
      const list = await cargarMensajes();
      const numerados = await asignarNumerosFaltantes(list);
      const final = numerados > 0 ? await cargarMensajes() : list;
      setMensajes(final);
      return final;
    } catch (err) { console.error(err); return []; }
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
  const sincronizarDisponibilidad = async (prodsFull, films, insus, costs = null) => {
    try {
      const resultado = await recalcularDisponibilidad(prodsFull, films, insus, costs);
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
        preciosActualizados: 0, tiemposMigrados: 0, tiemposIlegibles: [],
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

  // Botón manual: recalcula desde la receta todo lo derivado — disponibilidad,
  // specs.material / specs.peso y el precio de los que están en automático —
  // sobre el catálogo completo. Es el que hay que apretar después de cambiar
  // el multiplicador de margen o un costo por gramo.
  const handleRecalcular = async () => {
    setMsg("Recalculando desde las recetas...");
    // La configuración se relee: puede haberse guardado recién en el tab Costos.
    await loadCosts();
    const snap = await getDoc(doc(db, "settings", "costos"))
      .catch(() => null);
    const costsFrescos = snap?.exists() ? snap.data() : costSettings;
    const { prodsFull, films, insus } = await recargarTodo();
    const {
      disponibilidadActualizada, specsActualizadas, preciosActualizados,
      variantesActualizadas, tiemposMigrados, tiemposIlegibles,
    } = await sincronizarDisponibilidad(prodsFull, films, insus, costsFrescos);
    const sinReceta = prodsFull.filter(p => (p.receta || []).length === 0).length;
    const manuales = prodsFull.filter(p => p.precioManual === true).length;
    setMsg(
      `✓ Recalculado sobre ${prodsFull.length} productos: ` +
      `${disponibilidadActualizada} con disponibilidad actualizada, ` +
      `${specsActualizadas} con material/peso actualizados, ` +
      `${variantesActualizadas} con variantes actualizadas, ` +
      `${preciosActualizados} con precio actualizado ` +
      `(margen ×${margenDeCostos(costsFrescos)}), ` +
      `${tiemposMigrados} con tiempo de impresión migrado.` +
      (manuales > 0 ? ` ${manuales} con precio manual quedaron intactos.` : "") +
      (sinReceta > 0 ? ` ${sinReceta} sin receta quedaron NO disponibles.` : "")
    );
    setTiemposIlegibles(tiemposIlegibles || []);
  };

  /**
   * Migración a variantes. Primero SIMULA y muestra exactamente qué se va a
   * crear; recién si se confirma escribe. Nunca corre sola: los datos reales
   * no se tocan sin que alguien lea el plan.
   */
  const handleMigrarVariantes = async () => {
    setMsg("Revisando qué productos hay que migrar...");
    const { prodsFull } = await recargarTodo();
    const previa = await migrarProductosAVariantes(prodsFull, true);

    if (previa.aMigrar === 0) {
      setMsg(
        `No hay nada que migrar sobre ${previa.revisados} producto(s).` +
        (previa.saltados.length > 0
          ? ` Saltados: ${previa.saltados.slice(0, 5).map(x => `${x.nombre} (${x.motivo})`).join("; ")}` +
            `${previa.saltados.length > 5 ? ` y ${previa.saltados.length - 5} más.` : "."}`
          : "")
      );
      return;
    }

    const lista = previa.detalle.slice(0, 12)
      .map(d => `· ${d.nombre} → "${d.variante}"`).join("\n");
    const ok = confirm(
      `Se va a crear UNA variante en ${previa.aMigrar} producto(s), con los colores ` +
      `que cada receta ya tenía:\n\n${lista}` +
      `${previa.detalle.length > 12 ? `\n· y ${previa.detalle.length - 12} más...` : ""}` +
      `\n\nLos ${previa.saltados.length} restantes no se tocan. ¿Seguimos?`
    );
    if (!ok) { setMsg("Migración cancelada. No se escribió nada."); return; }

    setMsg("Migrando...");
    try {
      const r = await migrarProductosAVariantes(prodsFull, false);
      // El barrido recalcula la disponibilidad de las variantes recién creadas.
      const { prodsFull: frescos, films, insus } = await recargarTodo();
      await sincronizarDisponibilidad(frescos, films, insus);
      onProductsChange?.();
      setMsg(`✓ ${r.migrados} producto(s) migrados a variantes. Revisá los nombres visibles.`);
    } catch (err) {
      setMsg("Error al migrar: " + err.message);
    }
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

  // El tab Costos tiene su propia copia editable de settings/costos; esta es
  // la que usan el ProductForm y las tablas. Al guardar allá hay que refrescar
  // esta, o el precio sugerido del formulario sigue con el multiplicador viejo
  // hasta recargar la página.
  const loadCosts = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "costos"));
      if (snap.exists()) setCostSettings(snap.data());
    } catch (e) { /* silently ignore, use defaults */ }
  };

  useEffect(() => {
    const loadTags = async () => { setTags(await cargarTags()); };
    Promise.all([loadProducts(), loadUsers(), loadCosts(), loadFilamentos(), loadPedidos(), loadInsumos(), loadPersonalizados(), loadMensajes(), loadTags()])
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
  const handleAgregarTag = async (tag) => {
    const nuevos = [...tags, tag];
    setTags(nuevos);
    try { await guardarTags(nuevos); }
    catch (err) { setMsg("No se pudo guardar el tag: " + err.message); }
  };

  /**
   * Borrar un tag lo limpia de los productos que lo usaban. Se eligió limpiar
   * y no dejarlo como texto suelto: un tag borrado que sigue pintando su badge
   * en el catálogo público, sobre productos que ya no se pueden gestionar, es
   * un borrado a medias. El conteo se muestra ANTES de confirmar.
   *
   * @returns {boolean} si se borró, para que el formulario abierto pueda
   *   limpiar el campo cuando el tag borrado era el que tenía cargado.
   */
  const handleEliminarTag = async (tag, { seleccionada } = {}) => {
    const enUso = productosConTag(products, tag);
    const aviso = enUso.length > 0
      ? `¿Eliminar el tag "${tag}"?\n\nLo usan ${enUso.length} producto(s): ` +
        `${enUso.slice(0, 5).map(p => p.name).join(", ")}` +
        `${enUso.length > 5 ? ` y ${enUso.length - 5} más` : ""}.\n\n` +
        `Se les va a quitar el tag y dejan de mostrar el badge en el catálogo.`
      : `¿Eliminar el tag "${tag}"? No lo usa ningún producto.`;
    const usando = seleccionada
      ? `\n\nEs el tag cargado en este formulario: se va a quedar sin tag.`
      : "";
    if (!confirm(aviso + usando)) return false;

    try {
      const { limpiados } = await eliminarTag(tag, tags, products);
      setTags(await cargarTags());
      if (limpiados > 0) {
        await loadProducts();
        onProductsChange?.();
      }
      setMsg(`✓ Tag "${tag}" eliminado${limpiados > 0 ? `, y quitado de ${limpiados} producto(s)` : ""}.`);
      return true;
    } catch (err) {
      setMsg("Error al eliminar el tag: " + err.message);
      return false;
    }
  };

  const handleSave = async (data) => {
    try {
      // Si la receta usa un material+color que no está en inventario, se crea
      // con 0 g antes de calcular nada: así el rollo queda listado y marcado
      // para restock, y la disponibilidad se calcula contra el inventario ya
      // completo (que va a dar "no disponible", como corresponde).
      // Los material+color que hay que asegurar salen ahora de las VARIANTES:
      // la receta ya no tiene color.
      const { creados } = await asegurarFilamentosDeReceta(
        filamentosDeVariantes(data.receta, data.variantes), filamentos);
      const films = creados.length > 0 ? await loadFilamentos() : filamentos;

      // El catálogo público solo lee este booleano: se recalcula al guardar,
      // porque la receta o las variantes pudieron haber cambiado.
      const disponible = calcularDisponibilidad(data, films, insumos).disponible;

      // El doc público NO lleva receta/origenUrl/notas/insumos: van a la
      // subcolección privada, que solo pueden leer los admins.
      // Se renombra al destructurar para no tapar el estado `insumos` (el
      // catálogo), que se usa arriba en el mismo bloque.
      const {
        _id, receta, origenUrl, notas, insumos: insumosProducto, archivos,
        variantes: variantesEnteras, variantesInsumo: gruposEnteros, ...publico
      } = data;
      const privado = {
        receta: receta || [],
        origenUrl: origenUrl || "",
        notas: notas || "",
        insumos: insumosProducto || [],
        archivos: archivos || [],
        // Solo la asignación de colores.
        variantes: variantesPrivadas(variantesEnteras || []),
        // Y a qué insumo apunta cada opción, con su cantidad.
        variantesInsumo: gruposPrivados(gruposEnteros || []),
      };
      // Y al doc público solo el nombre visible, la aclaración y el booleano.
      publico.variantes = variantesPublicas(
        { ...data, receta: receta || [] }, films, insumos);
      // De los grupos, el nombre y el precio de cada opción: el navegador los
      // necesita para mostrar cuánto sale cada una. El insumo no viaja.
      publico.variantesInsumo = gruposPublicos(gruposEnteros || [], insumos);

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
      if (creados.length > 0) {
        setMsg(
          `✓ Producto guardado. Se crearon en Inventario con 0 g: ` +
          creados.map(c => `${c.material} · ${c.color}`).join(", ") +
          `. Cargales filamento para que el producto quede disponible.`
        );
      }
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
    { id: "mensajeria", label: "Mensajería", icon: <Icon.mail size={16}/>, badge: contarNoLeidos(mensajes) },
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
                {/* Contador de no leídos: la razón de entrar al tab es que
                    haya algo nuevo, y si no se ve desde la nav no se entra. */}
                {n.badge > 0 && (
                  <span style={{
                    marginLeft: "auto", background: "var(--accent)", color: "#fff",
                    fontSize: 10, fontWeight: 700, borderRadius: 10,
                    padding: "2px 7px", minWidth: 18, textAlign: "center",
                  }}>
                    {n.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main>
          {tab === "dashboard" && <DashboardTab products={products} users={users} seedProducts={() => {}} categories={propCategories} onCategoriesChange={onCategoriesChange} onProductsChange={onProductsChange} setMsg={setMsg} />}
          {tab === "productos" && (
            showForm
              ? <ProductForm product={editProduct} onSave={handleSave} onCancel={() => { setShowForm(false); setEditProduct(null); }} categories={propCategories} filamentos={filamentos} costs={costSettings} nextId={siguienteIdProducto(products)} catalogoInsumos={insumos}
                  tags={tags} onAgregarTag={handleAgregarTag} onEliminarTag={handleEliminarTag}/>
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
                  onMigrarVariantes={handleMigrarVariantes}
                  pendientesDeVariantes={productosFull.filter(
                    p => (p.variantes || []).length === 0 && (p.receta || []).length > 0).length}
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
          {tab === "mensajeria" && (
            <MensajeriaTab mensajes={mensajes} onChanged={loadMensajes} setMsg={setMsg} />
          )}
          {tab === "usuarios" && <UsersTab users={users} onToggleRole={toggleRole} />}
          {tab === "costos" && (
            <CostosTab
              products={productosFull}
              personalizados={personalizados}
              categories={propCategories}
              filamentos={filamentos}
              setMsg={setMsg}
              onCostsChange={loadCosts}
            />
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
// Exportado para poder montarlo aislado en las pruebas de navegador.
export function ProductsTab({
  products, costs = DEFAULT_COSTS, filamentos = [], insumos = [], categories = [], pendientesDeMigrar = 0,
  onEdit, onDelete, onNew, onToggleVisible, onRecalcular, onMigrarPrivados,
  onMigrarVariantes, pendientesDeVariantes = 0,
  onRenumerarIds, tiemposIlegibles = [], onCerrarTiempos,
}) {
  const [search, setSearch] = useState("");
  const [planRenumeracion, setPlanRenumeracion] = useState(null);
  const [expandido, setExpandido] = useState(null);

  // Cascada categoría → subcategoría, compartida con la tabla de Rentabilidad.
  const filtros = useFiltrosCategoria(categories);

  // Texto AND categoría AND subcategoría
  const filtered = products.filter(p => {
    const texto = search.trim().toLowerCase();
    const coincideTexto = !texto ||
      p.name?.toLowerCase().includes(texto) ||
      p.cat?.toLowerCase().includes(texto) ||
      p.id?.toLowerCase().includes(texto);
    return coincideTexto && filtros.coincide(p);
  });

  const hayFiltros = Boolean(search.trim()) || filtros.hayFiltro;
  const limpiarFiltros = () => { setSearch(""); filtros.limpiar(); };

  const sinReceta = products.filter(p => (p.receta || []).length === 0).length;
  const duplicados = useMemo(() => idsDuplicados(products), [products]);

  // ID | Nombre | Categoría | Precio | Costo fab. | Disponible | Origen | Visible | Acciones
  const COL = "70px 2fr 1fr 90px 90px 110px 70px 70px 90px";

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
          {pendientesDeVariantes > 0 && (
            <TKButton variant="outline" onClick={onMigrarVariantes} icon={<Icon.layers size={14}/>}>
              Migrar a variantes ({pendientesDeVariantes})
            </TKButton>
          )}
          <TKButton variant="outline" onClick={onRecalcular} icon={<Icon.spark size={14}/>}>
            Recalcular desde recetas
          </TKButton>
          <TKButton onClick={onNew} icon={<Icon.plus size={14}/>}>Nuevo producto</TKButton>
        </div>
      </div>

      {/* Buscador + filtros en cascada (se combinan con AND) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 320px) 1fr 1fr auto", gap: 12, alignItems: "end", marginBottom: 16 }} className="form-layout">
        <TKInput placeholder="Buscar producto..." icon={<Icon.search size={16}/>} value={search} onChange={e => setSearch(e.target.value)} />
        <FiltrosCategoria filtros={filtros} categories={categories} />
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
            <div>ID</div><div>Nombre</div><div>Categoría</div><div>Precio</div><div>Costo fab.</div><div>Disponible</div><div>Origen</div><div>Visible</div><div>Acciones</div>
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

                {abierto && <DisponibilidadDetalle disp={disp} producto={p} filamentos={filamentos} insumos={insumos}/>}
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

                {abierto && <DisponibilidadDetalle disp={disp} producto={p} filamentos={filamentos} insumos={insumos}/>}
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
// Material | Color | Variante(s) | Por unidad | Necesario | Owner | Cantidad | Estado
const COL_INVENTARIO = "1.1fr .9fr 1.2fr 85px 105px 1fr 95px 75px";
// Insumo | Origen (fijo o grupo) | Por unidad | Necesario | En catálogo | Estado
const COL_INSUMOS = "2fr 1.4fr 100px 110px 130px 90px";
const celdaFila = {
  display: "grid", gridTemplateColumns: COL_INVENTARIO,
  gap: 10, padding: "8px 0", fontSize: 12, alignItems: "center",
};
const Estado = ({ ok }) => (
  <div style={{ color: ok ? "#4a7a52" : "#c64138", fontWeight: 700 }}>{ok ? "OK" : "Falta"}</div>
);

/**
 * Una línea de la tabla receta vs. inventario.
 *
 * Con un solo rollo (o ninguno) es una fila como siempre, con la columna Owner
 * al lado de la cantidad. Con dos o más se parte: arriba el material+color con
 * el estado del conjunto, y debajo una fila indentada por owner con SU estado,
 * porque cada rollo se evalúa solo y hay que poder ver quién puede imprimir.
 */
function FilaInventario({ d }) {
  const owners = d.owners || [];
  if (owners.length <= 1) {
    return (
      <div style={{ ...celdaFila, borderTop: "1px solid var(--line)" }}>
        <div style={{ fontWeight: 600 }}>{d.material}</div>
        <div>{d.color}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.variantes.join(", ")}</div>
        <div>{d.gramosPorUnidad} g</div>
        <div style={{ fontWeight: 600 }}>{d.requerido} g</div>
        <div style={{ color: d.owner ? "var(--text)" : "var(--muted)" }}>{d.owner || "—"}</div>
        <div style={{ color: d.ok ? "var(--text)" : "#c64138", fontWeight: d.ok ? 400 : 700 }}>
          {d.existe ? `${d.enInventario} g` : "sin cargar"}
        </div>
        <Estado ok={d.ok}/>
      </div>
    );
  }
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <div style={{ ...celdaFila, paddingBottom: 2 }}>
        <div style={{ fontWeight: 600 }}>{d.material}</div>
        <div>{d.color}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.variantes.join(", ")}</div>
        <div>{d.gramosPorUnidad} g</div>
        <div style={{ fontWeight: 600 }}>{d.requerido} g</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{owners.length} owners</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {owners.filter(o => o.ok).length} pueden
        </div>
        <Estado ok={d.ok}/>
      </div>
      {owners.map(o => (
        <div key={o.id} style={{ ...celdaFila, padding: "5px 0" }}>
          <div/><div/><div/><div/><div/>
          <div style={{
            borderLeft: "2px solid var(--line-strong)", paddingLeft: 8,
            color: o.owner ? "var(--text)" : "var(--muted)",
          }}>
            {o.owner || "(sin owner)"}
          </div>
          <div style={{ color: o.ok ? "var(--text)" : "#c64138", fontWeight: o.ok ? 400 : 700 }}>
            {o.disponible} g
          </div>
          <Estado ok={o.ok}/>
        </div>
      ))}
    </div>
  );
}

function DisponibilidadDetalle({ disp, producto, filamentos = [], insumos = [] }) {
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
  // TODAS las combinaciones de TODAS las variantes, no solo las de la que se
  // está ofreciendo: si no, una variante sin stock queda invisible acá.
  const filasInventario = filasDeInventario(producto, filamentos);
  // Los fijos y las opciones de cada grupo, en una sola tabla.
  const filasInsumos = filasDeInsumos(producto, insumos);
  const faltantesTodos = filasInventario.filter(d => !d.ok);

  return (
    <div style={{ padding: "12px 16px 18px 34px", background: "var(--bg-alt)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>
        Receta vs. inventario — se exige {FACTOR_DISPONIBILIDAD}× el consumo de una unidad,
        para cada variante
      </div>
      {/* Estado de cada variante, antes del detalle: la tabla de abajo está
          unificada por rollo, así que sola no responde "¿esta variante se
          puede imprimir?". */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(disp.variantes || []).map(v => (
          <span key={v.id} style={{
            padding: "3px 9px", borderRadius: 2, fontSize: 11, fontWeight: 600,
            background: (v.disponible ? "#4a7a52" : "#c64138") + "18",
            color: v.disponible ? "#4a7a52" : "#c64138",
          }}>
            {v.nombre || "(sin nombre)"} — {v.disponible ? "en stock"
              : v.motivo === "sin-color" ? `falta el color de ${v.materialesSinColor.join(", ")}`
              : v.motivo === "sin-insumos" ? "faltan insumos"
              : "sin stock"}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
        Cada rollo se evalúa por separado: si dos personas tienen el mismo material y color,
        va <strong>una fila por owner</strong> y alcanza con que <strong>uno solo</strong> llegue
        al {FACTOR_DISPONIBILIDAD}× — el stock no se suma entre owners, porque una pieza sale
        de un rollo.
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: COL_INVENTARIO,
        gap: 10, padding: "8px 0", fontSize: 10, textTransform: "uppercase",
        letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700,
      }}>
        <div>Material</div><div>Color</div><div>Variante(s)</div><div>Por unidad</div><div>Necesario (×{FACTOR_DISPONIBILIDAD})</div><div>Owner</div><div>Cantidad</div><div>Estado</div>
      </div>
      {filasInventario.map((d, i) => (
        <FilaInventario key={i} d={d}/>
      ))}
      {faltantesTodos.length > 0 && (
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12, color: "#c64138", lineHeight: 1.7 }}>
          {faltantesTodos.map((f, i) => <li key={i}>{motivoFaltante(f)}</li>)}
        </ul>
      )}

      {/* Insumos: mismo criterio pero a 1x, no el doble. Van los FIJOS y
          también cada opción de cada grupo de variante de insumo, igual que
          arriba se listan todas las variantes de color y no solo una. */}
      {filasInsumos.length > 0 && (
        <>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700, margin: "18px 0 8px" }}>
            Insumos vs. catálogo — alcanza con tener lo que consume una unidad
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
            Los <strong>fijos</strong> van siempre en la pieza; de cada <strong>grupo</strong> se
            consume una sola opción, así que al grupo le alcanza con tener una con stock.
          </div>
          {/* Estado de cada insumo fijo y de cada grupo, como el de cada
              variante de color arriba: la tabla de abajo sola no responde de
              un vistazo "¿esto se puede armar hoy?". */}
          {(filasInsumos.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {filasInsumos.filter(f => f.esFijo).map((f, i) => (
                <span key={`fijo${i}`} style={{
                  padding: "3px 9px", borderRadius: 2, fontSize: 11, fontWeight: 600,
                  background: (f.ok ? "#4a7a52" : "#c64138") + "18",
                  color: f.ok ? "#4a7a52" : "#c64138",
                }}>
                  {f.nombre || "(sin nombre)"} — {f.ok ? "en stock"
                    : f.existe ? "sin stock" : "no está en el catálogo"}
                </span>
              ))}
              {(disp.gruposInsumo || []).map(g => (
                <span key={g.id} style={{
                  padding: "3px 9px", borderRadius: 2, fontSize: 11, fontWeight: 600,
                  background: (g.disponible ? "#4a7a52" : "#c64138") + "18",
                  color: g.disponible ? "#4a7a52" : "#c64138",
                }}>
                  {g.nombre || "(sin nombre)"} — {g.disponible
                    ? `${g.opciones.filter(o => o.disponible).length} de ${g.opciones.length} en stock`
                    : "ninguna opción con stock"}
                </span>
              ))}
            </div>
          )}
          <div style={{
            display: "grid", gridTemplateColumns: COL_INSUMOS,
            gap: 10, padding: "8px 0", fontSize: 10, textTransform: "uppercase",
            letterSpacing: 1.2, color: "var(--muted)", fontWeight: 700,
          }}>
            <div>Insumo</div><div>Origen</div><div>Por unidad</div><div>Necesario</div><div>En catálogo</div><div>Estado</div>
          </div>
          {filasInsumos.map((d, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: COL_INSUMOS,
              gap: 10, padding: "8px 0", fontSize: 12, borderTop: "1px solid var(--line)",
              alignItems: "center",
            }}>
              <div style={{ fontWeight: 600,
                color: d.sinConsumo ? "var(--muted)" : "var(--text)" }}>
                {d.nombre || (d.sinConsumo ? "Sin insumo" : "(sin nombre)")}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {d.origen}
                {!d.esFijo && d.opcionNombre && (
                  <span style={{ display: "block" }}>opción "{d.opcionNombre}"</span>
                )}
              </div>
              {/* La opción que no consume nada se muestra igual —existe y se
                  puede vender— pero sin números: no hay stock que mirar. */}
              <div style={{ color: d.sinConsumo ? "var(--muted)" : "var(--text)" }}>
                {d.sinConsumo ? "—" : `${d.cantidadPorUnidad} u.`}
              </div>
              <div style={{ fontWeight: d.sinConsumo ? 400 : 600,
                color: d.sinConsumo ? "var(--muted)" : "var(--text)" }}>
                {d.sinConsumo ? "—" : `${d.requerido} u.`}
              </div>
              <div style={{
                color: d.sinConsumo ? "var(--muted)" : d.ok ? "var(--text)" : "#c64138",
                fontWeight: d.sinConsumo ? 400 : d.ok ? 400 : 700,
              }}>
                {d.sinConsumo ? "—" : d.existe ? `${d.enCatalogo} u.` : "no está en el catálogo"}
              </div>
              {/* Una opción sin stock no es un faltante del producto: solo deja
                  de ofrecerse mientras otra del grupo sí esté. */}
              <div style={{
                color: d.sinConsumo ? "var(--muted)"
                  : d.ok ? "#4a7a52" : d.opcional ? "#B56B3E" : "#c64138",
                fontWeight: d.sinConsumo ? 400 : 700,
              }}>
                {d.sinConsumo ? "No requiere stock" : d.ok ? "OK" : d.opcional ? "Sin stock" : "Falta"}
              </div>
            </div>
          ))}
          {(disp.faltantesInsumos.length > 0 || (disp.gruposSinOpciones || []).length > 0) && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12, color: "#c64138", lineHeight: 1.7 }}>
              {disp.faltantesInsumos.map((f, i) => <li key={`f${i}`}>{motivoFaltanteInsumo(f)}</li>)}
              {(disp.gruposSinOpciones || []).map((g, i) => (
                <li key={`g${i}`}>
                  {g.nombre || "(sin nombre)"}: ninguna de sus {g.opciones.length} opciones
                  tiene stock, así que el producto no se puede armar.
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ─── Editor de receta de consumo (dentro del ProductForm) ─────────────
/**
 * Dice si el par material+color de la línea ya existe en inventario y con
 * cuántos gramos, o que se va a crear al guardar.
 *
 * Es lo que aporta la idea de "combinación": los dos desplegables sugieren
 * cada mitad por separado, pero lo que importa saber es si ESE par existe.
 */
function EstadoEnInventario({ linea, filamentos }) {
  const material = String(linea?.material || "").trim();
  const color = String(linea?.color || "").trim();
  if (!material || !color) return null;

  // Todos los rollos de ese par, no el primero: el mismo material+color puede
  // estar cargado por dos personas, y son stocks separados.
  const rollos = filamentosDe(filamentos, material, color);

  const base = { fontSize: 11, marginTop: 4, lineHeight: 1.5 };

  if (rollos.length > 0) {
    const alerta = rollos.every(necesitaRestock);
    return (
      <div style={{ ...base, color: alerta ? "#B56B3E" : "var(--muted)" }}>
        En inventario:{" "}
        {rollos.map((f, i) => (
          <span key={f._id}>
            {i > 0 && " · "}
            <strong>{f.cantidadGramos ?? 0} g</strong>
            {f.owner ? ` de ${f.owner}` : ""}
            {f.marca ? ` (${f.marca})` : ""}
            {necesitaRestock(f) ? " · restock" : ""}
          </span>
        ))}
        {rollos.length > 1 && (
          <span> — son rollos separados, no se suman.</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...base, color: "#B56B3E" }}>
      No está en inventario: al guardar se crea <strong>{material} · {color}</strong> con 0 g,
      y va a aparecer en Inventario marcado para restock. El producto queda no
      disponible hasta que le cargues filamento.
    </div>
  );
}

// Exportado para poder montarlo aislado en pruebas del formulario.
export function RecetaEditor({ receta, setReceta, filamentos }) {
  // Mismas listas que el formulario de Inventario, del mismo distinct.
  const materiales = materialesUsados(filamentos);

  const up = (i, patch) => setReceta(r => r.map((l, j) => j === i ? { ...l, ...patch } : l));
  const quitar = (i) => setReceta(r => r.filter((_, j) => j !== i));
  const agregar = () => setReceta(r => [...r, { id: nuevoId("l"), material: "", gramos: 0 }]);

  const totalGramos = receta.reduce((s, l) => s + (Number(l.gramos) || 0), 0);

  return (
    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>Receta de consumo</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Qué material y <strong>cuántos gramos</strong> consume una unidad. El color no se define
        acá: cada variante de abajo le asigna uno a cada línea. La disponibilidad exige tener al
        menos {FACTOR_DISPONIBILIDAD}× estos gramos del color de la variante.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {receta.map((l, i) => (
          <div key={l.id || i}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 36px", gap: 10, alignItems: "end" }}>
              <SelectorConAgregar
                value={l.material}
                opciones={materiales}
                onChange={material => up(i, { material })}
                resolver={resolverValor}
                placeholder="Nuevo material..."
                vacio="— Material —"
              />
              <input
                type="number"
                value={l.gramos}
                onChange={e => up(i, { gramos: e.target.value })}
                placeholder="Gramos"
                style={recetaInput}
              />
              <button onClick={() => quitar(i)} style={{ ...actionBtn, color: "#c64138", justifyContent: "center", height: 42 }} title="Quitar línea">
                <Icon.trash size={14}/>
              </button>
            </div>
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

// ─── Variantes de color ──────────────────────────────────────────────
// Una variante = un color por cada línea de receta, más el nombre que ve el
// cliente. El vínculo con el filamento es interno: nunca sale al catálogo.

/**
 * Una variante, plegable. El encabezado es lo único que queda visible al
 * colapsarla, así que lleva todo lo que hace falta para reconocerla sin
 * abrirla: el número, el nombre que ve el cliente (en vivo, porque sale del
 * mismo estado que el input) y si le falta algún color. El botón de eliminar
 * va FUERA del botón que pliega — anidar botones no es HTML válido y además
 * borrar sin querer al intentar plegar sería el peor error posible acá.
 */
function VarianteCard({ indice, variante, abierta, onAlternar, onQuitar, faltanColores, children }) {
  return (
    <div style={{
      background: "var(--bg-alt)", border: "1px solid var(--line)", borderRadius: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 12px" }}>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          title={abierta ? "Colapsar" : "Expandir"}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            textAlign: "left", fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          <span style={{
            color: "var(--muted)", display: "flex", flexShrink: 0,
            transform: abierta ? "none" : "rotate(-90deg)",
            transition: "transform .15s",
          }}>
            <Icon.chevron size={15}/>
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            textTransform: "uppercase", color: "var(--muted)", flexShrink: 0,
          }}>
            Variante {indice + 1}
          </span>
          {variante.nombre ? (
            <span style={{
              fontSize: 13, fontWeight: 600, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              · {variante.nombre}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
              · sin nombre
            </span>
          )}
          {faltanColores > 0 && (
            <span style={{
              flexShrink: 0, padding: "2px 7px", borderRadius: 2,
              background: "#B56B3E18", color: "#B56B3E",
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
              textTransform: "uppercase",
            }}>
              Falta{faltanColores > 1 ? "n" : ""} {faltanColores} color{faltanColores > 1 ? "es" : ""}
            </span>
          )}
        </button>

        <button onClick={onQuitar} style={{ ...actionBtn, color: "#c64138", flexShrink: 0 }}
          title="Eliminar variante">
          <Icon.trash size={14}/>
        </button>
      </div>

      {abierta && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function VariantesEditor({ receta, variantes, setVariantes, filamentos }) {
  const colores = coloresUsados(filamentos);
  const lineas = receta.filter(l => String(l.material || "").trim() && (Number(l.gramos) || 0) > 0);

  const up = (i, patch) => setVariantes(vs => vs.map((v, j) => j === i ? { ...v, ...patch } : v));
  const quitar = (i) => setVariantes(vs => vs.filter((_, j) => j !== i));

  const ponerColor = (i, lineaId, color) => setVariantes(vs => vs.map((v, j) => {
    if (j !== i) return v;
    const nueva = { ...v, colores: { ...v.colores, [lineaId]: color } };
    // El nombre visible se autocompleta mientras no lo hayan editado a mano:
    // escribirlo de nuevo en cada variante es puro trabajo repetido.
    return v.nombreEditado ? nueva : { ...nueva, nombre: nombreSugerido(receta, nueva) };
  }));

  // Qué tarjetas están abiertas. Es estado de UI y vive solo acá: no se guarda
  // con la variante ni entra en lo que se persiste. Las ya cargadas arrancan
  // colapsadas, que es el motivo del acordeón; la que se agrega se abre para
  // poder completarla.
  const [abiertas, setAbiertas] = useState(() => new Set());
  const alternar = (id) => setAbiertas(previas => {
    const nuevas = new Set(previas);
    if (nuevas.has(id)) nuevas.delete(id); else nuevas.add(id);
    return nuevas;
  });

  const agregar = () => {
    const id = nuevoId("v");
    setVariantes(vs => [
      ...vs, { id, nombre: "", aclaracion: "", colores: {}, disponible: false },
    ]);
    setAbiertas(previas => new Set(previas).add(id));
  };

  return (
    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>Variantes de color</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Las combinaciones de color que puede elegir el cliente. Cada una define un color por
        línea de receta. El cliente ve solo el nombre y la aclaración —{" "}
        <strong>nunca qué filamento usa cada variante</strong>.
      </div>

      {lineas.length === 0 ? (
        <div style={{ fontSize: 12, color: "#B56B3E", padding: "6px 0" }}>
          Cargá primero la receta: sin líneas de material no hay colores que asignar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {variantes.map((v, i) => (
            <VarianteCard
              key={v.id}
              indice={i}
              variante={v}
              abierta={abiertas.has(v.id)}
              onAlternar={() => alternar(v.id)}
              onQuitar={() => quitar(i)}
              // Colapsada esconde los selectores de color: si le falta alguno,
              // el encabezado tiene que decirlo o el aviso queda tapado.
              faltanColores={lineas.filter(l => !String(v.colores?.[l.id] || "").trim()).length}
            >
              {/* Un selector de color por línea de receta */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                {lineas.map(l => (
                  <div key={l.id}>
                    <SelectorConAgregar
                      label={`${l.material} · ${l.gramos} g`}
                      value={v.colores?.[l.id] || ""}
                      opciones={colores}
                      onChange={color => ponerColor(i, l.id, color)}
                      resolver={resolverValor}
                      placeholder="Nuevo color..."
                      vacio="— Color —"
                    />
                    <EstadoEnInventario
                      linea={{ material: l.material, color: v.colores?.[l.id] || "" }}
                      filamentos={filamentos}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="form-layout">
                <TKInput
                  label="Nombre visible"
                  value={v.nombre}
                  onChange={e => up(i, { nombre: e.target.value, nombreEditado: true })}
                  placeholder="Ej: Azul / Negro"
                  hint="Lo que ve el cliente en el selector."
                />
                <TKInput
                  label="Aclaración (opcional)"
                  value={v.aclaracion}
                  onChange={e => up(i, { aclaracion: e.target.value })}
                  placeholder="Ej: Color de la base"
                  hint="Qué parte del producto varía."
                />
              </div>
            </VarianteCard>
          ))}
        </div>
      )}

      {lineas.length > 0 && variantes.length === 0 && (
        <div style={{ fontSize: 12, color: "#c64138", padding: "6px 0" }}>
          Sin variantes cargadas: el producto queda NO disponible en el catálogo.
        </div>
      )}

      {lineas.length > 0 && (
        <button onClick={agregar} style={{
          background: "none", border: "1px dashed var(--line-strong)",
          padding: "8px 14px", cursor: "pointer", color: "var(--muted)",
          fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginTop: 12,
        }}>
          <Icon.plus size={12}/> Agregar variante
        </button>
      )}
    </div>
  );
}

// ─── Variantes de insumo ─────────────────────────────────────────────
// Grupos de opciones que cambian QUÉ insumo lleva la pieza (ej. "Tipo de luz":
// Monocolor o RGB). A diferencia del color, cada opción tiene su precio: el
// del insumo que consume. Mismo acordeón que las variantes de color.

export function VariantesInsumoEditor({ grupos, setGrupos, catalogo, insumosFijos = [], precioBase = 0 }) {
  const [abiertos, setAbiertos] = useState(() => new Set());
  const alternar = (id) => setAbiertos(previos => {
    const nuevos = new Set(previos);
    if (nuevos.has(id)) nuevos.delete(id); else nuevos.add(id);
    return nuevos;
  });

  const up = (i, patch) => setGrupos(gs => gs.map((g, j) => j === i ? { ...g, ...patch } : g));
  const quitar = (i) => setGrupos(gs => gs.filter((_, j) => j !== i));

  const upOpcion = (i, j, patch) => setGrupos(gs => gs.map((g, gi) => gi !== i ? g : {
    ...g,
    opciones: g.opciones.map((o, oi) => {
      if (oi !== j) return o;
      const nueva = { ...o, ...patch };
      // Cambiar de insumo ancla el primer tipo del nuevo: el tipo anterior es
      // de otro insumo y no significa nada acá.
      if (patch.insumoId !== undefined) {
        nueva.tipoId = tiposDe(catalogo.find(x => x._id === patch.insumoId))[0]?.tipoId || "";
      }
      // El nombre visible se autocompleta mientras no lo hayan escrito a mano.
      // Con varios tipos el que distingue a la opción es el TIPO ("RGB"), no
      // el insumo, que es el mismo en todas.
      if ((patch.insumoId !== undefined || patch.tipoId !== undefined) && !o.nombreEditado) {
        const insumo = catalogo.find(x => x._id === nueva.insumoId);
        const tipo = insumo ? buscarTipo(insumo, nueva.tipoId) : null;
        nueva.nombre = insumo
          ? (esMultiTipo(insumo) ? tipo?.nombre || "" : insumo.nombre || "")
          : "";
      }
      return nueva;
    }),
  }));
  const quitarOpcion = (i, j) => setGrupos(gs => gs.map((g, gi) =>
    gi !== i ? g : { ...g, opciones: g.opciones.filter((_, oi) => oi !== j) }));
  const agregarOpcion = (i) => setGrupos(gs => gs.map((g, gi) =>
    gi !== i ? g : { ...g, opciones: [...g.opciones, { id: nuevoIdInsumo("o"), nombre: "", insumoId: "", tipoId: "", cantidad: 1 }] }));

  const agregar = () => {
    const id = nuevoIdInsumo("g");
    setGrupos(gs => [...gs, { id, nombre: "", opciones: [
      { id: nuevoIdInsumo("o"), nombre: "", insumoId: "", tipoId: "", cantidad: 1 },
      { id: nuevoIdInsumo("o"), nombre: "", insumoId: "", tipoId: "", cantidad: 1 },
    ]}]);
    setAbiertos(previos => new Set(previos).add(id));
  };

  const duplicados = insumosDuplicados(insumosFijos, grupos, catalogo);
  // El precio manual es el precio FINAL de la opción; el automático es un
  // sumando. Mezclar las dos cosas entre varios grupos contaría la base de
  // más, así que solo se habilita con UN grupo.
  const manualHabilitado = permiteManual(grupos);
  const inertes = manualesIgnorados(grupos);

  return (
    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>Variantes de insumo</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Grupos de opciones que cambian qué insumo lleva la pieza (ej. "Tipo de luz":
        Monocolor o RGB). Cada opción suma <strong>su</strong> precio al del producto, así que
        el cliente ve un precio distinto según lo que elija. Se combinan con las variantes de
        color: si hay 3 colores y 2 luces, son 6 combinaciones.
      </div>

      <div style={{ padding: "10px 12px", background: "#B56B3E15", borderLeft: "3px solid #B56B3E", fontSize: 11.5, lineHeight: 1.6, marginBottom: 12 }}>
        Un insumo se carga <strong>una sola vez</strong>: o como insumo fijo (arriba), si la pieza
        siempre lo lleva, o como opción de un grupo, si el cliente elige entre varios. Cargarlo en
        los dos lados cobraría el costo dos veces.
        {duplicados.length > 0 && (
          <div style={{ color: "#c64138", fontWeight: 700, marginTop: 6 }}>
            Está en los dos lados: {duplicados.join(", ")}. Sacalo de uno.
          </div>
        )}
      </div>

      {inertes.length > 0 && (
        <div style={{ padding: "10px 12px", background: "#c6413812", borderLeft: "3px solid #c64138", fontSize: 11.5, lineHeight: 1.6, marginBottom: 12 }}>
          <strong style={{ color: "#c64138" }}>
            Hay precios manuales que hoy NO se aplican.
          </strong>{" "}
          El precio manual es el precio final de la opción, y con más de un grupo habría que
          sumarlo con los sumandos de los otros: la base quedaría contada dos veces. Mientras el
          producto tenga {grupos.length} grupos se cobra el cálculo automático en{" "}
          {inertes.join(", ")}. Los valores quedan guardados: si dejás un solo grupo, vuelven a regir.
        </div>
      )}

      {catalogo.length === 0 && (
        <div style={{ fontSize: 12, color: "#B56B3E", padding: "6px 0" }}>
          El catálogo de insumos está vacío. Cargalos en el tab Insumos para poder usarlos acá.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {grupos.map((g, i) => {
          const evaluado = disponibilidadDeGrupo(g, catalogo);
          // Las que no consumen nada no están "sin insumo": no lo necesitan.
          const sinOpciones = g.opciones.filter(
            o => !o.insumoId && cantidadDeOpcion(o) > 0).length;
          return (
            <GrupoInsumoCard
              key={g.id}
              indice={i}
              grupo={g}
              abierto={abiertos.has(g.id)}
              conStock={evaluado.opciones.filter(o => o.disponible).length}
              sinInsumo={sinOpciones}
              onAlternar={() => alternar(g.id)}
              onQuitar={() => quitar(i)}
            >
              <TKInput
                label="Nombre del grupo"
                value={g.nombre}
                onChange={e => up(i, { nombre: e.target.value })}
                placeholder="Ej: Tipo de luz"
                hint="El rótulo que ve el cliente arriba del selector."
              />

              <div style={{ ...labelStyle, margin: "14px 0 6px" }}>Opciones</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {g.opciones.map((o, j) => {
                  const insumo = catalogo.find(x => x._id === o.insumoId);
                  const evaluada = evaluado.opciones[j];
                  const tipos = tiposDe(insumo);
                  const eligeTipo = tipos.length > 1;
                  const tipoElegido = insumo ? buscarTipo(insumo, o.tipoId) : null;
                  // En 0 la opción no consume nada, y el formulario deja de
                  // pedir el insumo. Se mira la CANTIDAD y no
                  // opcionSinConsumo(), que también da true cuando falta el
                  // insumo: una opción a medio cargar tiene que seguir
                  // marcándose en rojo, no pasar por un "sin cargador".
                  const sinConsumo = cantidadDeOpcion(o) === 0;
                  return (
                    <div key={o.id}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: eligeTipo ? "1fr 1fr 1fr 80px 36px" : "1fr 1fr 80px 36px",
                        gap: 8, alignItems: "end",
                      }}>
                        <div>
                          {j === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Insumo</div>}
                          <select
                            value={o.insumoId}
                            onChange={e => upOpcion(i, j, { insumoId: e.target.value })}
                            style={{ ...selectStyle,
                              borderColor: (o.insumoId || sinConsumo) ? "var(--line)" : "#c64138" }}
                          >
                            <option value="">
                              {sinConsumo ? "Ninguno" : "Seleccionar insumo..."}
                            </option>
                            {catalogo.map(x => (
                              <option key={x._id} value={x._id}>
                                {x.nombre}
                                {esMultiTipo(x)
                                  ? ` — ${tiposDe(x).length} tipos`
                                  : ` — ${fmtARS(tiposDe(x)[0]?.precioUnidad || 0)}/u`}
                              </option>
                            ))}
                          </select>
                        </div>
                        {eligeTipo && (
                          <div>
                            {j === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Tipo</div>}
                            <select
                              value={tipoElegido?.tipoId || ""}
                              onChange={e => upOpcion(i, j, { tipoId: e.target.value })}
                              style={selectStyle}
                            >
                              {tipos.map(t => (
                                <option key={t.tipoId} value={t.tipoId}>
                                  {t.nombre} — {fmtARS(t.precioUnidad || 0)}/u ({t.cantidadDisponible} disp.)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          {j === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Nombre visible</div>}
                          <input
                            value={o.nombre}
                            onChange={e => upOpcion(i, j, { nombre: e.target.value, nombreEditado: true })}
                            placeholder="Ej: RGB"
                            style={recetaInput}
                          />
                        </div>
                        <div>
                          {j === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Cantidad</div>}
                          {/* 0 es válido acá: es como se ofrece un "Sin
                              cargador" al lado de un "Con cargador". Los
                              insumos fijos siguen exigiendo al menos 1. */}
                          <input
                            type="number" min="0"
                            value={o.cantidad}
                            onChange={e => upOpcion(i, j, { cantidad: e.target.value })}
                            style={recetaInput}
                          />
                        </div>
                        <button onClick={() => quitarOpcion(i, j)}
                          style={{ ...actionBtn, color: "#c64138", justifyContent: "center", height: 42 }}
                          title="Quitar opción">
                          <Icon.trash size={14}/>
                        </button>
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5,
                        color: sinConsumo ? "var(--muted)"
                          : !o.insumoId ? "#c64138"
                          : evaluada?.disponible ? "var(--muted)" : "#B56B3E" }}>
                        {sinConsumo
                          ? "En 0 no consume nada del catálogo: se puede ofrecer siempre, " +
                            "y no hace falta elegir insumo."
                          : !o.insumoId ? "Elegí el insumo: sin él la opción no se puede ofrecer."
                          : `${evaluada?.enCatalogo ?? 0} u. en catálogo` +
                            (eligeTipo && tipoElegido ? ` de "${tipoElegido.nombre}"` : "") +
                            (evaluada?.disponible ? "" : " · sin stock, no se va a ofrecer")}
                      </div>

                      {/* Precio de ESTA opción, con el mismo toggle que el
                          precio general del producto. La que no consume nada
                          también lo tiene: "Sin cargador" puede valer menos
                          que el precio base, no necesariamente lo mismo. */}
                      {(o.insumoId || sinConsumo) && (
                        <PrecioDeOpcion
                          manual={o.manual === true}
                          sinConsumo={sinConsumo}
                          habilitado={manualHabilitado}
                          valor={o.precioManual}
                          automatico={precioBase + (evaluada?.precio || 0)}
                          sumando={evaluada?.precio || 0}
                          onToggle={(activo) => upOpcion(i, j, {
                            manual: activo,
                            // Al activarlo arranca desde el automático, como
                            // hace el precio general del producto.
                            precioManual: activo
                              ? (o.precioManual ?? precioBase + (evaluada?.precio || 0))
                              : null,
                          })}
                          onChange={(v) => upOpcion(i, j, { precioManual: v })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <button onClick={() => agregarOpcion(i)} style={{
                background: "none", border: "1px dashed var(--line-strong)",
                padding: "6px 12px", cursor: "pointer", color: "var(--muted)",
                fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginTop: 10,
              }}>
                <Icon.plus size={12}/> Agregar opción
              </button>

              {g.opciones.length < 2 && (
                <div style={{ fontSize: 11, color: "#B56B3E", marginTop: 8 }}>
                  Un grupo con una sola opción no le da nada que elegir al cliente.
                </div>
              )}
            </GrupoInsumoCard>
          );
        })}
      </div>

      {grupos.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 0" }}>
          Sin grupos: el producto se vende con sus insumos fijos y un solo precio.
        </div>
      )}

      <button onClick={agregar} disabled={catalogo.length === 0} style={{
        background: "none", border: "1px dashed var(--line-strong)",
        padding: "8px 14px", cursor: catalogo.length === 0 ? "not-allowed" : "pointer",
        color: "var(--muted)", opacity: catalogo.length === 0 ? 0.5 : 1,
        fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginTop: 12,
      }}>
        <Icon.plus size={12}/> Agregar grupo
      </button>
    </div>
  );
}

/**
 * Precio de una opción: automático (base + costo del insumo) o fijado a mano.
 * Mismo toggle que el precio general del producto, pero por opción.
 */
function PrecioDeOpcion({ manual, habilitado, valor, automatico, sumando, sinConsumo = false, onToggle, onChange }) {
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ ...labelStyle, marginBottom: 0 }}>Precio de esta opción</div>
        <label style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 11,
          color: habilitado ? "var(--muted)" : "var(--line-strong)",
          cursor: habilitado ? "pointer" : "not-allowed", whiteSpace: "nowrap",
        }}>
          <input
            type="checkbox"
            checked={manual}
            disabled={!habilitado}
            onChange={e => onToggle(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: "var(--accent)",
              cursor: habilitado ? "pointer" : "not-allowed" }}
          />
          Editar precio manualmente
        </label>
      </div>

      {manual && habilitado ? (
        <>
          <input
            type="number"
            value={valor ?? ""}
            onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="0"
            style={{ ...recetaInput, borderColor: "var(--accent)" }}
          />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
            Precio <strong>final</strong> con esta opción, no un extra: reemplaza al cálculo.
            El automático daría {fmtARS(automatico)}.
          </div>
        </>
      ) : (
        <>
          <div style={{
            padding: "10px 12px", background: "var(--bg)",
            border: "1px dashed var(--line)", borderRadius: 4,
            fontSize: 13, fontWeight: 600, color: "var(--text)",
          }}>
            {fmtARS(automatico)}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
            {sinConsumo
              ? "El precio base, sin recargo: esta opción no consume ningún insumo."
              : <>Precio base + {fmtARS(sumando)} del insumo.</>}
            {!habilitado && manual && (
              <span style={{ color: "#c64138" }}>
                {" "}Hay un precio manual guardado ({fmtARS(valor || 0)}) que no se aplica con
                más de un grupo.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Misma tarjeta plegable que las variantes de color. */
function GrupoInsumoCard({ indice, grupo, abierto, conStock, sinInsumo, onAlternar, onQuitar, children }) {
  return (
    <div style={{ background: "var(--bg-alt)", border: "1px solid var(--line)", borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 12px" }}>
        <button type="button" onClick={onAlternar} aria-expanded={abierto}
          title={abierto ? "Colapsar" : "Expandir"}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            textAlign: "left", fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
          <span style={{
            color: "var(--muted)", display: "flex", flexShrink: 0,
            transform: abierto ? "none" : "rotate(-90deg)", transition: "transform .15s",
          }}>
            <Icon.chevron size={15}/>
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            textTransform: "uppercase", color: "var(--muted)", flexShrink: 0,
          }}>
            Grupo {indice + 1}
          </span>
          {grupo.nombre ? (
            <span style={{
              fontSize: 13, fontWeight: 600, color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              · {grupo.nombre}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
              · sin nombre
            </span>
          )}
          <span style={{
            flexShrink: 0, padding: "2px 7px", borderRadius: 2,
            background: (conStock > 0 ? "#4a7a52" : "#c64138") + "18",
            color: conStock > 0 ? "#4a7a52" : "#c64138",
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
          }}>
            {conStock} de {grupo.opciones.length} en stock
          </span>
          {sinInsumo > 0 && (
            <span style={{
              flexShrink: 0, padding: "2px 7px", borderRadius: 2,
              background: "#B56B3E18", color: "#B56B3E",
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
            }}>
              {sinInsumo} sin insumo
            </span>
          )}
        </button>
        <button onClick={onQuitar} style={{ ...actionBtn, color: "#c64138", flexShrink: 0 }}
          title="Eliminar grupo">
          <Icon.trash size={14}/>
        </button>
      </div>
      {abierto && (
        <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--line)" }}>
          {children}
        </div>
      )}
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
  const up = (i, patch) => setLineas(list => list.map((l, j) => {
    if (j !== i) return l;
    const nueva = { ...l, ...patch };
    // Al cambiar de insumo el tipo anterior no aplica: se ancla el primero del
    // insumo nuevo, y si tiene varios el selector de al lado deja elegir otro.
    if (patch.insumoId !== undefined) {
      nueva.tipoId = tiposDe(catalogo.find(x => x._id === patch.insumoId))[0]?.tipoId || "";
    }
    return nueva;
  }));
  const quitar = (i) => setLineas(list => list.filter((_, j) => j !== i));
  const agregar = () => setLineas(list => [...list, { insumoId: "", tipoId: "", cantidad: 1 }]);

  /** Precio vigente del TIPO elegido; si ya no está, el del snapshot. */
  const precioDe = (l) => {
    const { tipo } = resolverInsumoTipo(catalogo, l.insumoId, l.tipoId);
    return tipo ? Number(tipo.precioUnidad) || 0 : Number(l.precioUnidad) || 0;
  };
  const subtotalDe = (l) => precioDe(l) * Math.max(1, Number(l.cantidad) || 1);

  const total = lineas.filter(l => l.insumoId).reduce((s, l) => s + subtotalDe(l), 0);
  // Se bloquea un insumo solo cuando TODOS sus tipos ya están en otra línea:
  // llevar el led monocolor y el RGB fijos en la misma pieza es válido.
  const usados = new Set(lineas
    .filter(l => l.insumoId)
    .map(l => claveTipo(l.insumoId, tipoIdEfectivo(catalogo, l.insumoId, l.tipoId))));
  const agotado = (x, lineaActual) => tiposDe(x)
    .every(t => claveTipo(x._id, t.tipoId) !== claveTipo(
      lineaActual.insumoId, tipoIdEfectivo(catalogo, lineaActual.insumoId, lineaActual.tipoId))
      && usados.has(claveTipo(x._id, t.tipoId)));

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
          const tipos = tiposDe(insumo);
          // Con un solo tipo se ancla solo y el selector sería una fila con una
          // única opción: se muestra únicamente cuando hay algo que elegir.
          const eligeTipo = tipos.length > 1;
          const tipoElegido = insumo ? buscarTipo(insumo, l.tipoId) : null;
          return (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: eligeTipo ? "1fr 1fr 90px 120px 36px" : "1fr 90px 120px 36px",
              gap: 10, alignItems: "center",
            }}>
              <div>
                {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Insumo</div>}
                <select
                  value={l.insumoId}
                  onChange={e => up(i, { insumoId: e.target.value })}
                  style={{ ...selectStyle, borderColor: huerfano ? "#c64138" : "var(--line)" }}
                >
                  <option value="">Seleccionar insumo...</option>
                  {catalogo.map(x => (
                    <option key={x._id} value={x._id} disabled={agotado(x, l)}>
                      {x.nombre}
                      {esMultiTipo(x)
                        ? ` — ${tiposDe(x).length} tipos`
                        : ` — ${fmtARS(tiposDe(x)[0]?.precioUnidad || 0)}/u ` +
                          `(${tiposDe(x)[0]?.cantidadDisponible ?? 0} disp.)`}
                    </option>
                  ))}
                </select>
                {huerfano && (
                  <div style={{ fontSize: 11, color: "#c64138", marginTop: 4 }}>
                    "{l.nombre || "insumo"}" ya no está en el catálogo. Elegí otro o quitá la línea.
                  </div>
                )}
              </div>
              {eligeTipo && (
                <div>
                  {i === 0 && <div style={{ ...labelStyle, marginBottom: 4 }}>Tipo</div>}
                  <select
                    value={tipoElegido?.tipoId || ""}
                    onChange={e => up(i, { tipoId: e.target.value })}
                    style={selectStyle}
                  >
                    {tipos.map(t => (
                      <option key={t.tipoId} value={t.tipoId}>
                        {t.nombre} — {fmtARS(t.precioUnidad || 0)}/u ({t.cantidadDisponible} disp.)
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
function DisponibilidadPreview({ receta, variantes = [], filamentos, insumos = [], gruposInsumo = [], catalogoInsumos = [] }) {
  const limpia = receta
    .filter(l => String(l.material || "").trim() && (Number(l.gramos) || 0) > 0)
    .map(l => ({ ...l, material: l.material.trim(), gramos: Number(l.gramos) }));

  const aviso = (texto, detalle) => (
    <div style={{ padding: "12px 14px", background: "#c6413812", borderLeft: "3px solid #c64138", fontSize: 12, lineHeight: 1.6 }}>
      <strong style={{ color: "#c64138" }}>{texto}</strong>
      <div style={{ color: "var(--muted)", marginTop: 4 }}>{detalle}</div>
    </div>
  );

  if (limpia.length === 0) {
    return aviso("Sin receta: el producto queda NO disponible",
      'En el catálogo público se muestra con el badge "Sin stock" hasta que cargues al menos una línea de consumo.');
  }
  if (variantes.length === 0) {
    return aviso("Sin variantes: el producto queda NO disponible",
      "El cliente elige un color entre las variantes; sin ninguna cargada no hay nada que ofrecer.");
  }

  // Cada variante se evalúa por separado y alcanza con que una tenga stock.
  const disp = disponibilidadPorVariantes(
    { receta: limpia, variantes, insumos, variantesInsumo: gruposInsumo },
    filamentos, catalogoInsumos);
  const color = disp.disponible ? "#4a7a52" : "#c64138";
  const conStock = disp.variantes.filter(v => v.disponible).length;

  return (
    <div style={{ padding: "12px 14px", background: color + "12", borderLeft: `3px solid ${color}`, fontSize: 12, lineHeight: 1.6 }}>
      <strong style={{ color }}>
        {disp.disponible
          ? `Disponible: ${conStock} de ${disp.variantes.length} variante(s) en stock`
          : "No disponible: ninguna variante tiene stock"}
      </strong>

      <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
        {disp.variantes.map(v => (
          <li key={v.id} style={{ color: v.disponible ? "#4a7a52" : "var(--muted)" }}>
            <strong>{v.nombre || "(sin nombre)"}</strong>
            {v.disponible ? " — en stock" : v.motivo === "sin-color"
              ? ` — falta elegir el color de ${v.materialesSinColor.join(", ")}`
              : v.motivo === "sin-insumos" ? " — faltan insumos"
              : ` — ${v.faltantes.map(motivoFaltante).join("; ")}`}
          </li>
        ))}
      </ul>

      {/* Un grupo de insumo sin ninguna opción con stock deja al producto sin
          poder armarse, aunque haya colores disponibles. */}
      {(disp.gruposSinOpciones || []).length > 0 && (
        <div style={{ marginTop: 8, color: "#c64138" }}>
          Sin opciones con stock en: {disp.gruposSinOpciones.map(g => g.nombre || "(sin nombre)").join(", ")}.
          El producto no se puede armar hasta reponer alguno de esos insumos.
        </div>
      )}

      {(disp.faltantesInsumos.length > 0) && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
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
// Exportado para poder montarlo aislado en las pruebas de navegador.
export function ProductForm({
  product, onSave, onCancel, categories = [], filamentos = [], costs = DEFAULT_COSTS,
  nextId = "", catalogoInsumos = [], modo = "producto",
  tags = [], onAgregarTag, onEliminarTag,
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
    // "stock" no vive más en el form: la disponibilidad sale de la receta +
    // el inventario. El campo puede seguir existiendo en documentos viejos de
    // Firestore, pero ni se lee ni se reescribe.
    visible: product?.visible !== false,
    specs: product?.specs || { material: "", tiempo: "", peso: "" },
    origenUrl: product?.origenUrl || "",
    notas: product?.notas || "",
  });
  const [images, setImages] = useState(initImages);
  // normalizarReceta le pone id a las líneas viejas, que no lo tenían: es lo
  // que permite que una variante le asigne un color a cada una.
  const [receta, setReceta] = useState(() => normalizarReceta(product?.receta || []));
  const [gruposInsumo, setGruposInsumo] = useState(() =>
    (product?.variantesInsumo || []).map(g => ({
      id: g.id || nuevoIdInsumo("g"),
      nombre: g.nombre || "",
      opciones: (g.opciones || []).map(o => ({
        id: o.id || nuevoIdInsumo("o"),
        nombre: o.nombre || "",
        insumoId: o.insumoId || "",
        // Vacío en las opciones anteriores a los tipos: se ancla al primero.
        tipoId: o.tipoId || "",
        cantidad: Math.max(1, Number(o.cantidad) || 1),
        manual: o.manual === true || (o.precioManual !== null && o.precioManual !== undefined),
        precioManual: o.precioManual ?? null,
        nombreEditado: Boolean(o.nombre),
      })),
    }))
  );
  const [variantes, setVariantes] = useState(() =>
    (product?.variantes || []).map(v => ({
      id: v.id || nuevoId("v"),
      nombre: v.nombre || "",
      aclaracion: v.aclaracion || "",
      colores: { ...(v.colores || {}) },
      // Un nombre ya guardado no se pisa con el autogenerado al tocar colores.
      nombreEditado: Boolean(v.nombre),
    }))
  );
  // Líneas de insumo del producto. Se conserva el snapshot (nombre/precioUnidad)
  // por si el insumo desapareció del catálogo.
  // Los archivos ya viven en Storage y en el doc privado antes de que el
  // formulario se guarde; el estado local solo evita que el "Guardar", que
  // reescribe el doc privado entero, los borre.
  const [archivos, setArchivos] = useState(() => normalizarArchivos(product?.archivos));
  const [lineasInsumo, setLineasInsumo] = useState(() =>
    (product?.insumos || [])
      .filter(i => i && i.insumoId)
      .map(i => ({
        insumoId: i.insumoId,
        // Las líneas guardadas antes de los tipos no lo traen: queda vacío y
        // buscarTipo() lo ancla al primer tipo del insumo, que es el que ya
        // estaba usando.
        tipoId: i.tipoId || "",
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
    .filter(l => String(l.material || "").trim() && (Number(l.gramos) || 0) > 0)
    .map(l => ({
      id: l.id,
      material: l.material.trim(),
      gramos: Number(l.gramos),
    })), [receta]);

  // Variantes válidas: las que le asignaron color a TODAS las líneas. Una a
  // medias no se guarda — quedaría ofreciendo algo que no se puede imprimir.
  const variantesLimpias = useMemo(() => variantes
    .filter(v => recetaLimpia.every(l => String(v.colores?.[l.id] || "").trim()))
    .map(v => ({
      id: v.id,
      nombre: (v.nombre || "").trim() || nombreSugerido(recetaLimpia, v),
      aclaracion: (v.aclaracion || "").trim(),
      colores: Object.fromEntries(
        recetaLimpia.map(l => [l.id, String(v.colores[l.id]).trim()])
      ),
    })), [variantes, recetaLimpia]);

  // Grupos válidos: con nombre y con al menos una opción que apunte a un
  // insumo. Los incompletos no se guardan — ofrecerían algo inexistente.
  const gruposLimpios = useMemo(() => gruposInsumo
    .map(g => ({
      id: g.id,
      nombre: (g.nombre || "").trim(),
      opciones: g.opciones
        // Se guarda la que apunta a un insumo y también la que no consume
        // nada: sin esto, "Sin cargador" desaparecía al guardar.
        .filter(o => o.insumoId || cantidadDeOpcion(o) === 0)
        .map(o => ({
          id: o.id,
          nombre: (o.nombre || "").trim()
            || etiquetaDeReferencia(catalogoInsumos, o.insumoId, o.tipoId) || "",
          insumoId: o.insumoId,
          // El tipo se resuelve al guardar: una opción vieja sin tipoId queda
          // anclada explícitamente al tipo que ya estaba usando. Sin insumo no
          // hay tipo que anclar.
          tipoId: o.insumoId ? tipoIdEfectivo(catalogoInsumos, o.insumoId, o.tipoId) : "",
          // Sin mínimo: el 0 es lo que hace que la opción no consuma nada.
          cantidad: cantidadDeOpcion(o),
          // Se guarda aunque hoy no aplique (más de un grupo): sacar el grupo
          // extra tiene que devolverlo a la vida sin recargarlo a mano.
          manual: o.manual === true,
          precioManual: o.manual === true && Number.isFinite(Number(o.precioManual))
            ? Number(o.precioManual) : null,
        })),
    }))
    .filter(g => g.nombre && g.opciones.length > 0), [gruposInsumo, catalogoInsumos]);

  // Material y peso salen de la receta y se recalculan en vivo mientras se edita.
  const specsCalculadas = useMemo(() => specsDesdeReceta(recetaLimpia), [recetaLimpia]);

  // Snapshot al guardar: nombre y precioUnidad quedan congelados en el producto,
  // así cambiar el precio en el catálogo no reescribe el histórico.
  const insumosLimpios = useMemo(() => lineasInsumo
    .filter(l => l.insumoId)
    .map(l => {
      const { insumo, tipo } = resolverInsumoTipo(catalogoInsumos, l.insumoId, l.tipoId);
      const cantidad = Math.max(1, Number(l.cantidad) || 1);
      const precioUnidad = tipo ? Number(tipo.precioUnidad) || 0 : Number(l.precioUnidad) || 0;
      return {
        insumoId: l.insumoId,
        // Igual que en las opciones: el tipo queda anclado explícitamente.
        tipoId: tipo?.tipoId || l.tipoId || "",
        nombre: insumo ? etiquetaInsumoTipo(insumo, tipo) : l.nombre || "",
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
      visible: form.visible,
      images: cleanImages,
      img: cleanImages[0] || "",
      receta: recetaLimpia,
      // Enteras. Quien guarda las parte en su mitad pública (products) y su
      // mitad privada (privado/data).
      variantes: variantesLimpias,
      variantesInsumo: gruposLimpios,
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
      // Viaja tal cual vino: el guardado del doc privado lo reemplaza entero,
      // así que omitirlo borraría el índice y dejaría los binarios huérfanos
      // en Storage.
      archivos,
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
                    {/* subs?, no solo currentCat?: una categoría guardada sin
                        el campo rompía el formulario entero. */}
                    {currentCat?.subs?.map(s => <option key={s} value={s}>{s}</option>)}
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
            <div style={{ gridColumn: "1 / -1" }}>
              <TKInput label="Descripción" value={form.desc} onChange={e => up("desc", e.target.value)} placeholder="Descripción del producto..." />
            </div>

            {/* Tag y "visible en el catálogo" no aplican a un personalizado:
                nunca sale al catálogo público. */}
            {!esPersonalizado && (
              <>
                {/* La lista vive en settings/tags, no hardcodeada. La papelera
                    de cada opción del desplegable la borra del catálogo y de los
                    productos que la usaban, avisando cuántos son. Si era la que
                    tenía este formulario, el campo queda sin tag. */}
                <SelectorConAgregar
                  label="Tag"
                  value={form.tag}
                  opciones={tags}
                  onChange={tag => up("tag", tag)}
                  onAgregar={onAgregarTag}
                  onEliminarOpcion={async (tag, info) => {
                    if (await onEliminarTag(tag, info) && info.seleccionada) up("tag", "");
                  }}
                  placeholder="Nuevo tag..."
                  vacio="Sin tag"
                />

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

          <VariantesEditor receta={receta} variantes={variantes} setVariantes={setVariantes}
            filamentos={filamentos}/>

          {/* Insumos opcionales (imanes, tornillos, cable...) */}
          <InsumosEditor lineas={lineasInsumo} setLineas={setLineasInsumo} catalogo={catalogoInsumos}/>

          <VariantesInsumoEditor grupos={gruposInsumo} setGrupos={setGruposInsumo}
            catalogo={catalogoInsumos} insumosFijos={insumosLimpios}
            precioBase={Number(precioFinal) || 0}/>

          {/* Vista previa de disponibilidad con el inventario actual */}
          <DisponibilidadPreview receta={receta} variantes={variantesLimpias} filamentos={filamentos}
            insumos={insumosLimpios} gruposInsumo={gruposLimpios} catalogoInsumos={catalogoInsumos}/>

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
            <div style={{ marginBottom: 16 }}>
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

            {/* Respaldo de los .stl/.3mf: también es dato interno, va con el
                resto. Se sube y se borra en el acto contra Storage, sin
                esperar al "Guardar" del formulario. */}
            <ArchivosDiseno
              productId={product?._id || null}
              archivos={archivos}
              onChange={setArchivos}
              coleccion={modo === "personalizado" ? "personalizados" : "products"}
            />
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

// Exportado para poder montarlo aislado en las pruebas de navegador.
export function CostosTab({
  products, personalizados = [], categories = [], filamentos = [], setMsg,
  onCostsChange,
}) {
  const [costs, setCosts] = useState(DEFAULT_COSTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMat, setNewMat] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // Mismos filtros en cascada que el tab Productos, más "Personalizados",
  // que no es una categoría real pero se quiere poder aislar.
  const filtros = useFiltrosCategoria(categories);

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
      // El resto del backoffice tiene su propia copia de esta config: sin
      // avisarle, el ProductForm seguiría sugiriendo con el margen viejo.
      await onCostsChange?.();
      setMsg(
        "✓ Costos guardados. Los precios YA guardados de cada producto no " +
        "cambian solos: usá \"Recalcular desde recetas\" en el tab Productos " +
        "para aplicarlos a los que tienen precio automático."
      );
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

  // La lista de materiales es la unión de los configurados y los que existen
  // en el inventario: un filamento nuevo aparece acá solo, sin que nadie
  // escriba en settings/costos al crearlo.
  const filasMateriales = materialesDeCostos(costs, filamentos);
  const pendientes = filasMateriales.filter(m => m.pendiente);

  // El margen que realmente se está aplicando, que no es lo tipeado si lo
  // tipeado no sirve.
  const margen = margenDeCostos(costs);
  const margenInvalido =
    costs.multiplicadorMargen !== undefined && !(Number(costs.multiplicadorMargen) > 0);

  // Fórmula y armado de filas en src/lib/costos.js: catálogo y personalizados
  // mezclados, con la misma fórmula para los dos.
  const todasLasFilas = filasDeRentabilidad(products, personalizados, costs);
  // Los tres filtros se combinan con AND sobre la tabla completa: catálogo y
  // personalizados juntos, sin un selector de tipo aparte.
  const rows = filtrarFilas(todasLasFilas, {
    busqueda,
    filtroCat: filtros.filtroCat,
    filtroSub: filtros.filtroSub,
  });
  const hayFiltros = Boolean(busqueda.trim()) || filtros.hayFiltro;
  const limpiarFiltros = () => { setBusqueda(""); filtros.limpiar(); };

  // Los contadores del encabezado describen el catálogo entero, no el filtro.
  const noCalculables = todasLasFilas.filter(r => !r.rent.calculable).length;
  const cantidadPersonalizados = todasLasFilas.filter(r => r.tipo === "personalizado").length;

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

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <TKInput
              label="Multiplicador de margen sobre material"
              type="number"
              value={costs.multiplicadorMargen ?? MARGEN_MATERIAL}
              onChange={e => setCosts(c => ({
                ...c, multiplicadorMargen: parseFloat(e.target.value) || 0,
              }))}
              error={margenInvalido}
            />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
              {margenInvalido ? (
                <span style={{ color: "#c64138" }}>
                  Tiene que ser mayor que 0: con 0 o menos el precio no cubriría
                  ni el material. Mientras tanto se calcula con ×{MARGEN_MATERIAL}.
                </span>
              ) : (
                <>
                  Cuántas veces se cobra el costo del material. Con ×{margen} un
                  gramo que cuesta $100 se vende a ${(100 * margen).toLocaleString("es-AR")}.
                  La hora de máquina y los insumos se suman aparte, sin margen.
                </>
              )}
            </div>
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
            {filasMateriales.map(({ material, costo, pendiente, configurado }) => (
              <div key={material} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{material}</div>
                  {pendiente && (
                    <span style={{
                      display: "inline-block", marginTop: 3, padding: "2px 7px",
                      background: "#B56B3E18", color: "#B56B3E", borderRadius: 2,
                      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
                      textTransform: "uppercase",
                    }}>
                      Pendiente de completar
                    </span>
                  )}
                </div>
                <div style={{ width: 120 }}>
                  <TKInput
                    type="number"
                    value={costo || ""}
                    onChange={e => upMat(material, e.target.value)}
                    error={pendiente}
                  />
                </div>
                {/* Si el material solo viene del inventario no hay fila que
                    borrar: sacarla acá la haría reaparecer en el próximo render. */}
                {configurado ? (
                  <button
                    onClick={() => removeMaterial(material)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
                    title="Eliminar material"
                  >
                    <Icon.trash size={14}/>
                  </button>
                ) : (
                  <span
                    style={{ width: 22, flexShrink: 0 }}
                    title="Viene del inventario: se saca eliminando los filamentos que lo usan"
                  />
                )}
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
            {pendientes.length > 0 && (
              <div style={{ marginBottom: 10, color: "#B56B3E", fontWeight: 600 }}>
                {pendientes.length} material(es) sin costo cargado:{" "}
                {pendientes.map(m => m.material).join(", ")}. Los productos que los usen
                no calculan precio ni rentabilidad hasta que les pongas un valor.
              </div>
            )}
            El precio de venta se deriva de este costo con el multiplicador de
            margen configurado arriba,{" "}
            <strong style={{ color: "var(--text)" }}>×{margen}</strong> sobre el material,
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
          cargado a mano si tiene precio manual, si no hora de máquina + gramos × costo/g × {margen} + insumos.
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

      {/* Buscador: mismo estilo y mismo criterio de matcheo que el de
          Pedidos (nombre o ID en catálogo, nombre o cliente en
          personalizados), pero acá filtra la tabla en vez de seleccionar. */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(200px, 320px) 1fr 1fr auto",
        gap: 12, alignItems: "end", marginBottom: 12,
      }} className="form-layout">
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Buscar</div>
          <TKInput
            placeholder="Por nombre, ID o cliente..."
            icon={<Icon.search size={16}/>}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <FiltrosCategoria
          filtros={filtros}
          categories={categories}
          opcionesExtra={[{ value: CAT_PERSONALIZADOS, label: "Personalizados" }]}
        />
        {hayFiltros && (
          <TKButton variant="ghost" onClick={limpiarFiltros} icon={<Icon.close size={14}/>}>Limpiar</TKButton>
        )}
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {rows.length} producto{rows.length !== 1 ? "s" : ""}
        {hayFiltros && <> de {todasLasFilas.length}</>}
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

                {/* Categoría: mismas pastillas apiladas que el listado de
                    Productos. Un personalizado no tiene categoría ni
                    subcategoría, lleva una sola con el mismo estilo. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  {p.badges.map(b => (
                    <TKPill key={b.texto} variant={b.variante}>{b.texto}</TKPill>
                  ))}
                </div>

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

          {/* Dos vacíos distintos: no hay nada cargado, o ningún producto pasa
              los filtros. El segundo usa el mismo texto que el buscador de
              Pedidos, y nombra el texto buscado solo si hay texto: el vacío
              puede venir de la categoría sin que se haya escrito nada. */}
          {rows.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              {hayFiltros
                ? (busqueda.trim()
                    ? <>No se encontraron productos para "{busqueda.trim()}" con esos filtros.</>
                    : "No se encontraron productos con esos filtros.")
                : "No hay productos visibles para analizar."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
