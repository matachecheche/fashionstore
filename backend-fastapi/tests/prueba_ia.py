"""Pruebas del servicio de IA (requiere el servicio en marcha en :8000 y la BD con datos de demo).  python tests/prueba_ia.py"""
import json
import sys
import urllib.request

BASE = "http://localhost:8000"
fallos = 0


def post(ruta, cuerpo):
    req = urllib.request.Request(BASE + ruta, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def get(ruta):
    with urllib.request.urlopen(BASE + ruta) as r:
        return r.status, json.loads(r.read())


def ok(c, m, extra=None):
    global fallos
    if not c:
        fallos += 1
    print(("  ✓ " if c else "  ✗ FALLO: ") + m + ("" if c or extra is None else f"  {str(extra)[:250]}"))


print("== Recomendador")
s, r = post("/api/recomendaciones", {"cliente_id": 7, "limite": 6})
ok(s == 200 and r["modo"] == "personalizado" and len(r["recomendaciones"]) > 0, "recomendaciones personalizadas para la cliente de demo", r)
ok(all(x["disponible"] > 0 for x in r["recomendaciones"]), "solo recomienda prendas con stock")
ok(all("motivo" in x for x in r["recomendaciones"]), "cada recomendación explica el motivo", r["recomendaciones"][:1])
s, r2 = post("/api/recomendaciones", {"producto_id": 1, "limite": 6})
ok(r2["modo"] == "similares" and 1 not in [x["productoId"] for x in r2["recomendaciones"]], "prendas que combinan con un vestido (excluye la misma)", r2["recomendaciones"][:2])
ok(any(x["categoria"] in ("Calzado", "Carteras") for x in r2["recomendaciones"]), "sugiere complementos (calzado/carteras) para un vestido")
s, r3 = post("/api/recomendaciones", {"limite": 5})
ok(r3["modo"] == "popular" and len(r3["recomendaciones"]) == 5, "sin sesión: lo más popular de la temporada")

print("== Asistente virtual")
s, c = post("/api/asistente/chat", {"mensaje": "busco un vestido para una fiesta de verano"})
ok(s == 200 and c["modelo"] == "reglas" and len(c["productos"]) > 0 and all(p["categoria"] in ("Vestidos", "Calzado") for p in c["productos"]), "busca vestidos para una fiesta", c["respuesta"][:200])
s, c = post("/api/asistente/chat", {"mensaje": "blusas rosadas talla M hasta 150 Bs"})
ok(len(c["productos"]) > 0 and all(p["categoria"] == "Blusas" and p["precioVigente"] <= 150 for p in c["productos"]), "filtra por categoría, color, talla y presupuesto", c["respuesta"][:200])
s, c = post("/api/asistente/chat", {"mensaje": "¿Cómo reservo una prenda?"})
ok("Reservar" in c["respuesta"] and "RES-" in c["respuesta"], "responde cómo usar la plataforma (reservas)")
s, c = post("/api/asistente/chat", {"mensaje": "¿Cómo funciona el vestidor virtual?"})
ok("cámara" in c["respuesta"], "explica el vestidor virtual (acentos correctos)")
s, c = post("/api/asistente/chat", {"mensaje": "¿Dónde están las sucursales y qué horario tienen?"})
ok("Sucursal Centro" in c["respuesta"] and "Cochabamba" in c["respuesta"], "lista sucursales reales desde la BD")
s, c = post("/api/asistente/chat", {"mensaje": "qué hay en oferta"})
ok(all(p["promocion"] > 0 for p in c["productos"]) and len(c["productos"]) > 0, "encuentra prendas en oferta")

print("== Soporte AR")
s, a = get("/api/ar/prenda/1")
ok(a["compatibleAR"] and a["overlayUrl"].endswith("-ar.png") and a["proporcion"] and abs(a["proporcion"] - 0.7143) < 0.02, "datos AR de una prenda (overlay + proporción real)", a)
ok(a["caracteristicas"]["tipo"] == "vestido" and a["ajuste"]["referencia"] == "hombros" and len(a["colores"]) == 2, "características visuales y parámetros de ajuste")
s, a2 = get("/api/ar/prenda/1?color=Vino")
ok(a2["overlayUrl"].endswith("vestido-vino-ar.png") and a2["caracteristicas"]["colorDominante"] == "#6d1f3a", "cambia el overlay al cambiar de color")

print("== Reportes (Text-to-SQL)")
s, r = post("/api/reportes/ask", {"pregunta": "ventas por sucursal"})
ok(s == 200 and r["columnas"][0] == "sucursal" and len(r["filas"]) == 4, "plantilla: ventas por sucursal", r)
s, r = post("/api/reportes/ask", {"pregunta": "¿cuáles son las prendas más reservadas?"})
ok(s == 200 and "reservad" in r["columnas"][1], "plantilla: prendas más reservadas")
s, r = post("/api/reportes/ask", {"pregunta": "muéstrame el inventario crítico"})
ok(s == 200 and "disponible" in r["columnas"], "plantilla: inventario crítico")
s, r = post("/api/reportes/ask", {"pregunta": "quiero la receta de una torta"})
ok(s == 422, "pregunta no entendida -> 422 con sugerencias")
sys.path.insert(0, ".")
from app.routers.reportes import validar_sql  # noqa: E402
from fastapi import HTTPException  # noqa: E402
for malo in ["DROP TABLE ventas", "SELECT 1; DELETE FROM ventas", "SELECT password_hash FROM usuarios", "UPDATE ventas SET total=0", "SELECT * FROM pg_shadow", "SELECT 1 -- x", "WITH x AS (DELETE FROM ventas RETURNING *) SELECT * FROM x"]:
    try:
        validar_sql(malo)
        ok(False, f"debía rechazar: {malo}")
    except HTTPException:
        ok(True, f"rechaza SQL peligroso: {malo[:40]}")
print(f"\n{'✔ todo correcto' if not fallos else str(fallos) + ' FALLOS'}")
sys.exit(1 if fallos else 0)
