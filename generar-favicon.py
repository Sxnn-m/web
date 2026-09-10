#!/usr/bin/env python3
"""Genera los archivos de favicon de TKPrints a partir de logo-icono.jpg.

Se corre a mano cuando cambia el logo, no en el build:

    pip install Pillow numpy potracer
    python3 generar-favicon.py

Escribe en public/, que Vite copia tal cual a la raíz del sitio.
"""
import os
import numpy as np
import potrace
from PIL import Image

# El logo cuadrado del que salen todos los tamaños, versionado al lado.
RAIZ = os.path.dirname(os.path.abspath(__file__))
ORIGEN = os.path.join(RAIZ, "logo-icono.jpg")
SALIDA = os.path.join(RAIZ, "public")
os.makedirs(SALIDA, exist_ok=True)

im = Image.open(ORIGEN).convert("RGB")
w, h = im.size
a = np.asarray(im).astype(int)
claro = a.sum(axis=2) > 330          # el glifo, claro sobre fondo oscuro

ys, xs = np.nonzero(claro)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()

# Colores exactos del original: el fondo de una esquina, el glifo del promedio
# de los píxeles claros del centro (evita el borde antialiaseado del JPEG).
FONDO = tuple(a[5, 5])
# La MEDIANA y no el promedio: el borde antialiaseado del JPEG son píxeles a
# medio camino del fondo y arrastrarían el tono hacia el oscuro.
GLIFO = tuple(np.round(np.median(a[claro], axis=0)).astype(int))
print(f"origen {w}x{h}  fondo #{'%02X%02X%02X' % FONDO}  glifo #{'%02X%02X%02X' % GLIFO}")
print(f"glifo {x1-x0+1}x{y1-y0+1} px, o sea el {100*(x1-x0+1)/w:.0f}% del ancho")

# Se recorta un cuadrado centrado en el glifo para que ocupe ~78% del ícono.
# Con el margen original el dibujo queda en 7 px a 16×16 y no se lee.
OCUPACION = 0.78
lado = int(round(max(x1 - x0 + 1, y1 - y0 + 1) / OCUPACION))
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
izq, arr = int(round(cx - lado / 2)), int(round(cy - lado / 2))
caja = (izq, arr, izq + lado, arr + lado)
print(f"recorte {caja}  lado {lado}  → el glifo pasa a ocupar el {100*(x1-x0+1)/lado:.0f}%")
assert izq >= 0 and arr >= 0 and izq + lado <= w and arr + lado <= h, "el recorte se sale"

cuadrado = im.crop(caja)

# ── favicon.svg: se vectoriza el glifo, así queda nítido a cualquier zoom ──
mascara = np.asarray(cuadrado).astype(int).sum(axis=2) > 330
# potracer traza lo OSCURO (como el potrace clásico sobre un bitmap): se le
# pasa la máscara invertida para que la figura sea el glifo y no el fondo.
trazado = potrace.Bitmap(~mascara).trace(turdsize=4, alphamax=1.0)
curvas = list(trazado)

partes = []
for curva in curvas:
    xy = lambda p: (p.x, p.y)      # potracer devuelve puntos con .x/.y
    d = "M%.2f %.2f" % xy(curva.start_point)
    for seg in curva:
        if seg.is_corner:
            d += " L%.2f %.2f L%.2f %.2f" % (*xy(seg.c), *xy(seg.end_point))
        else:
            d += " C%.2f %.2f %.2f %.2f %.2f %.2f" % (
                *xy(seg.c1), *xy(seg.c2), *xy(seg.end_point))
    partes.append(d + " Z")

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{lado}" height="{lado}" viewBox="0 0 {lado} {lado}">
  <rect width="{lado}" height="{lado}" fill="#{'%02X%02X%02X' % FONDO}"/>
  <path fill="#{'%02X%02X%02X' % GLIFO}" fill-rule="evenodd" d="{' '.join(partes)}"/>
</svg>
'''
open(f"{SALIDA}/favicon.svg", "w").write(svg)
print(f"favicon.svg      {len(curvas)} curva(s), {len(svg)} bytes")

# ── Rasters ──
def png(nombre, tamano):
    cuadrado.resize((tamano, tamano), Image.LANCZOS).save(f"{SALIDA}/{nombre}", optimize=True)
    print(f"{nombre:17s} {tamano}x{tamano}")

png("favicon-32x32.png", 32)
png("favicon-192x192.png", 192)   # Android / Chrome
png("apple-touch-icon.png", 180)  # iOS (sin transparencia, iOS le redondea las puntas)

# El .ico lleva los tres tamaños que pide el escritorio dentro del mismo archivo.
cuadrado.resize((256, 256), Image.LANCZOS).save(
    f"{SALIDA}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("favicon.ico       16 + 32 + 48")
