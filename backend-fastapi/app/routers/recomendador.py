"""
Recomendador de prendas (CU-13).

Enfoque: filtrado BASADO EN CONTENIDO combinado con reglas de negocio (Parte I, cap. 13.1):
  1. Perfil del cliente = afinidad por categoria, color, coleccion y temporada, y rango de precio, construido con su historial
     (vistas, pruebas AR, carrito, reservas y compras) ponderado por tipo de accion y por antiguedad.
  2. Cada prenda candidata recibe una puntuacion segun cuanto se parece al perfil.
  3. Reglas de negocio: solo prendas con stock, prioridad a la temporada vigente, la talla habitual del cliente debe estar
     disponible, y se penaliza lo que ya compro.
  4. Si se consulta desde una prenda ("combina con"), se puntua similitud + complementariedad (vestido -> calzado, cartera...).
"""
import json
import math
from collections import defaultdict

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..catalogo import ficha, productos_activos
from ..db import pool

router = APIRouter(prefix="/api/recomendaciones", tags=["Recomendador"])

PESO_ACCION = {"vista": 1.0, "busqueda": 0.5, "probador": 3.0, "carrito": 3.0, "reserva": 4.0, "compra": 5.0}
VIDA_MEDIA_DIAS = 30.0

# categoria consultada -> categorias que combinan con ella
COMPLEMENTOS = {
    "Vestidos": ["Calzado", "Carteras", "Chaquetas"],
    "Blusas": ["Pantalones", "Faldas", "Carteras", "Chaquetas"],
    "Camisetas": ["Pantalones", "Faldas", "Chaquetas", "Calzado"],
    "Pantalones": ["Blusas", "Camisetas", "Calzado", "Chaquetas"],
    "Faldas": ["Blusas", "Camisetas", "Calzado", "Carteras"],
    "Chaquetas": ["Pantalones", "Vestidos", "Blusas", "Calzado"],
    "Calzado": ["Vestidos", "Pantalones", "Carteras"],
    "Carteras": ["Vestidos", "Blusas", "Calzado"],
}


class Peticion(BaseModel):
    cliente_id: int | None = None
    producto_id: int | None = None
    sucursal_id: int | None = None
    limite: int = Field(8, ge=1, le=24)


def _norm(d: dict) -> dict:
    total = sum(d.values()) or 1.0
    return {k: v / total for k, v in d.items()}


async def _perfil(cliente_id: int) -> dict:
    """Afinidades del cliente a partir de su historial."""
    async with pool().acquire() as con:
        inter = await con.fetch(
            """SELECT i.producto_id, i.tipo, (EXTRACT(EPOCH FROM (now() - i.creada_en)) / 86400.0)::float AS dias
                 FROM interacciones i WHERE i.usuario_id = $1 ORDER BY i.creada_en DESC LIMIT 300""", cliente_id)
        comprados = await con.fetch(
            """SELECT DISTINCT va.producto_id FROM venta_items it JOIN ventas v ON v.id = it.venta_id JOIN variantes va ON va.id = it.variante_id
                WHERE v.cliente_id = $1 AND v.estado IN ('completada','entregada','devuelta_parcial')""", cliente_id)
        pref = await con.fetchval("SELECT preferencias FROM usuarios WHERE id = $1", cliente_id)
    prefs = json.loads(pref) if isinstance(pref, str) else (pref or {})
    return {"interacciones": [dict(r) for r in inter], "comprados": {r["producto_id"] for r in comprados}, "prefs": prefs}


def _afinidades(perfil: dict, por_id: dict[int, dict]) -> dict:
    cat, col, coleccion, temp = defaultdict(float), defaultdict(float), defaultdict(float), defaultdict(float)
    precios: list[tuple[float, float]] = []
    vistos: set[int] = set()
    for it in perfil["interacciones"]:
        p = por_id.get(it["producto_id"])
        if not p:
            continue
        vistos.add(p["productoId"])
        w = PESO_ACCION.get(it["tipo"], 1.0) * math.pow(0.5, (it["dias"] or 0) / VIDA_MEDIA_DIAS)
        cat[p["categoria"]] += w
        coleccion[p["coleccion"]] += w
        temp[p["temporada"]] += w
        for c in p["colores"]:
            col[c] += w / max(len(p["colores"]), 1)
        precios.append((p["precio"], w))
    for pid in perfil["comprados"]:
        p = por_id.get(pid)
        if p:
            cat[p["categoria"]] += 5.0
            precios.append((p["precio"], 5.0))
    centro = sum(x * w for x, w in precios) / sum(w for _, w in precios) if precios else None
    return {"cat": _norm(cat), "col": _norm(col), "coleccion": _norm(coleccion), "temp": _norm(temp), "precio": centro, "vistos": vistos}


