"""
Reportes bajo demanda con lenguaje natural (Text-to-SQL) — texto o voz (el navegador transcribe la voz a texto).

Seguridad (IMPORTANTE: el SQL lo escribe un modelo, asi que se trata como no confiable):
  1. Solo una sentencia SELECT/WITH; se rechazan palabras peligrosas, comentarios, ';' intermedios y tablas del sistema.
  2. Se ejecuta dentro de una transaccion READ ONLY con SET LOCAL ROLE app_reportes (rol con SELECT solo sobre las tablas
     del negocio y sin acceso a password_hash) y statement_timeout de 5 s. Aunque el filtro fallara, la base impide escribir.
  3. El resultado se limita a 200 filas.
Sin GEMINI_API_KEY funciona con plantillas de consultas frecuentes.
"""
import re
import unicodedata

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import llm
from ..db import filas, pool

router = APIRouter(prefix="/api/reportes", tags=["Reportes con IA"])

ESQUEMA = """Base de datos PostgreSQL de FashionStore (cadena de tiendas de ropa). Tablas (todas en español) y columnas útiles:
sucursales(id, nombre, ciudad, direccion, activa)
almacenes(id, sucursal_id, nombre, es_tienda)
categorias(id, nombre) ; temporadas(id, nombre, fecha_inicio, fecha_fin) ; colecciones(id, temporada_id, nombre) ; proveedores(id, nombre)
productos(id, categoria_id, temporada_id, coleccion_id, proveedor_id, nombre, precio_menor, precio_mayor, activo)
variantes(id, producto_id, talla, color, sku)
stock(variante_id, almacen_id, cantidad, reservado, stock_minimo)   -- disponible = cantidad - reservado
movimientos_inventario(id, variante_id, almacen_id, tipo, delta_cantidad, creado_en)
ventas(id, numero_comprobante, cliente_id, sucursal_id, canal ['web','app','pos'], tipo ['presencial','digital'], metodo_pago ['efectivo','tarjeta','qr','transferencia','contra_entrega','paypal'],
       estado ['pendiente_pago','pendiente','completada','entregada','cancelada','devuelta_parcial','devuelta'], subtotal, descuento, total, creada_en)
venta_items(id, venta_id, variante_id, cantidad, precio_unit)
pagos(id, venta_id, metodo, pasarela, estado, monto)
reservas(id, codigo, cliente_id, sucursal_id, fecha_hora_estimada, estado ['PENDIENTE','EN_ATENCION','COMPLETADA','CANCELADA'], creada_en)
detalle_reserva(id, reserva_id, variante_id, cantidad)
devoluciones(id, venta_id, monto, creada_en)
usuarios(id, nombre, email, rol, sucursal_id, creado_en)
Vistas: disponibilidad_sucursal(producto_id, variante_id, talla, color, sucursal_id, sucursal, disponible), inventario_critico(producto, talla, color, sucursal, disponible, estado)
Las ventas "válidas" son las de estado IN ('completada','entregada','devuelta_parcial'). Moneda: bolivianos (Bs)."""

PROMPT_SQL = f"""Eres un experto en PostgreSQL. Convierte la pregunta del usuario en UNA sola consulta SELECT (o WITH ... SELECT).
{ESQUEMA}
Reglas estrictas: solo SELECT; sin punto y coma final ni comentarios; usa alias en español legibles para las columnas; ordena de forma útil;
no uses funciones del sistema ni tablas fuera del esquema; devuelve SOLO el SQL, sin explicaciones ni bloques de código."""

PROHIBIDAS = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|merge|vacuum|analyze|set|reset|listen|notify|lock|pg_[a-z_]+|information_schema|password_hash|dblink|lo_[a-z]+)\b",
    re.IGNORECASE)


def validar_sql(sql: str) -> str:
    s = sql.strip().strip("`").strip()
    s = re.sub(r"^```(?:sql)?|```$", "", s, flags=re.IGNORECASE).strip()
    if s.endswith(";"):
        s = s[:-1].strip()
    if not s or ";" in s or "--" in s or "/*" in s or "*/" in s:
        raise HTTPException(400, "La consulta generada no es válida (una sola sentencia, sin comentarios).")
    if not re.match(r"^(select|with)\b", s, re.IGNORECASE):
        raise HTTPException(400, "Solo se permiten consultas de lectura (SELECT).")
    if PROHIBIDAS.search(s):
        raise HTTPException(400, "La consulta contiene operaciones no permitidas.")
    return s


