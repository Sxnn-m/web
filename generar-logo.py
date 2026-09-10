#!/usr/bin/env python3
"""Saca el fondo blanco del logo horizontal y deja un PNG transparente.

El JPEG original venía con fondo blanco, que sobre el chalk de la página
(#F8F7F4) se notaba como un recuadro más claro detrás del logo. Pintarlo del
color de la página taparía el recuadro hoy, pero volvería a aparecer si se
activa el tema oscuro (index.css ya define [data-theme="dark"]), así que se
saca el fondo y listo.

    pip install Pillow numpy
    python3 generar-logo.py

Escribe src/assets/logo-full.png a partir de logo-full.jpg de la raíz.
"""
import os
import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.abspath(__file__))
ORIGEN = os.path.join(RAIZ, "logo-full.jpg")
DESTINO = os.path.join(RAIZ, "src", "assets", "logo-full.png")

im = Image.open(ORIGEN).convert("RGB")
a = np.asarray(im).astype(float)
h, w, _ = a.shape

# El fondo, leído de las cuatro esquinas.
FONDO = np.array([a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]).mean(axis=0)

# Los dos colores de tinta del logo, separados por TEMPERATURA y no por
# brillo: el beige del ícono está a 123 de distancia del blanco y el azul del
# texto a 396, así que cualquier corte por brillo o por distancia mete el
# antialias del azul en el grupo del beige y lo ensucia. Cálido vs. frío los
# separa limpio.
lejos = np.linalg.norm(a - FONDO, axis=2) > 60
tinta = a[lejos]
grupos = [tinta[tinta[:, 2] - tinta[:, 0] > 15],    # frío: el azul del texto
          tinta[tinta[:, 0] - tinta[:, 2] > 15]]    # cálido: el beige del ícono

# De cada grupo, el color PLENO del interior del trazo: la mediana de los
# píxeles que están al menos al 60% de la distancia máxima al fondo.
#
# Ni la mediana de todo el grupo (la lavan los bordes suaves) ni el extremo:
# el píxel más alejado es el overshoot del JPEG en el filo, y tomarlo como
# tinta deja el interior del trazo en alfa 0.95 en vez de 1, o sea que sobre
# un fondo oscuro se colaría un 5% del fondo y el logo se vería apagado.
TINTAS = []
for g in grupos:
    d = np.linalg.norm(g - FONDO, axis=1)
    TINTAS.append(np.median(g[d >= 0.60 * d.max()], axis=0))

fmt = lambda c: "#%02X%02X%02X" % tuple(int(round(v)) for v in c)
print(f"{im.width}x{im.height}  fondo {fmt(FONDO)}  tintas {fmt(TINTAS[0])} y {fmt(TINTAS[1])}")

# Para cada píxel: se lo explica como una mezcla entre el fondo y UNA de las
# tintas, P = FONDO + alfa·(TINTA − FONDO). De las dos tintas se queda con la
# que deja menos residuo, y ese alfa es la opacidad.
#
# No alcanza con "cuánto se aleja del blanco": el beige es un color claro, y
# medido así quedaría medio transparente. Hay que resolverlo contra su propia
# tinta.
plano = a.reshape(-1, 3)
mejor_alfa = np.zeros(len(plano))
mejor_resto = np.full(len(plano), np.inf)
mejor_color = np.zeros((len(plano), 3))

for tinta_ in TINTAS:
    eje = tinta_ - FONDO
    alfa = np.clip((plano - FONDO) @ eje / (eje @ eje), 0, 1)
    resto = np.linalg.norm(plano - (FONDO + alfa[:, None] * eje), axis=1)
    gana = resto < mejor_resto
    mejor_resto[gana] = resto[gana]
    mejor_alfa[gana] = alfa[gana]
    mejor_color[gana] = tinta_

# Ajuste de niveles sobre el alfa, que es el "umbral de tolerancia" del
# recorte. El JPEG deja ruido en el margen —píxeles casi blancos que no son
# exactamente el fondo— y salen con un alfa de hasta 11/255: invisible sobre
# el chalk, pero sobre un fondo oscuro es un polvillo claro alrededor del
# logo. El piso lo borra y el techo deja el interior del trazo bien opaco;
# entre medio la rampa sigue siendo suave, así que el borde no se endurece.
PISO, TECHO = 12 / 255, 245 / 255
mejor_alfa = np.clip((mejor_alfa - PISO) / (TECHO - PISO), 0, 1)

rgba = np.dstack([
    mejor_color.reshape(h, w, 3),
    (mejor_alfa.reshape(h, w) * 255),
]).astype(np.uint8)

os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
Image.fromarray(rgba, "RGBA").save(DESTINO, optimize=True)

opacos = (mejor_alfa > 0.99).mean() * 100
vacios = (mejor_alfa < 0.01).mean() * 100
print(f"→ {os.path.relpath(DESTINO, RAIZ)}   {vacios:.0f}% transparente, "
      f"{opacos:.0f}% opaco, {100-opacos-vacios:.0f}% de borde suave")