def _puntuar(p: dict, af: dict, perfil: dict) -> tuple[float, list[str]]:
    razones: list[str] = []
    s = 0.0
    a = af["cat"].get(p["categoria"], 0.0)
    if a:
        s += 0.35 * a
        razones.append(f"te interesan las {p['categoria'].lower()}")
    c = sum(af["col"].get(x, 0.0) for x in p["colores"])
    if c:
        s += 0.15 * min(c * 2, 1.0)
    fav = [x.lower() for x in perfil["prefs"].get("coloresFavoritos", [])]
    if any(x in fav for x in p["colores"]):
        s += 0.10
        razones.append("en tus colores favoritos")
    if af["coleccion"].get(p["coleccion"]):
        s += 0.08 * min(af["coleccion"][p["coleccion"]] * 2, 1.0)
    if af["temp"].get(p["temporada"]):
        s += 0.05
    if af["precio"]:
        s += 0.12 * max(0.0, 1 - abs(p["precio"] - af["precio"]) / max(af["precio"], 1))
    tope = perfil["prefs"].get("presupuestoMax")
    if tope and p["precioVigente"] > float(tope):
        s -= 0.25
    # reglas de negocio
    if p["temporada_vigente"]:
        s += 0.15
        razones.append("de la temporada actual")
    talla = perfil["prefs"].get("tallaHabitual")
    if talla and talla in p["tallas_disponibles"]:
        s += 0.08
        razones.append(f"tu talla {talla} está disponible")
    if p["promocion"]:
        s += 0.05
        razones.append(f"con {p['promocion']:.0f}% de descuento")
    if p["productoId"] in perfil["comprados"]:
        s -= 0.40
    return s, razones


def _similitud(base: dict, p: dict) -> tuple[float, list[str]]:
    razones: list[str] = []
    s = 0.0
    if p["categoria"] == base["categoria"]:
        s += 0.40
        razones.append("similar a la prenda que miras")
    elif p["categoria"] in COMPLEMENTOS.get(base["categoria"], []):
        s += 0.42
        razones.append(f"combina con {base['nombre']}")
    if p["coleccion_id"] and p["coleccion_id"] == base["coleccion_id"]:
        s += 0.18
        razones.append("de la misma colección")
    if p["temporada_id"] == base["temporada_id"]:
        s += 0.08
    s += 0.12 * max(0.0, 1 - abs(p["precio"] - base["precio"]) / max(base["precio"], 1))
    if set(p["colores"]) & set(base["colores"]):
        s += 0.10
    if p["temporada_vigente"]:
        s += 0.06
    return s, razones


@router.post("")
async def recomendar(req: Peticion):
    productos = await productos_activos(req.sucursal_id)
    por_id = {p["productoId"]: p for p in productos}
    candidatos = [p for p in productos if p["disponible"] > 0]      # regla de negocio: solo prendas con stock
    puntuados: list[tuple[float, str, dict]] = []
    modo = "popular"

    perfil = await _perfil(req.cliente_id) if req.cliente_id else None
    af = _afinidades(perfil, por_id) if perfil else None
    base = por_id.get(req.producto_id) if req.producto_id else None

    if base:
        modo = "similares"
        for p in candidatos:
            if p["productoId"] == base["productoId"]:
                continue
            s, r = _similitud(base, p)
            if perfil:
                s2, _ = _puntuar(p, af, perfil)
                s += 0.25 * s2
            puntuados.append((s, ", ".join(r[:2]) or "recomendada para ti", p))
    elif perfil and (af["cat"] or perfil["prefs"]):
        modo = "personalizado"
        for p in candidatos:
            s, r = _puntuar(p, af, perfil)
            puntuados.append((s, ("Porque " + " y ".join(r[:2])) if r else "Popular en la tienda", p))
    else:
        async with pool().acquire() as con:
            pop = {r["producto_id"]: r["n"] for r in await con.fetch(
                """SELECT va.producto_id, SUM(it.cantidad)::int AS n FROM venta_items it JOIN ventas v ON v.id = it.venta_id
                     JOIN variantes va ON va.id = it.variante_id WHERE v.creada_en > now() - interval '60 days' GROUP BY 1""")}
        mx = max(pop.values(), default=1)
        for p in candidatos:
            s = 0.6 * pop.get(p["productoId"], 0) / mx + (0.3 if p["temporada_vigente"] else 0) + (0.05 if p["promocion"] else 0)
            puntuados.append((s, "Lo más vendido de la temporada" if p["temporada_vigente"] else "Popular en la tienda", p))

    puntuados.sort(key=lambda x: -x[0])
    # diversidad: maximo 3 prendas por categoria para no llenar la lista con lo mismo
    elegidos, por_cat = [], defaultdict(int)
    for s, motivo, p in puntuados:
        if por_cat[p["categoria"]] >= 3:
            continue
        por_cat[p["categoria"]] += 1
        elegidos.append((s, motivo, p))
        if len(elegidos) >= req.limite:
            break

    if req.cliente_id and elegidos:
        async with pool().acquire() as con:
            await con.execute("DELETE FROM recomendaciones_ia WHERE cliente_id = $1 AND creada_en < now() - interval '2 days'", req.cliente_id)
            await con.executemany(
                "INSERT INTO recomendaciones_ia (cliente_id, producto_id, score, motivo) VALUES ($1,$2,$3,$4)",
                [(req.cliente_id, p["productoId"], round(max(s, 0), 3), m) for s, m, p in elegidos])
    return {"modo": modo, "recomendaciones": [ficha(p, s, m) for s, m, p in elegidos]}
