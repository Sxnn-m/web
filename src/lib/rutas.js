// ─── Rutas ───────────────────────────────────────────────────────────
// El sitio navegaba con un solo estado de React ("qué pantalla mostrar") y la
// URL nunca cambiaba: el historial tenía una sola entrada, así que el botón
// atrás se iba del sitio y no había link para compartir una sección.
//
// Acá viven las DOS traducciones entre ese estado y la URL:
//   rutaDe({route, data})  → "/producto/p01"
//   estadoDe(pathname)     → { route: "detalle", routeData: { id: "p01" } }
//
// El resto del código sigue llamando go("detalle", { id }) igual que antes:
// nadie fuera de App.jsx necesita saber que ahora hay URLs. Este módulo no
// importa React ni Firebase a propósito, para poder probarlo en Node pelado.

/** Los tabs del backoffice, en el orden del menú lateral. */
export const TABS_ADMIN = [
  "dashboard", "productos", "personalizados", "categorias", "inventario",
  "insumos", "pedidos", "estadisticas", "mensajeria", "usuarios", "costos",
];

/**
 * Las subcategorías no son slugs: son nombres de display con acentos y
 * espacios ("Decoración", "Accesorios tech"). Se slugifican para la URL y se
 * resuelven de vuelta comparando slugs, así no hace falta guardar un campo
 * nuevo en cada categoría ni mostrar un %C3%B3n en la barra de direcciones.
 */
export function slug(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // saca los acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** El nombre real de la subcategoría a partir de su slug, dentro de una categoría. */
export function subDesdeSlug(categories, catId, slugSub) {
  if (!slugSub) return undefined;
  const cat = (categories || []).find(c => c.id === catId);
  const encontrada = (cat?.subs || []).find(s => slug(s) === slugSub);
  // Si no matchea ninguna se devuelve el slug crudo: el catálogo simplemente
  // no va a filtrar por nada, que es mejor que romper.
  return encontrada ?? slugSub;
}

/** La URL de una pantalla. Es la inversa de estadoDe(). */
export function rutaDe(route, data = {}) {
  switch (route) {
    case "home": return "/";
    case "about": return "/sobre-nosotros";
    case "auth": return "/ingresar";
    case "detalle": return data.id ? `/producto/${encodeURIComponent(data.id)}` : "/catalogo";
    case "admin": {
      const tab = data.tab && TABS_ADMIN.includes(data.tab) ? data.tab : "dashboard";
      return tab === "dashboard" ? "/admin" : `/admin/${tab}`;
    }
    // "buscador" existe en el switch de pantallas pero ya nadie lo llama en el
    // árbol desktop: renderiza el mismo catálogo, así que comparte su URL.
    case "buscador":
    case "categoria":
    case "catalogo": {
      if (!data.cat) return "/catalogo";
      if (!data.sub) return `/catalogo/${slug(data.cat)}`;
      return `/catalogo/${slug(data.cat)}/${slug(data.sub)}`;
    }
    default: return "/";
  }
}

/**
 * La pantalla que corresponde a una URL.
 *
 * El default es "home" y no algo neutro a propósito: si alguna vez una URL no
 * matchea, el modo mantenimiento tiene que tratarla como pública y taparla.
 * Fallar hacia una ruta bloqueada es seguro; fallar hacia una abierta sería un
 * agujero silencioso en el sitio clausurado.
 */
export function estadoDe(pathname, categories = []) {
  const partes = String(pathname || "/").split("/").filter(Boolean).map(decodeURIComponent);

  if (partes.length === 0) return { route: "home", routeData: {} };

  switch (partes[0]) {
    case "sobre-nosotros": return { route: "about", routeData: {} };
    case "ingresar": return { route: "auth", routeData: {} };
    case "producto":
      return partes[1]
        ? { route: "detalle", routeData: { id: partes[1] } }
        : { route: "catalogo", routeData: {} };
    case "admin": {
      const tab = partes[1] && TABS_ADMIN.includes(partes[1]) ? partes[1] : "dashboard";
      return { route: "admin", routeData: { tab } };
    }
    case "catalogo": {
      if (!partes[1]) return { route: "catalogo", routeData: {} };
      // El id de categoría ya es un slug ("casa", "gadgets"), pero se resuelve
      // contra la lista igual, por si alguno llevara mayúsculas.
      const cat = (categories.find(c => slug(c.id) === partes[1])?.id) ?? partes[1];
      const sub = subDesdeSlug(categories, cat, partes[2]);
      return { route: "catalogo", routeData: sub ? { cat, sub } : { cat } };
    }
    default: return { route: "home", routeData: {} };
  }
}

/** ¿Esta URL corresponde a alguna pantalla conocida? Para el catch-all. */
export function esRutaConocida(pathname) {
  const primera = String(pathname || "/").split("/").filter(Boolean)[0];
  if (!primera) return true;
  return ["sobre-nosotros", "ingresar", "producto", "admin", "catalogo"].includes(primera);
}
