#!/usr/bin/env python3
"""Genera los archivos de favicon de TKPrints a partir de logo-icono.jpg.

El ícono es un CÍRCULO azul con el logo centrado y aire alrededor, y todo lo
que queda fuera del círculo es transparente, para que se vea bien sobre
cualquier fondo de pestaña (claro u oscuro).

Se corre a mano cuando cambia el logo, no en el build:

    pip install Pillow numpy potracer
    python3 generar-favicon.py            # escribe public/
    python3 generar-favicon.py --preview  # solo la muestra comparativa

Escribe en public/, que Vite copia tal cual a la raíz del sitio.
"""
import os
import sys
import numpy as np
import potrace
from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.abspath(__file__))
ORIGEN = os.path.join(RAIZ, "logo-icono.jpg")
SALIDA = os.path.join(RAIZ, "public")

# Cuánto del DIÁMETRO del ícono ocupa el círculo envolvente del logo.
#
# Se mide contra el círculo envolvente y no contra el ancho del logo: las
# puntas de la barra de arriba y de la base son las esquinas de su caja, así
# que son ellas las que se acercan al borde. Con el ancho al 72% esas puntas
# quedarían a 3 px del filo y el ícono se vería desbordado. Al 74% del
# envolvente el aire queda parejo en toda la vuelta.
OCUPACION = 0.74

# Se dibuja todo a 8× y se baja con LANCZOS: el borde del círculo y el del
# glifo quedan suaves, que a 16 px es lo que decide si se ve prolijo.
SUPER = 8

# ─── El logo: máscara con antialias y colores del propio archivo ──────
_im = Image.open(ORIGEN).convert("RGB")
_a = np.asarray(_im).astype(float)
_lum = _a.sum(axis=2)

FONDO = tuple(int(v) for v in _a[5, 5])
GLIFO = tuple(int(v) for v in np.median(_a[_lum > 330], axis=0))
_lum_fondo, _lum_glifo = sum(FONDO), sum(GLIFO)

# Alfa por píxel: 0 donde está el azul de fondo, 1 en el trazo pleno, y el
# valor intermedio en el borde. Así el JPEG no aporta ningún halo azul.
_alfa = np.clip((_lum - _lum_fondo) / (_lum_glifo - _lum_fondo), 0, 1)

_ys, _xs = np.nonzero(_alfa > 0.5)
_x0, _x1, _y0, _y1 = _xs.min(), _xs.max(), _ys.min(), _ys.max()
CENTRO = ((_x0 + _x1) / 2, (_y0 + _y1) / 2)
# El punto del glifo más lejano de su centro: es el que define cuánto puede
# crecer sin salirse del círculo.
RADIO = float(np.hypot(_xs - CENTRO[0], _ys - CENTRO[1]).max())

# Recorte cuadrado centrado en el glifo, justo del tamaño de su envolvente.
_lado = int(round(2 * RADIO))
_caja = (int(round(CENTRO[0] - RADIO)), int(round(CENTRO[1] - RADIO)))
LOGO = Image.fromarray((_alfa * 255).astype(np.uint8), "L").crop(
    (_caja[0], _caja[1], _caja[0] + _lado, _caja[1] + _lado))


def icono(lado, ocupacion=OCUPACION, redondo=True):
    """Un ícono cuadrado de `lado` px: disco azul, logo centrado, resto
    transparente. Con redondo=False el azul llena todo el cuadro (iOS)."""
    grande = lado * SUPER
    lienzo = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))

    disco = Image.new("L", (grande, grande), 0)
    if redondo:
        ImageDraw.Draw(disco).ellipse((0, 0, grande - 1, grande - 1), fill=255)
    else:
        disco.paste(255, (0, 0, grande, grande))
    lienzo.paste(Image.new("RGBA", (grande, grande), (*FONDO, 255)), (0, 0), disco)

    # El logo entra escalado a su ocupación y centrado en el disco.
    medida = max(1, int(round(grande * ocupacion)))
    mascara = LOGO.resize((medida, medida), Image.LANCZOS)
    esquina = (grande - medida) // 2
    lienzo.paste(Image.new("RGBA", (medida, medida), (*GLIFO, 255)), (esquina, esquina), mascara)

    return lienzo.resize((lado, lado), Image.LANCZOS)