async def ejecutar(sql: str) -> tuple[list[str], list[dict]]:
    sql = validar_sql(sql)
    async with pool().acquire() as con:
        try:
            async with con.transaction(readonly=True):
                await con.execute("SET LOCAL ROLE app_reportes")
                await con.execute("SET LOCAL statement_timeout = '5s'")
                rows = await con.fetch(f"SELECT * FROM ({sql}) AS resultado LIMIT 200")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"No se pudo ejecutar la consulta: {str(e).splitlines()[0]}")
    datos = filas(rows)
    return (list(datos[0].keys()) if datos else []), datos


def norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


VALIDAS = "v.estado IN ('completada','entregada','devuelta_parcial')"
PLANTILLAS = [
    (["por sucursal", "cada sucursal", "sucursales"], ["venta", "vend", "ingres", "factur"], "Ventas totales por sucursal",
     f"SELECT s.nombre AS sucursal, COUNT(v.id) AS ventas, COALESCE(SUM(v.total),0) AS total_bs FROM sucursales s LEFT JOIN ventas v ON v.sucursal_id = s.id AND {VALIDAS} GROUP BY s.nombre ORDER BY total_bs DESC"),
    (["mas vendid", "mas se vend", "top", "mejor"], ["prenda", "producto", "vendid", "vend"], "Prendas más vendidas",
     f"SELECT p.nombre AS producto, SUM(i.cantidad) AS unidades, SUM(i.cantidad*i.precio_unit) AS total_bs FROM venta_items i JOIN ventas v ON v.id=i.venta_id JOIN variantes va ON va.id=i.variante_id JOIN productos p ON p.id=va.producto_id WHERE {VALIDAS} GROUP BY p.nombre ORDER BY unidades DESC LIMIT 10"),
    (["mas reservad", "reservadas"], ["prenda", "producto", "reserva"], "Prendas más reservadas",
     "SELECT p.nombre AS producto, SUM(d.cantidad) AS unidades_reservadas, COUNT(DISTINCT r.id) AS reservas FROM detalle_reserva d JOIN reservas r ON r.id=d.reserva_id JOIN variantes va ON va.id=d.variante_id JOIN productos p ON p.id=va.producto_id GROUP BY p.nombre ORDER BY unidades_reservadas DESC LIMIT 10"),
    (["critico", "agotad", "poco stock", "bajo stock", "stock bajo"], [], "Inventario crítico y agotado",
     "SELECT producto, talla, color, sucursal, disponible, estado FROM inventario_critico ORDER BY disponible, producto LIMIT 100"),
    (["reserva"], ["estado", "cuantas", "cantidad", "resumen"], "Reservas por estado",
     "SELECT estado, COUNT(*) AS reservas FROM reservas GROUP BY estado ORDER BY reservas DESC"),
    (["metodo", "forma de pago", "medio de pago"], [], "Ventas por método de pago",
     f"SELECT v.metodo_pago AS metodo, COUNT(*) AS ventas, SUM(v.total) AS total_bs FROM ventas v WHERE {VALIDAS} GROUP BY 1 ORDER BY total_bs DESC"),
    (["canal", "web", "app", "digital", "presencial"], ["venta", "vend"], "Ventas por canal",
     f"SELECT v.canal, v.tipo, COUNT(*) AS ventas, SUM(v.total) AS total_bs FROM ventas v WHERE {VALIDAS} GROUP BY 1,2 ORDER BY total_bs DESC"),
    (["mes", "mensual"], ["venta", "vend"], "Ventas por mes",
     f"SELECT to_char(date_trunc('month', v.creada_en), 'YYYY-MM') AS mes, COUNT(*) AS ventas, SUM(v.total) AS total_bs FROM ventas v WHERE {VALIDAS} GROUP BY 1 ORDER BY 1"),
    (["dia", "diari", "ultimos", "semana"], ["venta", "vend"], "Ventas de los últimos 14 días",
     f"SELECT v.creada_en::date AS dia, COUNT(*) AS ventas, SUM(v.total) AS total_bs FROM ventas v WHERE {VALIDAS} AND v.creada_en >= current_date - 13 GROUP BY 1 ORDER BY 1"),
    (["hoy"], ["venta", "vend"], "Ventas de hoy por sucursal",
     f"SELECT s.nombre AS sucursal, COUNT(v.id) AS ventas, COALESCE(SUM(v.total),0) AS total_bs FROM sucursales s LEFT JOIN ventas v ON v.sucursal_id=s.id AND {VALIDAS} AND v.creada_en::date=current_date GROUP BY s.nombre ORDER BY total_bs DESC"),
    (["cliente"], ["compr", "mejor", "top", "frecuente"], "Mejores clientes",
     f"SELECT u.nombre AS cliente, COUNT(v.id) AS compras, SUM(v.total) AS total_bs FROM ventas v JOIN usuarios u ON u.id=v.cliente_id WHERE {VALIDAS} GROUP BY u.nombre ORDER BY total_bs DESC LIMIT 10"),
    (["categoria"], [], "Ventas por categoría",
     f"SELECT c.nombre AS categoria, SUM(i.cantidad) AS unidades, SUM(i.cantidad*i.precio_unit) AS total_bs FROM venta_items i JOIN ventas v ON v.id=i.venta_id JOIN variantes va ON va.id=i.variante_id JOIN productos p ON p.id=va.producto_id JOIN categorias c ON c.id=p.categoria_id WHERE {VALIDAS} GROUP BY c.nombre ORDER BY total_bs DESC"),
    (["temporada", "coleccion"], [], "Ventas por temporada",
     f"SELECT t.nombre AS temporada, SUM(i.cantidad) AS unidades, SUM(i.cantidad*i.precio_unit) AS total_bs FROM venta_items i JOIN ventas v ON v.id=i.venta_id JOIN variantes va ON va.id=i.variante_id JOIN productos p ON p.id=va.producto_id JOIN temporadas t ON t.id=p.temporada_id WHERE {VALIDAS} GROUP BY t.nombre ORDER BY total_bs DESC"),
    (["stock", "inventario", "existencia"], ["sucursal", "cada", "total"], "Existencias por sucursal",
     "SELECT su.nombre AS sucursal, SUM(s.cantidad) AS existencias, SUM(s.reservado) AS reservado, SUM(s.cantidad-s.reservado) AS disponible FROM stock s JOIN almacenes a ON a.id=s.almacen_id JOIN sucursales su ON su.id=a.sucursal_id GROUP BY su.nombre ORDER BY existencias DESC"),
    (["devolucion", "devuelt"], [], "Devoluciones",
     "SELECT d.creada_en::date AS fecha, v.numero_comprobante AS comprobante, d.monto AS monto_bs, d.motivo FROM devoluciones d JOIN ventas v ON v.id=d.venta_id ORDER BY d.creada_en DESC LIMIT 50"),
    (["ticket promedio", "promedio"], [], "Ticket promedio por sucursal",
     f"SELECT s.nombre AS sucursal, ROUND(AVG(v.total),2) AS ticket_promedio_bs FROM ventas v JOIN sucursales s ON s.id=v.sucursal_id WHERE {VALIDAS} GROUP BY s.nombre ORDER BY 2 DESC"),
]
SUGERENCIAS = ["Ventas por sucursal", "Prendas más vendidas", "Prendas más reservadas", "Inventario crítico", "Ventas por método de pago", "Ventas por mes", "Mejores clientes"]


