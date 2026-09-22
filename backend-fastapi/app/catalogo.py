"""Consultas de catalogo compartidas por el recomendador y el asistente."""
from .db import filas, pool

# Promocion vigente del producto (alias p)
SQL_PROMO = """COALESCE((SELECT MAX(pr.porcentaje) FROM promociones pr
   WHERE pr.activa AND current_date BETWEEN pr.fecha_inicio AND pr.fecha_fin
     AND (pr.producto_id = p.id OR pr.categoria_id = p.categoria_id OR pr.temporada_id = p.temporada_id
          OR (pr.producto_id IS NULL AND pr.categoria_id IS NULL AND pr.temporada_id IS NULL))), 0)"""


async def productos_activos(sucursal_id: int | None = None) -> list[dict]:
    """Todos los productos activos con atributos y disponibilidad (en la sucursal indicada o en todas)."""
    sql = f"""
    SELECT p.id AS "productoId", p.nombre, p.descripcion, p.material, p.textura, p.ar_tipo AS "arTipo",
           p.categoria_id, c.nombre AS categoria, p.temporada_id, t.nombre AS temporada, p.coleccion_id, co.nombre AS coleccion,
           p.precio_menor::float AS precio, ROUND(p.precio_menor * (1 - {SQL_PROMO} / 100.0), 2)::float AS "precioVigente",
           {SQL_PROMO}::float AS promocion,
           (t.activa AND current_date BETWEEN t.fecha_inicio AND t.fecha_fin) AS temporada_vigente,
           (SELECT i.url FROM producto_imagenes i WHERE i.producto_id = p.id AND NOT i.es_overlay_ar ORDER BY i.orden, i.id LIMIT 1) AS imagen,
           COALESCE((SELECT array_agg(DISTINCT lower(v.color)) FROM variantes v WHERE v.producto_id = p.id AND v.activo), '{{}}') AS colores,
           COALESCE((SELECT array_agg(DISTINCT v.talla) FROM variantes v WHERE v.producto_id = p.id AND v.activo
                       AND EXISTS (SELECT 1 FROM stock s JOIN almacenes a ON a.id = s.almacen_id AND a.es_tienda
                                    WHERE s.variante_id = v.id AND s.cantidad - s.reservado > 0 AND ($1::int IS NULL OR a.sucursal_id = $1))), '{{}}') AS tallas_disponibles,
           COALESCE((SELECT SUM(GREATEST(s.cantidad - s.reservado, 0)) FROM stock s JOIN variantes v ON v.id = s.variante_id AND v.activo
                       JOIN almacenes a ON a.id = s.almacen_id AND a.es_tienda AND a.activo JOIN sucursales su ON su.id = a.sucursal_id AND su.activa
                      WHERE v.producto_id = p.id AND ($1::int IS NULL OR a.sucursal_id = $1)), 0)::int AS disponible
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN temporadas t ON t.id = p.temporada_id
      LEFT JOIN colecciones co ON co.id = p.coleccion_id
     WHERE p.activo
    """
    async with pool().acquire() as con:
        return filas(await con.fetch(sql, sucursal_id))


def ficha(p: dict, score: float | None = None, motivo: str | None = None) -> dict:
    """Formato compacto que consumen la web y la app."""
    out = {
        "productoId": p["productoId"], "nombre": p["nombre"], "categoria": p["categoria"], "temporada": p["temporada"],
        "precio": p["precio"], "precioVigente": p["precioVigente"], "promocion": p["promocion"], "imagen": p["imagen"],
        "disponible": p["disponible"], "colores": p["colores"], "arTipo": p["arTipo"],
    }
    if score is not None:
        out["score"] = round(score, 3)
    if motivo:
        out["motivo"] = motivo
    return out
