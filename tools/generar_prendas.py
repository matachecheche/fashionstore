#!/usr/bin/env python3
"""
Genera las ilustraciones de prendas que usa el sistema (sin depender de internet):

  backend-nest/public/assets/prendas/<tipo>-<color>-ar.png    PNG con fondo transparente (overlay del vestidor AR)
  backend-nest/public/assets/prendas/<tipo>-<color>-foto.jpg  foto de catalogo (prenda sobre fondo suave)

Se ejecuta una sola vez (los archivos ya vienen incluidos en el proyecto):
    python tools/generar_prendas.py
Requiere Pillow y numpy.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 2                      # supersampling
BW, BH = 400, 560          # tamano final
W, H = BW * S, BH * S

PALETA = {
    "negro": "#1c1c1f", "blanco": "#f1efea", "rojo": "#b3202f", "azul": "#22468a",
    "rosado": "#e6a1bd", "beige": "#d8c3a5", "verde": "#2f6b4f", "camel": "#b98552",
    "gris": "#8a8d93", "celeste": "#8fc1e3", "mostaza": "#d9a12c", "vino": "#6d1f3a",
}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def catmull(points, n=14):
    """Spline Catmull-Rom abierta que pasa por todos los puntos."""
    if len(points) < 3:
        return list(points)
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    out.append(points[-1])
    return out


def contorno(segmentos):
    """Une segmentos suavizados; los extremos de cada segmento son esquinas."""
    pts = []
    for seg in segmentos:
        pts.extend(catmull(seg))
    return pts


def espejo(pts):
    return [(BW - x, y) for x, y in pts]


# ---------------------------------------------------------------- prendas
# Cada funcion devuelve (siluetas, pliegues, detalles)
#   siluetas: lista de poligonos (puntos en coordenadas 400x560)
#   pliegues: lista de polilineas (lineas de costura / pliegue)
#   detalles: lista de (poligono, "oscuro"/"claro") pintados sobre la prenda

def g_vestido():
    izq = [
        [(150, 26), (158, 26)],
        [(158, 26), (166, 78), (192, 100)],
    ]
    cuerpo_izq = contorno([
        [(146, 26), (140, 100), (150, 190), (128, 330), (86, 500)],
    ])
    dobladillo = catmull([(86, 500), (130, 512), (170, 504), (210, 514), (260, 504), (300, 512), (314, 500)])
    cuerpo_der = contorno([[(314, 500), (272, 330), (250, 190), (260, 100), (254, 26)]])
    tirante_der = [(254, 26), (242, 26)]
    esc = catmull([(242, 26), (234, 78), (200, 104), (166, 78), (158, 26)])
    sil = cuerpo_izq + dobladillo + cuerpo_der + tirante_der + esc
    pliegues = [
        [(200, 200), (196, 300), (170, 420), (150, 505)],
        [(200, 200), (204, 300), (230, 420), (250, 505)],
        [(200, 200), (200, 330), (200, 508)],
        [(150, 190), (200, 204), (250, 190)],
    ]
    return [sil], pliegues, []


def g_blusa():
    izq = contorno([
        [(150, 40), (96, 70), (40, 170), (70, 200)],
        [(70, 200), (118, 170), (132, 200)],
        [(132, 200), (128, 300), (122, 420)],
    ])
    dob = catmull([(122, 420), (160, 432), (200, 424), (240, 432), (278, 420)])
    der = contorno([
        [(278, 420), (272, 300), (268, 200)],
        [(268, 200), (282, 170), (330, 200)],
        [(330, 200), (360, 170), (304, 70), (250, 40)],
    ])
    cuello = catmull([(250, 40), (232, 70), (200, 122), (168, 70), (150, 40)])
    sil = izq + dob + der + cuello
    pliegues = [[(200, 122), (200, 420)], [(132, 200), (170, 240), (200, 250)], [(268, 200), (230, 240), (200, 250)]]
    return [sil], pliegues, []


def g_camiseta():
    izq = contorno([
        [(150, 44), (100, 64), (44, 130), (84, 178)],
        [(84, 178), (128, 150), (132, 190)],
        [(132, 190), (128, 300), (126, 440)],
    ])
    dob = catmull([(126, 440), (200, 450), (274, 440)])
    der = contorno([
        [(274, 440), (272, 300), (268, 190)],
        [(268, 190), (272, 150), (316, 178)],
        [(316, 178), (356, 130), (300, 64), (250, 44)],
    ])
    cuello = catmull([(250, 44), (236, 84), (200, 98), (164, 84), (150, 44)])
    sil = izq + dob + der + cuello
    pliegues = [[(132, 190), (170, 226)], [(268, 190), (230, 226)], [(150, 440), (152, 300)]]
    return [sil], pliegues, [([(150, 44), (164, 84), (200, 98), (236, 84), (250, 44), (236, 60), (200, 76), (164, 60)], "oscuro")]


def g_pantalon():
    izq = contorno([
        [(112, 30), (118, 200), (112, 340), (104, 530)],
    ])
    pie_izq = [(104, 530), (188, 530)]
    entre = contorno([[(188, 530), (196, 330), (200, 230)]])
    entre2 = contorno([[(200, 230), (204, 330), (212, 530)]])
    pie_der = [(212, 530), (296, 530)]
    der = contorno([[(296, 530), (288, 340), (282, 200), (288, 30)]])
    cintura = [(288, 30), (112, 30)]
    sil = izq + pie_izq + entre + entre2 + pie_der + der + cintura
    pliegues = [[(112, 62), (288, 62)], [(200, 62), (200, 230)], [(152, 120), (146, 300)], [(248, 120), (254, 300)], [(150, 200), (176, 208)], [(250, 200), (224, 208)]]
    return [sil], pliegues, [([(112, 30), (288, 30), (288, 62), (112, 62)], "oscuro")]


def g_falda():
    izq = contorno([[(122, 36), (116, 110), (84, 300), (62, 470)]])
    dob = catmull([(62, 470), (120, 486), (170, 476), (220, 488), (280, 476), (338, 470)])
    der = contorno([[(338, 470), (316, 300), (284, 110), (278, 36)]])
    sil = izq + dob + der + [(278, 36), (122, 36)]
    pliegues = [[(160, 66), (128, 300), (108, 480)], [(200, 66), (196, 300), (196, 484)], [(240, 66), (272, 300), (296, 480)]]
    return [sil], pliegues, [([(122, 36), (278, 36), (280, 66), (120, 66)], "oscuro")]


def g_chaqueta():
    izq = contorno([
        [(146, 40), (86, 70), (46, 300), (58, 470)],
        [(58, 470), (92, 476), (110, 470)],
        [(110, 470), (116, 260), (128, 190)],
        [(128, 190), (124, 380), (130, 500)],
    ])
    dob_i = catmull([(130, 500), (170, 512), (196, 506)])
    dob_d = catmull([(204, 506), (230, 512), (270, 500)])
    der = contorno([
        [(270, 500), (276, 380), (272, 190)],
        [(272, 190), (284, 260), (290, 470)],
        [(290, 470), (308, 476), (342, 470)],
        [(342, 470), (354, 300), (314, 70), (254, 40)],
    ])
    cuello = catmull([(254, 40), (236, 76), (204, 96)]) + catmull([(196, 96), (164, 76), (146, 40)])
    sil = izq + dob_i + [(196, 506), (204, 506)] + dob_d + der + cuello + [(204, 96), (196, 96)]
    pliegues = [[(200, 100), (200, 506)], [(128, 190), (168, 214)], [(272, 190), (232, 214)], [(58, 470), (110, 470)], [(290, 470), (342, 470)]]
    solapa_i = [(146, 40), (164, 76), (196, 96), (198, 190), (170, 170), (150, 110)]
    solapa_d = [(254, 40), (236, 76), (204, 96), (202, 190), (230, 170), (250, 110)]
    return [sil], pliegues, [(solapa_i, "oscuro"), (solapa_d, "oscuro")] + [([(194, y), (206, y), (206, y + 8), (194, y + 8)], "claro") for y in (250, 320, 390)]


def _tacon(dx, flip=False):
    base = contorno([
        [(60, 350), (86, 250), (128, 214), (156, 260)],
        [(156, 260), (196, 330), (250, 360), (300, 372)],
        [(300, 372), (322, 380), (324, 396), (300, 402)],
        [(300, 402), (200, 408), (150, 398), (128, 388)],
        [(128, 388), (118, 470), (114, 520), (98, 520)],
        [(98, 520), (92, 440), (88, 410), (66, 396)],
        [(66, 396), (54, 380), (60, 350)],
    ])
    pts = [(x + dx, y - 40) for x, y in base]
    return espejo(pts) if flip else pts


def g_zapato():
    a = _tacon(0)
    b = [(x + 0, y + 0) for x, y in _tacon(0)]
    a = [(x * 0.62 + 16, y * 0.62 + 90) for x, y in a]
    b = [(x * 0.62 + 172, y * 0.62 + 210) for x, y in b]
    pl = [[(80, 200), (110, 230), (150, 250)], [(236, 320), (266, 350), (306, 370)]]
    return [a, b], pl, []


def g_cartera():
    asa = catmull([(112, 190), (118, 100), (200, 52), (282, 100), (288, 190)])
    asa_int = catmull([(288, 190), (282, 116), (200, 78), (118, 116), (112, 190)])
    cuerpo = contorno([[(58, 190), (44, 420), (60, 500)], [(60, 500), (200, 516), (340, 500)], [(340, 500), (356, 420), (342, 190)], [(342, 190), (200, 178), (58, 190)]])
    solapa = catmull([(58, 190), (76, 290), (200, 340), (324, 290), (342, 190)])
    return [asa + asa_int, cuerpo], [solapa, [(58, 190), (200, 178), (342, 190)]], [([(184, 316), (216, 316), (216, 344), (184, 344)], "claro")]


GARMENTS = {
    "vestido": g_vestido, "blusa": g_blusa, "camiseta": g_camiseta, "pantalon": g_pantalon,
    "falda": g_falda, "chaqueta": g_chaqueta, "zapato": g_zapato, "cartera": g_cartera,
}


def escalar(pts):
    return [(x * S, y * S) for x, y in pts]


def render(tipo, color_hex):
    siluetas, pliegues, detalles = GARMENTS[tipo]()
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    for poly in siluetas:
        d.polygon(escalar(poly), fill=255)
    m = np.asarray(mask, dtype=np.float32) / 255.0
    ys, xs = np.where(m > 0.5)
    if len(xs) == 0:
        raise RuntimeError(tipo)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    cx, ww, hh = (x0 + x1) / 2, max(1, x1 - x0), max(1, y1 - y0)

    base = np.array(hex_rgb(color_hex), dtype=np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = np.clip((xx - cx) / (ww / 2), -1, 1)
    ny = np.clip((yy - y0) / hh, 0, 1)
    sombra = 1.0 - 0.20 * nx ** 2 - 0.10 * (nx > 0) * nx + 0.06 * (0.5 - ny)      # luz desde la izquierda
    img = np.clip(base[None, None, :] * sombra[:, :, None], 0, 255)

    # borde interior mas oscuro
    mk = Image.fromarray((m * 255).astype(np.uint8))
    er = mk.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(4 * S))
    borde = m - np.asarray(er, dtype=np.float32) / 255.0
    img *= (1.0 - 0.32 * np.clip(borde, 0, 1))[:, :, None]

    capa = Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")
    detalle = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(detalle)
    lum = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]
    claro_fondo = lum > 90
    linea = (0, 0, 0, 58) if claro_fondo else (255, 255, 255, 46)
    for poly, tono in detalles:
        if tono == "oscuro":
            fill = (0, 0, 0, 44) if claro_fondo else (255, 255, 255, 26)
        else:
            fill = (255, 255, 255, 150) if not claro_fondo else (60, 40, 30, 150)
        dd.polygon(escalar(poly), fill=fill)
    for pl in pliegues:
        pts = catmull(pl, 8) if len(pl) > 2 else pl
        dd.line(escalar(pts), fill=linea, width=3 * S, joint="curve")
    detalle = detalle.filter(ImageFilter.GaussianBlur(0.8))
    capa.alpha_composite(detalle)
    capa.putalpha(mk.filter(ImageFilter.GaussianBlur(0.6)))
    return capa.resize((BW, BH), Image.LANCZOS)


def foto(prenda_rgba, indice):
    fondos = [((246, 240, 236), (226, 216, 210)), ((238, 241, 246), (214, 220, 232)), ((243, 240, 231), (221, 214, 197)), ((240, 236, 241), (218, 208, 222))]
    c1, c2 = fondos[indice % len(fondos)]
    yy = np.linspace(0, 1, BH, dtype=np.float32)[:, None, None]
    fondo = (np.array(c1, dtype=np.float32) * (1 - yy) + np.array(c2, dtype=np.float32) * yy) * np.ones((1, BW, 1), dtype=np.float32)
    bg = Image.fromarray(fondo.astype(np.uint8), "RGB").convert("RGBA")
    alfa = prenda_rgba.split()[3]
    sombra = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    sombra.putalpha(alfa.point(lambda v: int(v * 0.28)))
    sombra = sombra.filter(ImageFilter.GaussianBlur(14))
    bg.alpha_composite(sombra, (8, 14))
    bg.alpha_composite(prenda_rgba)
    return bg.convert("RGB")


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    salida = os.path.join(raiz, "backend-nest", "public", "assets", "prendas")
    os.makedirs(salida, exist_ok=True)
    tipos = sys.argv[1:] or list(GARMENTS)
    n = 0
    for i, tipo in enumerate(tipos):
        for j, (nombre, hx) in enumerate(PALETA.items()):
            im = render(tipo, hx)
            im.save(os.path.join(salida, f"{tipo}-{nombre}-ar.png"), optimize=True)
            foto(im, i + j).save(os.path.join(salida, f"{tipo}-{nombre}-foto.jpg"), quality=82, optimize=True)
            n += 2
    print(f"{n} imagenes generadas en {salida}")


if __name__ == "__main__":
    main()