def muestra(destino):
    """Hoja comparativa: tres márgenes, cada uno a los tamaños que importan."""
    opciones = [0.70, 0.74, 0.78]
    tamanos = [16, 32, 48, 128]
    pad, sep = 20, 34
    ancho = pad * 2 + sum(tamanos) + sep * (len(tamanos) - 1)
    alto = pad * 2 + len(opciones) * (max(tamanos) + sep)
    # Mitad clara y mitad oscura: la transparencia tiene que funcionar en las dos.
    hoja = Image.new("RGB", (ancho, alto), (248, 247, 244))
    hoja.paste(Image.new("RGB", (ancho // 2, alto), (32, 33, 36)), (ancho // 2, 0))
    for fila, ocup in enumerate(opciones):
        y = pad + fila * (max(tamanos) + sep)
        x = pad
        for t in tamanos:
            hoja.paste(icono(t, ocup), (x, y + (max(tamanos) - t) // 2), icono(t, ocup))
            x += t + sep
    hoja.save(destino)
    print(f"muestra → {destino}   filas: {opciones}   columnas: {tamanos} px")


def svg(lado):
    """El mismo ícono en vectorial: un círculo y el trazo del logo."""
    # potracer traza lo OSCURO, así que se le pasa la máscara invertida.
    mascara = np.asarray(LOGO) > 127
    curvas = list(potrace.Bitmap(~mascara).trace(turdsize=4, alphamax=1.0))
    xy = lambda p: (p.x, p.y)
    partes = []
    for curva in curvas:
        d = "M%.2f %.2f" % xy(curva.start_point)
        for seg in curva:
            if seg.is_corner:
                d += " L%.2f %.2f L%.2f %.2f" % (*xy(seg.c), *xy(seg.end_point))
            else:
                d += " C%.2f %.2f %.2f %.2f %.2f %.2f" % (
                    *xy(seg.c1), *xy(seg.c2), *xy(seg.end_point))
        partes.append(d + " Z")

    # El trazo viene en coordenadas del recorte; se escala y se centra igual
    # que en los PNG, para que las dos versiones se vean idénticas.
    k = lado * OCUPACION / LOGO.width
    off = (lado - lado * OCUPACION) / 2
    hex_ = lambda c: "#%02X%02X%02X" % c
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{lado}" height="{lado}" '
        f'viewBox="0 0 {lado} {lado}">\n'
        f'  <circle cx="{lado/2:.1f}" cy="{lado/2:.1f}" r="{lado/2:.1f}" fill="{hex_(FONDO)}"/>\n'
        f'  <path fill="{hex_(GLIFO)}" fill-rule="evenodd" '
        f'transform="translate({off:.2f} {off:.2f}) scale({k:.5f})" d="{" ".join(partes)}"/>\n'
        f'</svg>\n')


if __name__ == "__main__":
    hex_ = lambda c: "#%02X%02X%02X" % c
    print(f"origen {_im.width}x{_im.height}  fondo {hex_(FONDO)}  glifo {hex_(GLIFO)}")
    print(f"envolvente del logo {2*RADIO:.0f} px → ocupa el {100*OCUPACION:.0f}% del diámetro, "
          f"con {100*(1-OCUPACION)/2:.0f}% de aire por lado")

    # La hoja comparativa es para mirar y decidir, no un archivo del sitio:
    # se genera solo si la piden, y no se versiona.
    if "--preview" in sys.argv:
        muestra(os.path.join(RAIZ, "favicon-muestra.png"))
        sys.exit(0)

    os.makedirs(SALIDA, exist_ok=True)
    LADO = 512

    open(f"{SALIDA}/favicon.svg", "w").write(svg(LADO))
    print(f"favicon.svg          vectorial, círculo + trazo")

    for nombre, t in [("favicon-32x32.png", 32), ("favicon-192x192.png", 192)]:
        icono(t).save(f"{SALIDA}/{nombre}", optimize=True)
        print(f"{nombre:20s} {t}x{t}  con transparencia")

    # El .ico lleva los tres tamaños del escritorio en el mismo archivo.
    icono(256).save(f"{SALIDA}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"{'favicon.ico':20s} 16 + 32 + 48  con transparencia")

    # iOS NO respeta la transparencia: la rellena de negro y le aplica su
    # propia máscara redondeada. Por eso este va opaco y a sangre — el azul
    # llena el cuadro y el recorte lo hace el sistema.
    icono(180, redondo=False).convert("RGB").save(f"{SALIDA}/apple-touch-icon.png", optimize=True)
    print(f"{'apple-touch-icon.png':20s} 180x180  opaco (iOS lo recorta solo)")