def elegir_plantilla(pregunta: str):
    t = norm(pregunta)
    mejor, puntaje = None, 0
    for primarias, secundarias, titulo, sql in PLANTILLAS:
        a = sum(1 for k in primarias if norm(k) in t)
        if not a:
            continue
        p = a * 2 + sum(1 for k in secundarias if norm(k) in t)
        if p > puntaje:
            mejor, puntaje = (titulo, sql), p
    return mejor


class Pregunta(BaseModel):
    pregunta: str = Field(..., min_length=3, max_length=500)


@router.post("/ask")
async def ask(req: Pregunta):
    modo, sql, titulo = "plantilla", None, None
    if llm.disponible():
        generado = await llm.generar(PROMPT_SQL, [{"rol": "user", "texto": req.pregunta}], temperatura=0.0, max_tokens=500)
        if generado:
            try:
                sql = validar_sql(generado)
                modo, titulo = "gemini", "Consulta generada con IA"
            except HTTPException:
                sql = None
    if not sql:
        elegida = elegir_plantilla(req.pregunta)
        if not elegida:
            raise HTTPException(422, "No entendí la consulta. Prueba con: " + "; ".join(SUGERENCIAS[:4]) + ". (Con una clave de Gemini configurada puedo responder preguntas más libres.)")
        titulo, sql = elegida
    columnas, datos = await ejecutar(sql)
    resumen = f"{titulo}: {len(datos)} fila(s)."
    if datos and llm.disponible():
        r = await llm.generar("Resume en una o dos frases en español (bolivianos, Bs) el hallazgo principal del resultado. Sé concreto y no inventes datos.",
                               [{"rol": "user", "texto": f"Pregunta: {req.pregunta}\nColumnas: {columnas}\nPrimeras filas: {datos[:8]}"}], max_tokens=200)
        if r:
            resumen = r
    return {"pregunta": req.pregunta, "titulo": titulo, "modo": modo, "sql": sql, "columnas": columnas, "filas": datos, "resumen": resumen, "sugerencias": SUGERENCIAS}
