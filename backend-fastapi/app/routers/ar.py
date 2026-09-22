"""
Soporte para el vestidor virtual de realidad aumentada (CU-06, paso 3):
"la app solicita al microservicio de IA/AR las caracteristicas visuales de la prenda (color, tipo, textura)".

Devuelve, para una prenda y color: la imagen con fondo transparente (overlay), sus caracteristicas visuales y los parametros
de ajuste que usa el motor AR para ubicarla sobre el cuerpo (por landmarks del cuerpo o con posicion inicial manual).
"""
import os
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException

from ..config import ASSETS_DIR
from ..db import filas, pool

router = APIRouter(prefix="/api/ar", tags=["Realidad aumentada"])

# ancla: punto de la IMAGEN (fraccion x,y) que se hace coincidir con el punto del cuerpo;
# refFraccion: que parte del ancho de la imagen equivale a la distancia de referencia del cuerpo (hombros, caderas...).
AJUSTES = {
    "superior": {"referencia": "hombros", "ancla": {"x": 0.5, "y": 0.13}, "refFraccion": 0.52, "inicial": {"cx": 0.5, "cy": 0.36, "ancho": 0.78}},
    "abrigo":   {"referencia": "hombros", "ancla": {"x": 0.5, "y": 0.10}, "refFraccion": 0.50, "inicial": {"cx": 0.5, "cy": 0.42, "ancho": 0.86}},
    "vestido":  {"referencia": "hombros", "ancla": {"x": 0.5, "y": 0.06}, "refFraccion": 0.40, "inicial": {"cx": 0.5, "cy": 0.52, "ancho": 0.72}},
    "inferior": {"referencia": "caderas", "ancla": {"x": 0.5, "y": 0.05}, "refFraccion": 0.46, "inicial": {"cx": 0.5, "cy": 0.66, "ancho": 0.58}},
    "calzado":  {"referencia": "tobillos", "ancla": {"x": 0.5, "y": 0.45}, "refFraccion": 0.65, "inicial": {"cx": 0.5, "cy": 0.86, "ancho": 0.62}},
    "accesorio": {"referencia": "caderas", "ancla": {"x": 0.5, "y": 0.25}, "refFraccion": 0.90, "inicial": {"cx": 0.72, "cy": 0.58, "ancho": 0.36}},
}
GUIAS = {
    "superior": "Colócate de frente, con los hombros visibles dentro del recuadro.",
    "abrigo": "Colócate de frente con los brazos ligeramente separados del cuerpo.",
    "vestido": "Colócate de frente a 1.5–2 metros de la cámara para que se vea todo el torso.",
    "inferior": "Aléjate lo suficiente para que se vean tus caderas y piernas.",
    "calzado": "Apunta la cámara hacia tus pies o aléjate para verte de cuerpo entero.",
    "accesorio": "Sostén la cámara de modo que se vea tu cadera y brazo.",
}


def _proporcion(url: str) -> float:
    """ancho/alto real de la imagen (si se puede leer del disco); por defecto 5:7 como las ilustraciones del sistema."""
    try:
        from PIL import Image
        ruta = os.path.join(ASSETS_DIR, urlparse(url).path.lstrip("/"))
        if os.path.isfile(ruta):
            with Image.open(ruta) as im:
                return round(im.width / im.height, 4)
    except Exception:
        pass
    return round(400 / 560, 4)


@router.get("/prenda/{producto_id}")
async def prenda(producto_id: int, color: str | None = None):
    async with pool().acquire() as con:
        p = await con.fetchrow(
            """SELECT p.id, p.nombre, p.ar_tipo, p.textura, p.material, c.nombre AS categoria FROM productos p
                 LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.id = $1 AND p.activo""", producto_id)
        if not p:
            raise HTTPException(404, "Producto no encontrado")
        colores = filas(await con.fetch(
            """SELECT v.color AS nombre, MAX(v.color_hex) AS hex, array_agg(DISTINCT v.talla ORDER BY v.talla) AS tallas
                 FROM variantes v WHERE v.producto_id = $1 AND v.activo GROUP BY v.color ORDER BY MIN(v.id)""", producto_id))
        imgs = filas(await con.fetch("SELECT url, es_overlay_ar, color, orden FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden, id", producto_id))
    for c in colores:
        c["overlayUrl"] = next((i["url"] for i in imgs if i["es_overlay_ar"] and (i["color"] or "").lower() == c["nombre"].lower()), None)
        c["fotoUrl"] = next((i["url"] for i in imgs if not i["es_overlay_ar"] and (i["color"] or "").lower() == c["nombre"].lower()), None)
    overlays = [i["url"] for i in imgs if i["es_overlay_ar"]]
    elegido = next((c for c in colores if color and c["nombre"].lower() == color.lower()), None) or next((c for c in colores if c["overlayUrl"]), colores[0] if colores else None)
    overlay = (elegido or {}).get("overlayUrl") or (overlays[0] if overlays else None)
    tipo = p["ar_tipo"]
    return {
        "productoId": p["id"], "nombre": p["nombre"],
        "compatibleAR": overlay is not None,     # sin overlay se ofrece la vista alternativa (galeria de fotos)
        "overlayUrl": overlay,
        "proporcion": _proporcion(overlay) if overlay else None,
        "caracteristicas": {"tipo": tipo, "categoria": p["categoria"], "textura": p["textura"], "material": p["material"],
                             "colorDominante": (elegido or {}).get("hex"), "color": (elegido or {}).get("nombre")},
        "colores": colores,
        "ajuste": AJUSTES.get(tipo, AJUSTES["superior"]),
        "guia": GUIAS.get(tipo, GUIAS["superior"]),
        "galeria": [i["url"] for i in imgs if not i["es_overlay_ar"]],
    }
