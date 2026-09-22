import { Controller, Get, Header, Injectable, Module, Query, Req, Res } from '@nestjs/common';
import { Db } from '../common/db';
import { Auth, sucursalPermitida, UsuarioJwt } from '../common/auth';
import { num, toCsv } from '../common/util';

const VALIDAS = `v.estado IN ('completada','entregada','devuelta_parcial')`;

@Injectable()
export class ReportesService {
  constructor(private db: Db) {}

  private rango(f: Record<string, string>) {
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(f.hasta ?? '') ? f.hasta : new Date().toISOString().slice(0, 10);
    const d = new Date(hasta); d.setDate(d.getDate() - 29);
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(f.desde ?? '') ? f.desde : d.toISOString().slice(0, 10);
    return { desde, hasta };
  }

  // CU-14: indicadores de ventas, prendas mas reservadas e inventario critico
  async dashboard(u: UsuarioJwt, f: Record<string, string>) {
    const { desde, hasta } = this.rango(f);
    const suc = sucursalPermitida(u, num(f.sucursalId));
    const p = [desde, hasta, suc];
    const rango = `v.creada_en >= $1::date AND v.creada_en < ($2::date + 1) AND ($3::int IS NULL OR v.sucursal_id = $3)`;

    const [kpi, hoy, porDia, porSucursal, porMetodo, porCanal, topVendidos, topReservados, criticos, reservasEstado, reservasAct, clientes, ultimas] = await Promise.all([
      this.db.one(`SELECT COALESCE(SUM(v.total),0)::float AS "ventasTotal", COUNT(*)::int AS "nVentas", COALESCE(AVG(v.total),0)::float AS "ticketPromedio",
                          COALESCE((SELECT SUM(i.cantidad) FROM venta_items i JOIN ventas v2 ON v2.id = i.venta_id WHERE v2.id IN (SELECT id FROM ventas v WHERE ${VALIDAS} AND ${rango})),0)::int AS "unidades"
                     FROM ventas v WHERE ${VALIDAS} AND ${rango}`, p),
      this.db.one(`SELECT COALESCE(SUM(total),0)::float AS total, COUNT(*)::int AS n FROM ventas v WHERE ${VALIDAS} AND v.creada_en::date = current_date AND ($1::int IS NULL OR v.sucursal_id = $1)`, [suc]),
      this.db.q(`SELECT to_char(d, 'YYYY-MM-DD') AS fecha, COALESCE(SUM(v.total),0)::float AS total, COUNT(v.id)::int AS ventas
                   FROM generate_series($1::date, $2::date, '1 day') d
                   LEFT JOIN ventas v ON v.creada_en::date = d AND ${VALIDAS} AND ($3::int IS NULL OR v.sucursal_id = $3) GROUP BY d ORDER BY d`, p),
      this.db.q(`SELECT s.id AS "sucursalId", s.nombre AS sucursal, COALESCE(SUM(v.total),0)::float AS total, COUNT(v.id)::int AS ventas
                   FROM sucursales s LEFT JOIN ventas v ON v.sucursal_id = s.id AND ${VALIDAS} AND v.creada_en >= $1::date AND v.creada_en < ($2::date + 1)
                  WHERE s.activa AND ($3::int IS NULL OR s.id = $3) GROUP BY s.id ORDER BY total DESC`, p),
      this.db.q(`SELECT v.metodo_pago AS metodo, COUNT(*)::int AS ventas, SUM(v.total)::float AS total FROM ventas v WHERE ${VALIDAS} AND ${rango} GROUP BY 1 ORDER BY total DESC`, p),
      this.db.q(`SELECT v.canal, COUNT(*)::int AS ventas, SUM(v.total)::float AS total FROM ventas v WHERE ${VALIDAS} AND ${rango} GROUP BY 1 ORDER BY total DESC`, p),
      this.db.q(`SELECT pr.id AS "productoId", pr.nombre AS producto, SUM(i.cantidad)::int AS unidades, SUM(i.cantidad * i.precio_unit)::float AS total
                   FROM venta_items i JOIN ventas v ON v.id = i.venta_id JOIN variantes va ON va.id = i.variante_id JOIN productos pr ON pr.id = va.producto_id
                  WHERE ${VALIDAS} AND ${rango} GROUP BY pr.id ORDER BY unidades DESC LIMIT 8`, p),
      this.db.q(`SELECT pr.id AS "productoId", pr.nombre AS producto, SUM(d.cantidad)::int AS unidades, COUNT(DISTINCT r.id)::int AS reservas
                   FROM detalle_reserva d JOIN reservas r ON r.id = d.reserva_id JOIN variantes va ON va.id = d.variante_id JOIN productos pr ON pr.id = va.producto_id
                  WHERE r.creada_en >= $1::date AND r.creada_en < ($2::date + 1) AND ($3::int IS NULL OR r.sucursal_id = $3)
                  GROUP BY pr.id ORDER BY unidades DESC LIMIT 8`, p),
      this.db.q(`SELECT producto, talla, color, sucursal, disponible, stock_minimo AS "stockMinimo", estado FROM inventario_critico
                  WHERE ($1::int IS NULL OR sucursal_id = $1) ORDER BY disponible, producto LIMIT 12`, [suc]),
      this.db.q(`SELECT estado, COUNT(*)::int AS n FROM reservas r WHERE r.creada_en >= $1::date AND r.creada_en < ($2::date + 1) AND ($3::int IS NULL OR r.sucursal_id = $3) GROUP BY estado`, p),
      this.db.one(`SELECT COUNT(*)::int AS n FROM reservas WHERE estado IN ('PENDIENTE','EN_ATENCION') AND ($1::int IS NULL OR sucursal_id = $1)`, [suc]),
      this.db.one(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol='cliente' AND creado_en >= $1::date AND creado_en < ($2::date + 1)`, p.slice(0, 2)),
      this.db.q(`SELECT v.id, v.numero_comprobante AS comprobante, v.total, v.canal, v.metodo_pago AS metodo, v.estado, v.creada_en AS "creadaEn", s.nombre AS sucursal
                   FROM ventas v JOIN sucursales s ON s.id = v.sucursal_id WHERE ($1::int IS NULL OR v.sucursal_id = $1) ORDER BY v.id DESC LIMIT 6`, [suc]),
    ]);
    const cantCrit = await this.db.one(`SELECT COUNT(*) FILTER (WHERE estado='critico')::int AS criticos, COUNT(*) FILTER (WHERE estado='agotado')::int AS agotados
                                          FROM inventario_critico WHERE ($1::int IS NULL OR sucursal_id = $1)`, [suc]);
    return {
      rango: { desde, hasta }, sucursalId: suc,
      kpis: { ...kpi, ventasHoy: hoy.total, nVentasHoy: hoy.n, reservasActivas: reservasAct.n, inventarioCritico: cantCrit.criticos, inventarioAgotado: cantCrit.agotados, clientesNuevos: clientes.n },
      ventasPorDia: porDia, ventasPorSucursal: porSucursal, ventasPorMetodo: porMetodo, ventasPorCanal: porCanal,
      topVendidos, topReservados, inventarioCritico: criticos, reservasPorEstado: reservasEstado, ultimasVentas: ultimas,
    };
  }

  async csv(u: UsuarioJwt, tipo: string, f: Record<string, string>) {
    const { desde, hasta } = this.rango(f);
    const suc = sucursalPermitida(u, num(f.sucursalId));
    if (tipo === 'ventas') {
      const filas = await this.db.q(
        `SELECT v.numero_comprobante AS comprobante, to_char(v.creada_en, 'YYYY-MM-DD HH24:MI') AS fecha, s.nombre AS sucursal, v.canal, v.tipo, v.metodo_pago AS metodo,
                v.estado, v.subtotal, v.descuento, v.total, COALESCE(u.nombre, 'Mostrador') AS cliente
           FROM ventas v JOIN sucursales s ON s.id = v.sucursal_id LEFT JOIN usuarios u ON u.id = v.cliente_id
          WHERE v.creada_en >= $1::date AND v.creada_en < ($2::date + 1) AND ($3::int IS NULL OR v.sucursal_id = $3) ORDER BY v.creada_en`, [desde, hasta, suc]);
      return toCsv(filas, ['comprobante', 'fecha', 'sucursal', 'canal', 'tipo', 'metodo', 'estado', 'subtotal', 'descuento', 'total', 'cliente'].map((c) => ({ campo: c, titulo: c.charAt(0).toUpperCase() + c.slice(1) })));
    }
    if (tipo === 'inventario') {
      const filas = await this.db.q(
        `SELECT p.nombre AS producto, v.sku, v.talla, v.color, su.nombre AS sucursal, a.nombre AS almacen, s.cantidad, s.reservado,
                GREATEST(s.cantidad - s.reservado,0) AS disponible, s.stock_minimo AS minimo
           FROM stock s JOIN variantes v ON v.id = s.variante_id JOIN productos p ON p.id = v.producto_id JOIN almacenes a ON a.id = s.almacen_id JOIN sucursales su ON su.id = a.sucursal_id
          WHERE ($1::int IS NULL OR su.id = $1) ORDER BY su.nombre, p.nombre, v.id`, [suc]);
      return toCsv(filas, ['producto', 'sku', 'talla', 'color', 'sucursal', 'almacen', 'cantidad', 'reservado', 'disponible', 'minimo'].map((c) => ({ campo: c, titulo: c.charAt(0).toUpperCase() + c.slice(1) })));
    }
    const filas = await this.db.q(
      `SELECT r.codigo, to_char(r.fecha_hora_estimada, 'YYYY-MM-DD HH24:MI') AS fecha, r.estado, s.nombre AS sucursal, u.nombre AS cliente,
              (SELECT string_agg(p.nombre || ' ' || v.talla || '/' || v.color || ' x' || d.cantidad, ', ') FROM detalle_reserva d JOIN variantes v ON v.id = d.variante_id JOIN productos p ON p.id = v.producto_id WHERE d.reserva_id = r.id) AS prendas
         FROM reservas r JOIN sucursales s ON s.id = r.sucursal_id JOIN usuarios u ON u.id = r.cliente_id
        WHERE r.fecha_hora_estimada >= $1::date AND r.fecha_hora_estimada < ($2::date + 1) AND ($3::int IS NULL OR r.sucursal_id = $3) ORDER BY r.fecha_hora_estimada`, [desde, hasta, suc]);
    return toCsv(filas, ['codigo', 'fecha', 'estado', 'sucursal', 'cliente', 'prendas'].map((c) => ({ campo: c, titulo: c.charAt(0).toUpperCase() + c.slice(1) })));
  }
}

@Controller('reportes')
@Auth('admin', 'encargado')
export class ReportesController {
  constructor(private s: ReportesService) {}
  @Get('dashboard') dashboard(@Query() f: Record<string, string>, @Req() r: any) { return this.s.dashboard(r.user, f); }
  @Get('export') async exportar(@Query() f: Record<string, string>, @Req() r: any, @Res() res: any) {
    const tipo = ['ventas', 'inventario', 'reservas'].includes(f.tipo) ? f.tipo : 'ventas';
    const csv = await this.s.csv(r.user, tipo, f);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="fashionstore-${tipo}.csv"` }).send(csv);
  }
}

@Module({ providers: [ReportesService], controllers: [ReportesController] })
export class ReportesModule {}
