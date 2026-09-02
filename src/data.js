export const CATEGORIES = [
  {
    id: "casa",
    name: "Para la Casa",
    subs: ["Organizadores", "Decoración", "Cocina", "Baño"],
  },
  {
    id: "gadgets",
    name: "Gadgets",
    subs: ["Soportes", "Accesorios tech", "Oficina", "Juegos"],
  },
  {
    id: "lamparas",
    name: "Lámparas",
    subs: ["De mesa", "Colgantes", "Apliques", "Infantiles"],
  },
];

// Inline SVG placeholders (standalone-safe)
const IMG = {
  organizador: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F0E4D3'/><g fill='%23C17B3D' opacity='0.85'> <rect x='260' y='280' width='380' height='340' rx='12'/> <rect x='290' y='310' width='100' height='120' rx='6' fill='%23C17B3D' opacity='0.5'/> <rect x='400' y='310' width='100' height='120' rx='6' fill='%23C17B3D' opacity='0.6'/> <rect x='510' y='310' width='100' height='120' rx='6' fill='%23C17B3D' opacity='0.5'/> <rect x='290' y='440' width='320' height='150' rx='6' fill='%23C17B3D' opacity='0.6'/> </g><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23C17B3D' text-anchor='middle' opacity='0.75'>Organizador</text></svg>",
  maceta: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E8D5C0'/><polygon points='450,220 650,340 650,560 450,680 250,560 250,340' fill='%238B5A2B' opacity='0.85'/> <polygon points='450,290 590,370 590,530 450,610 310,530 310,370' fill='%238B5A2B' opacity='0.6'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%238B5A2B' text-anchor='middle' opacity='0.75'>Maceta</text></svg>",
  portallaves: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F5E8D4'/><rect x='230' y='340' width='440' height='180' rx='14' fill='%23B8691F' opacity='0.85'/> <circle cx='310' cy='560' r='22' fill='%23B8691F' opacity='0.7'/> <circle cx='400' cy='560' r='22' fill='%23B8691F' opacity='0.7'/> <circle cx='490' cy='560' r='22' fill='%23B8691F' opacity='0.7'/> <circle cx='580' cy='560' r='22' fill='%23B8691F' opacity='0.7'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23B8691F' text-anchor='middle' opacity='0.75'>Portallaves</text></svg>",
  jabonera: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F0E4D3'/><ellipse cx='450' cy='490' rx='280' ry='120' fill='%23C17B3D' opacity='0.85'/> <ellipse cx='450' cy='450' rx='240' ry='90' fill='%23C17B3D' opacity='0.6'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23C17B3D' text-anchor='middle' opacity='0.75'>Jabonera</text></svg>",
  portarollo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E3D3BC'/><rect x='310' y='360' width='280' height='200' rx='12' fill='%235C3A1E' opacity='0.85'/> <circle cx='450' cy='460' r='70' fill='%235C3A1E' opacity='0.5'/> <circle cx='450' cy='460' r='30' fill='%235C3A1E' opacity='0.85'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%235C3A1E' text-anchor='middle' opacity='0.75'>Portarollo</text></svg>",
  portacubiertos: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E8D5C0'/><rect x='220' y='340' width='460' height='220' rx='10' fill='%238B5A2B' opacity='0.85'/> <line x1='335' y1='340' x2='335' y2='560' stroke='%238B5A2B' stroke-width='6' opacity='0.4'/> <line x1='450' y1='340' x2='450' y2='560' stroke='%238B5A2B' stroke-width='6' opacity='0.4'/> <line x1='565' y1='340' x2='565' y2='560' stroke='%238B5A2B' stroke-width='6' opacity='0.4'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%238B5A2B' text-anchor='middle' opacity='0.75'>Cubiertos</text></svg>",
  soporteCel: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F5E8D4'/><rect x='380' y='260' width='140' height='260' rx='18' fill='%23B8691F' opacity='0.85'/> <rect x='280' y='560' width='340' height='60' rx='12' fill='%23B8691F' opacity='0.75'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23B8691F' text-anchor='middle' opacity='0.75'>Soporte</text></svg>",
  soporteAuri: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E3D3BC'/><path d='M 280 480 Q 280 280 450 280 Q 620 280 620 480' stroke='%235C3A1E' stroke-width='30' fill='none' opacity='0.85'/> <ellipse cx='290' cy='520' rx='50' ry='65' fill='%235C3A1E' opacity='0.85'/> <ellipse cx='610' cy='520' rx='50' ry='65' fill='%235C3A1E' opacity='0.85'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%235C3A1E' text-anchor='middle' opacity='0.75'>Auriculares</text></svg>",
  organizadorCables: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F0E4D3'/><g fill='%23C17B3D' opacity='0.85'> <rect x='250' y='340' width='110' height='100' rx='16'/><rect x='390' y='340' width='110' height='100' rx='16'/><rect x='530' y='340' width='110' height='100' rx='16'/><rect x='250' y='480' width='110' height='100' rx='16'/><rect x='390' y='480' width='110' height='100' rx='16'/><rect x='530' y='480' width='110' height='100' rx='16'/> </g><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23C17B3D' text-anchor='middle' opacity='0.75'>Cables</text></svg>",
  portalapices: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E8D5C0'/><g fill='%238B5A2B' opacity='0.85'> <rect x='260' y='280' width='380' height='340' rx='12'/> <rect x='290' y='310' width='100' height='120' rx='6' fill='%238B5A2B' opacity='0.5'/> <rect x='400' y='310' width='100' height='120' rx='6' fill='%238B5A2B' opacity='0.6'/> <rect x='510' y='310' width='100' height='120' rx='6' fill='%238B5A2B' opacity='0.5'/> <rect x='290' y='440' width='320' height='150' rx='6' fill='%238B5A2B' opacity='0.6'/> </g><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%238B5A2B' text-anchor='middle' opacity='0.75'>Lápices</text></svg>",
  fidget: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F5E8D4'/><circle cx='450' cy='450' r='180' fill='%23B8691F' opacity='0.85'/> <circle cx='450' cy='450' r='120' fill='%23B8691F' opacity='0.4'/> <circle cx='450' cy='450' r='60' fill='%23B8691F' opacity='0.85'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23B8691F' text-anchor='middle' opacity='0.75'>Fidget</text></svg>",
  dados: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E3D3BC'/><g fill='%235C3A1E' opacity='0.85'> <polygon points='350,300 500,360 500,540 350,480'/> <polygon points='500,360 650,300 650,480 500,540'/> <polygon points='350,300 500,240 650,300 500,360' opacity='0.65'/> </g><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%235C3A1E' text-anchor='middle' opacity='0.75'>Dados</text></svg>",
  lampMesa: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F0E4D3'/><path d='M 320 300 L 580 300 L 560 480 L 340 480 Z' fill='%23C17B3D' opacity='0.85'/> <rect x='430' y='480' width='40' height='120' fill='%23C17B3D' opacity='0.75'/> <ellipse cx='450' cy='620' rx='120' ry='18' fill='%23C17B3D' opacity='0.75'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23C17B3D' text-anchor='middle' opacity='0.75'>Lámpara</text></svg>",
  lampColgante: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E8D5C0'/><line x1='450' y1='180' x2='450' y2='360' stroke='%238B5A2B' stroke-width='6' opacity='0.75'/> <path d='M 300 360 Q 300 560 450 600 Q 600 560 600 360 Z' fill='%238B5A2B' opacity='0.85'/> <path d='M 340 400 Q 340 540 450 570 Q 560 540 560 400' stroke='%238B5A2B' stroke-width='4' fill='none' opacity='0.4'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%238B5A2B' text-anchor='middle' opacity='0.75'>Colgante</text></svg>",
  lampLuna: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23F5E8D4'/><circle cx='450' cy='450' r='200' fill='%23B8691F' opacity='0.85'/> <circle cx='420' cy='420' r='24' fill='%23B8691F' opacity='0.55'/> <circle cx='510' cy='480' r='16' fill='%23B8691F' opacity='0.55'/> <circle cx='460' cy='520' r='20' fill='%23B8691F' opacity='0.55'/> <circle cx='400' cy='500' r='12' fill='%23B8691F' opacity='0.55'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%23B8691F' text-anchor='middle' opacity='0.75'>Luna</text></svg>",
  lampAplique: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 900'><rect width='900' height='900' fill='%23E3D3BC'/><rect x='280' y='280' width='340' height='340' rx='14' fill='%235C3A1E' opacity='0.85'/> <circle cx='450' cy='450' r='100' fill='%235C3A1E' opacity='0.4'/> <circle cx='450' cy='450' r='50' fill='%235C3A1E' opacity='0.85'/><text x='450' y='820' font-family='system-ui, sans-serif' font-size='28' font-weight='600' fill='%235C3A1E' text-anchor='middle' opacity='0.75'>Aplique</text></svg>",
};

export const PRODUCTS = [
  // Para la Casa
  { id: "p01", cat: "casa", sub: "Organizadores", name: "Organizador Modular", price: 8900, img: IMG.organizador, tag: "Best seller", desc: "Sistema modular para escritorio o cajón. Apilable y reconfigurable.", specs: { material: "PLA", tiempo: "8h", peso: "180g" } },
  { id: "p02", cat: "casa", sub: "Decoración", name: "Maceta Geométrica", price: 6500, img: IMG.maceta, tag: null, desc: "Maceta hexagonal con platito integrado. Ideal para suculentas.", specs: { material: "PLA+", tiempo: "6h", peso: "140g" } },
  { id: "p03", cat: "casa", sub: "Organizadores", name: "Portallaves Pared", price: 4200, img: IMG.portallaves, tag: "Nuevo", desc: "Organizador de llaves con 4 ganchos y soporte autoadhesivo.", specs: { material: "PETG", tiempo: "3h", peso: "60g" } },
  { id: "p04", cat: "casa", sub: "Baño", name: "Jabonera Drenante", price: 3800, img: IMG.jabonera, tag: null, desc: "Diseño con canales de drenaje. Secado rápido del jabón.", specs: { material: "PETG", tiempo: "4h", peso: "80g" } },
  { id: "p05", cat: "casa", sub: "Baño", name: "Portarrollo Papel", price: 5400, img: IMG.portarollo, tag: null, desc: "Soporte de pared con terminación mate.", specs: { material: "PLA+", tiempo: "5h", peso: "110g" } },
  { id: "p06", cat: "casa", sub: "Cocina", name: "Portacubiertos", price: 7200, img: IMG.portacubiertos, tag: null, desc: "Divisor para cajón con 4 compartimentos.", specs: { material: "PLA", tiempo: "7h", peso: "160g" } },

  // Gadgets
  { id: "p07", cat: "gadgets", sub: "Soportes", name: "Soporte Celular", price: 3900, img: IMG.soporteCel, tag: "Best seller", desc: "Soporte plegable compatible con celulares y tablets chicas.", specs: { material: "PLA+", tiempo: "3h", peso: "55g" } },
  { id: "p08", cat: "gadgets", sub: "Soportes", name: "Soporte Auriculares", price: 5900, img: IMG.soporteAuri, tag: null, desc: "Base de escritorio para auriculares over-ear.", specs: { material: "PLA", tiempo: "5h", peso: "120g" } },
  { id: "p09", cat: "gadgets", sub: "Accesorios tech", name: "Organizador Cables", price: 2800, img: IMG.organizadorCables, tag: null, desc: "Clips con autoadhesivo. Pack x6 unidades.", specs: { material: "TPU", tiempo: "2h", peso: "30g" } },
  { id: "p10", cat: "gadgets", sub: "Oficina", name: "Portalápices Grid", price: 4500, img: IMG.portalapices, tag: "Nuevo", desc: "Portalápices tipo grid minimalista para escritorio.", specs: { material: "PLA", tiempo: "4h", peso: "90g" } },
  { id: "p11", cat: "gadgets", sub: "Juegos", name: "Fidget Infinito", price: 3200, img: IMG.fidget, tag: null, desc: "Impreso en una sola pieza, sin ensamble.", specs: { material: "PLA", tiempo: "3h", peso: "40g" } },
  { id: "p12", cat: "gadgets", sub: "Juegos", name: "Set Dados Poliédrico", price: 4900, img: IMG.dados, tag: null, desc: "Set de 7 dados para juegos de rol. Números grabados.", specs: { material: "Resina", tiempo: "2h", peso: "35g" } },

  // Lámparas
  { id: "p13", cat: "lamparas", sub: "De mesa", name: "Lámpara Origami", price: 12900, img: IMG.lampMesa, tag: "Premium", desc: "Pantalla facetada estilo origami. Base de madera. Foco LED E27 no incluido.", specs: { material: "PLA translúcido", tiempo: "14h", peso: "320g" } },
  { id: "p14", cat: "lamparas", sub: "Colgantes", name: "Colgante Espiral", price: 15900, img: IMG.lampColgante, tag: "Premium", desc: "Lámpara colgante con patrón en espiral. Cable textil 1.5m.", specs: { material: "PLA translúcido", tiempo: "18h", peso: "410g" } },
  { id: "p15", cat: "lamparas", sub: "Infantiles", name: "Luz Luna Kids", price: 9800, img: IMG.lampLuna, tag: "Best seller", desc: "Luz LED con textura lunar. USB recargable, tacto táctil.", specs: { material: "PLA+", tiempo: "10h", peso: "240g" } },
  { id: "p16", cat: "lamparas", sub: "Apliques", name: "Aplique de Pared", price: 8400, img: IMG.lampAplique, tag: null, desc: "Aplique con patrón geométrico. Proyección de luz indirecta.", specs: { material: "PLA", tiempo: "9h", peso: "200g" } },
];

export const COLORS_FILAMENT = [
  { id: "blanco", name: "Blanco", hex: "#F5F5F2" },
  { id: "negro", name: "Negro", hex: "#1a1a1a" },
  { id: "azul", name: "Azul Pizarra", hex: "#345C83" },
  { id: "beige", name: "Beige", hex: "#D9CBB8" },
  { id: "rojo", name: "Rojo", hex: "#c64138" },
  { id: "verde", name: "Verde", hex: "#4a7a52" },
  { id: "amarillo", name: "Amarillo", hex: "#e8c547" },
];

// Datos de contacto — TKPrints atiende consultas y pedidos por Instagram
export const CONTACT = {
  instagramHandle: "tk.prints.3d",
  instagramUrl: "https://www.instagram.com/tk.prints.3d/",
  // Deep link oficial de Instagram para abrir un mensaje directo (equivalente a wa.me pero para IG)
  instagramDmUrl: "https://ig.me/m/tk.prints.3d",
};
