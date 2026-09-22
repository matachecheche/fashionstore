import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { randomBytes } from 'crypto';
import { Db, Tx } from '../common/db';
import { Notificador } from '../common/notificador';
import { VentaStock } from '../common/venta-stock';
import { Auth, esStaff, puedeVerSucursal, sucursalPermitida, UsuarioJwt } from '../common/auth';
import { idParam, num, redondear } from '../common/util';
import { PagosModule, PagosService } from '../pagos/pagos.module';

class ItemVenta { @IsInt() varianteId: number; @IsInt() @IsPositive() cantidad: number }
export class CrearVentaDto {
  @IsIn(['web', 'app', 'pos']) canal: string;
  @IsOptional() @IsInt() sucursalId?: number;
  @IsOptional() @IsInt() reservaId?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => ItemVenta) items?: ItemVenta[];
  @IsOptional() @IsIn(['mayor', 'menor']) tipoVenta?: string;
  @IsIn(['efectivo', 'tarjeta', 'qr', 'transferencia', 'contra_entrega', 'paypal']) metodoPago: string;
  @IsOptional() @IsIn(['libelula', 'stripe', 'paypal']) pasarela?: string;
  @IsOptional() @IsInt() clienteId?: number;
  @IsOptional() @IsString() @MaxLength(30) documentoCliente?: string;
  @IsOptional() @IsString() @MaxLength(300) notas?: string;
  @IsOptional() @IsString() @MaxLength(80) origenOfflineId?: string;
}
class ReintentoDto {
  @IsIn(['tarjeta', 'qr', 'paypal']) metodoPago: string;
  @IsOptional() @IsIn(['libelula', 'stripe', 'paypal']) pasarela?: string;
}
class DevolucionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemVenta) items: ItemVenta[];
  @IsOptional() @IsString() @MaxLength(300) motivo?: string;
}

const METODOS_POS = ['efectivo', 'tarjeta', 'qr', 'transferencia'];
const METODOS_DIGITAL = ['tarjeta', 'qr', 'paypal', 'contra_entrega'];
const PASARELA_METODOS = ['tarjeta', 'qr', 'paypal'];

const SELECT_VENTA = `
  SELECT v.id, v.numero_comprobante AS comprobante, v.canal, v.tipo, v.tipo_venta AS "tipoVenta", v.metodo_pago AS "metodoPago", v.estado,
         v.subtotal, v.descuento, v.total, v.moneda, v.notas, v.documento_cliente AS "documentoCliente", v.creada_en AS "creadaEn",
         v.sucursal_id AS "sucursalId", su.nombre AS sucursal, v.almacen_id AS "almacenId", v.cliente_id AS "clienteId", u.nombre AS cliente,
         v.caja_id AS "cajaId", v.reserva_id AS "reservaId", r.codigo AS "reservaCodigo",
         COALESCE((SELECT json_agg(json_build_object('varianteId', i.variante_id, 'producto', p.nombre, 'productoId', p.id, 'talla', va.talla, 'color', va.color, 'sku', va.sku,
                     'cantidad', i.cantidad, 'precioLista', i.precio_lista, 'precioUnit', i.precio_unit,
                     'devuelto', COALESCE((SELECT SUM(di.cantidad) FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id WHERE d.venta_id = v.id AND di.variante_id = i.variante_id), 0),
                     'imagen', (SELECT im.url FROM producto_imagenes im WHERE im.producto_id = p.id AND NOT im.es_overlay_ar ORDER BY im.orden LIMIT 1)) ORDER BY i.id)
                     FROM venta_items i JOIN variantes va ON va.id = i.variante_id JOIN productos p ON p.id = va.producto_id WHERE i.venta_id = v.id), '[]'::json) AS items,
         (SELECT row_to_json(x) FROM (SELECT pg.id, pg.estado, pg.metodo, pg.pasarela, pg.monto, pg.referencia, pg.expira_en AS "expiraEn", pg.motivo_rechazo AS "motivoRechazo"
                                        FROM pagos pg WHERE pg.venta_id = v.id ORDER BY pg.id DESC LIMIT 1) x) AS pago
    FROM ventas v JOIN sucursales su ON su.id = v.sucursal_id LEFT JOIN usuarios u ON u.id = v.cliente_id LEFT JOIN reservas r ON r.id = v.reserva_id`;

@Injectable()
export class VentasService {
  constructor(private db: Db, private notif: Notificador, private stock: VentaStock, private pagos: PagosService) {}

  async obtener(id: number, tx: Tx | Db = this.db) {
    const v = await tx.one(`${SELECT_VENTA} WHERE v.id = $1`, [id]);
    if (!v) throw new NotFoundException('Venta no encontrada');
    return v;
  }

  private acceso(u: UsuarioJwt, v: any) {
    if (u.rol === 'cliente' || u.rol === 'proveedor') { if (v.clienteId !== u.id) throw new ForbiddenException('Esta compra no te pertenece'); return; }
    if (!puedeVerSucursal(u, v.sucursalId)) throw new ForbiddenException('Esta venta pertenece a otra sucursal');
  }

  async detalle(u: UsuarioJwt, id: number) {
    const v = await this.obtener(id); this.acceso(u, v);
    return { ...v, pago: v.pago ? await this.pagos.obtener(v.pago.id) : null };
  }

  // ---------------------------------------------------------------- CU-07 / CU-09: crear venta
  async crear(u: UsuarioJwt, dto: CrearVentaDto): Promise<{ venta: any; pago: any }> {
    if (dto.origenOfflineId) {
      const ya = await this.db.one('SELECT id FROM ventas WHERE origen_offline_id = $1', [dto.origenOfflineId]);
      if (ya) return this.respuesta(ya.id);   // idempotente: la venta offline ya se habia sincronizado
    }
    const pos = dto.canal === 'pos';
    if (pos && !esStaff(u)) throw new ForbiddenException('Solo el personal de la tienda puede registrar ventas presenciales');
    if (pos && !METODOS_POS.includes(dto.metodoPago)) throw new BadRequestException('Método de pago no válido en caja (efectivo, tarjeta, QR o transferencia)');
    if (!pos && !METODOS_DIGITAL.includes(dto.metodoPago)) throw new BadRequestException('Método de pago no válido para compras digitales');
    if (!pos && dto.metodoPago === 'paypal' && dto.pasarela && dto.pasarela !== 'paypal') throw new BadRequestException('PayPal solo funciona con la pasarela PayPal');
    if (!dto.reservaId && !dto.items?.length) throw new BadRequestException('La venta no tiene productos');

    // el POS vende siempre desde la caja abierta del cajero; las compras digitales, desde la sucursal elegida
    let caja: any = null;
    if (pos) {
      caja = await this.db.one("SELECT * FROM cajas WHERE cajero_id=$1 AND estado='abierta'", [u.id]);
      if (!caja) throw new BadRequestException('Debes abrir la caja antes de vender');
    }
    const tipoVenta = pos && dto.tipoVenta === 'mayor' ? 'mayor' : 'menor';
    const gateway = !pos && PASARELA_METODOS.includes(dto.metodoPago);

    const resultado = await this.db.tx(async (tx) => {
      let sucursalId: number, almacenId: number, reserva: any = null, items: { varianteId: number; cantidad: number }[];
      let clienteId: number | null;

      if (dto.reservaId) {
        await tx.one('SELECT id FROM reservas WHERE id=$1 FOR UPDATE', [dto.reservaId]);
        reserva = await tx.one('SELECT * FROM reservas WHERE id=$1', [dto.reservaId]);
        if (!reserva) throw new NotFoundException('Reserva no encontrada');
        if (!['PENDIENTE', 'EN_ATENCION'].includes(reserva.estado)) throw new ConflictException(`La reserva ya está ${reserva.estado}`);
        if (pos) { if (reserva.sucursal_id !== caja.sucursal_id) throw new ForbiddenException('La reserva es de otra sucursal'); }
        else if (reserva.cliente_id !== u.id) throw new ForbiddenException('Esta reserva no te pertenece');
        sucursalId = reserva.sucursal_id; almacenId = reserva.almacen_id; clienteId = reserva.cliente_id;
        const det = await tx.q('SELECT variante_id AS "varianteId", cantidad FROM detalle_reserva WHERE reserva_id=$1', [reserva.id]);
        if (dto.items?.length) {
          const mapa = new Map(det.map((d: any) => [d.varianteId, d.cantidad]));
          items = this.unificar(dto.items);
          for (const it of items) if ((mapa.get(it.varianteId) ?? 0) < it.cantidad) throw new BadRequestException('Estás comprando más unidades de las que reservaste');
        } else items = det;
      } else {
        items = this.unificar(dto.items!);
        if (pos) { sucursalId = caja.sucursal_id; almacenId = caja.almacen_id; }
        else {
          if (!dto.sucursalId) throw new BadRequestException('Elige la sucursal desde la que quieres comprar');
          sucursalId = dto.sucursalId;
          const a = await tx.one('SELECT a.id FROM almacenes a JOIN sucursales s ON s.id=a.sucursal_id WHERE a.sucursal_id=$1 AND a.es_tienda AND a.activo AND s.activa', [sucursalId]);
          if (!a) throw new NotFoundException('Sucursal no disponible');
          almacenId = a.id;
        }
        clienteId = pos ? (dto.clienteId ?? null) : u.id;
      }
      if (pos && clienteId) {
        const c = await tx.one("SELECT 1 FROM usuarios WHERE id=$1 AND rol='cliente' AND activo", [clienteId]);
        if (!c) throw new BadRequestException('El cliente indicado no existe');
      }

      // precios: SIEMPRE se calculan en el servidor (nunca se confia en un precio enviado por el cliente)
      const filas = await tx.q(
        `SELECT v.id, p.nombre, v.talla, v.color, p.precio_menor, p.precio_mayor, p.id AS producto_id,
                COALESCE((SELECT MAX(pr.porcentaje) FROM promociones pr WHERE pr.activa AND current_date BETWEEN pr.fecha_inicio AND pr.fecha_fin
                   AND (pr.producto_id = p.id OR pr.categoria_id = p.categoria_id OR pr.temporada_id = p.temporada_id
                        OR (pr.producto_id IS NULL AND pr.categoria_id IS NULL AND pr.temporada_id IS NULL))), 0) AS promo
           FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.id = ANY($1) AND v.activo AND p.activo`, [items.map((i) => i.varianteId)]);
      const porId = new Map(filas.map((f: any) => [f.id, f]));
      let subtotal = 0, total = 0;
      const lineas = items.map((it) => {
        const f: any = porId.get(it.varianteId);
        if (!f) throw new BadRequestException(`La variante ${it.varianteId} no existe o fue dada de baja`);
        const lista = tipoVenta === 'mayor' ? Number(f.precio_mayor ?? f.precio_menor) : Number(f.precio_menor);
        const unit = tipoVenta === 'mayor' ? lista : redondear(lista * (1 - Number(f.promo) / 100));
        subtotal += lista * it.cantidad; total += unit * it.cantidad;
        return { ...it, lista, unit, productoId: f.producto_id };
      });
      subtotal = redondear(subtotal); total = redondear(total);

      const estado = gateway ? 'pendiente_pago' : dto.metodoPago === 'contra_entrega' ? 'pendiente' : 'completada';
      const venta = await tx.one(
        `INSERT INTO ventas (cliente_id, sucursal_id, almacen_id, caja_id, reserva_id, canal, tipo, tipo_venta, metodo_pago, estado, subtotal, descuento, total, documento_cliente, notas, origen_offline_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, numero_comprobante`,
        [clienteId, sucursalId, almacenId, caja?.id ?? null, reserva?.id ?? null, dto.canal, pos ? 'presencial' : 'digital', tipoVenta, dto.metodoPago, estado,
         subtotal, redondear(subtotal - total), total, dto.documentoCliente ?? null, dto.notas ?? null, dto.origenOfflineId ?? null]);
      for (const l of lineas) await tx.q('INSERT INTO venta_items (venta_id, variante_id, cantidad, precio_lista, precio_unit) VALUES ($1,$2,$3,$4,$5)', [venta.id, l.varianteId, l.cantidad, l.lista, l.unit]);

      let pago: any;
      if (gateway) {
        // el stock se retiene (o ya esta retenido por la reserva) hasta que la pasarela confirme el pago
        if (!reserva) await this.stock.retener(tx, { ventaId: venta.id, almacenId, items, usuarioId: u.id });
        pago = await this.pagos.crear(tx, { ventaId: venta.id, metodo: dto.metodoPago, pasarela: this.pagos.resolverPasarela(dto.metodoPago, dto.pasarela), monto: total });
      } else {
        await this.stock.consumir(tx, { ventaId: venta.id, almacenId, reservaId: reserva?.id, retenido: false, items, usuarioId: u.id });
        const ref = `FS${venta.id}-${randomBytes(4).toString('hex').toUpperCase()}`;
        pago = await tx.one(
          `INSERT INTO pagos (venta_id, metodo, pasarela, estado, monto, referencia) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [venta.id, dto.metodoPago, pos ? 'caja' : 'contra_entrega', dto.metodoPago === 'contra_entrega' ? 'PENDIENTE' : 'APROBADO', total, ref]);
        if (clienteId) await this.notif.aUsuario(tx, clienteId, 'compra_registrada', `Compra ${venta.numero_comprobante}`, `Total Bs ${total.toFixed(2)}. ${dto.metodoPago === 'contra_entrega' ? 'Pagas al retirar tus prendas.' : '¡Gracias por tu compra!'}`, 'venta', venta.id);
        if (!pos) await this.notif.aPersonalSucursal(tx, sucursalId, 'venta_digital', `Nuevo pedido ${venta.numero_comprobante}`, 'Pedido contra entrega por preparar.', 'venta', venta.id);
      }
      if (clienteId) for (const l of lineas) await tx.q(`INSERT INTO interacciones (usuario_id, producto_id, tipo) VALUES ($1,$2,'compra')`, [clienteId, l.productoId]);
      await this.db.auditar(u.id, 'venta.crear', 'venta', venta.id, { canal: dto.canal, total }, tx);
      return { ventaId: venta.id, pagoId: pago.id };
    });

    if (gateway) await this.pagos.iniciarCheckout(resultado.pagoId);
    return this.respuesta(resultado.ventaId);
  }

  private unificar(items: { varianteId: number; cantidad: number }[]) {
    const m = new Map<number, number>();
    for (const i of items) m.set(i.varianteId, (m.get(i.varianteId) ?? 0) + i.cantidad);
    return [...m.entries()].map(([varianteId, cantidad]) => ({ varianteId, cantidad })).sort((a, b) => a.varianteId - b.varianteId);
  }

  private async respuesta(ventaId: number) {
    const venta = await this.obtener(ventaId);
    return { venta, pago: venta.pago ? await this.pagos.obtener(venta.pago.id) : null };
  }

  // CU-08: "si el pago es rechazado, el sistema informa el motivo y permite reintentar con otro metodo"
  async reintentarPago(u: UsuarioJwt, id: number, d: ReintentoDto) {
    const nuevo = await this.db.tx(async (tx) => {
      await tx.one('SELECT id FROM ventas WHERE id=$1 FOR UPDATE', [id]);
      const v = await this.obtener(id, tx);
      if (v.clienteId !== u.id) throw new ForbiddenException('Esta compra no te pertenece');
      if (v.estado !== 'pendiente_pago') throw new ConflictException('Esta compra ya no admite pagos (fue pagada o cancelada)');
      await tx.q("UPDATE pagos SET estado='EXPIRADO', motivo_rechazo = COALESCE(motivo_rechazo, 'Reemplazado por otro intento'), actualizado_en=now() WHERE venta_id=$1 AND estado='PENDIENTE'", [id]);
      await tx.q('UPDATE ventas SET metodo_pago=$2 WHERE id=$1', [id, d.metodoPago]);
      return this.pagos.crear(tx, { ventaId: id, metodo: d.metodoPago, pasarela: this.pagos.resolverPasarela(d.metodoPago, d.pasarela), monto: v.total });
    });
    await this.pagos.iniciarCheckout(nuevo.id);
    return this.respuesta(id);
  }

  // ---------------------------------------------------------------- listados
  async misVentas(u: UsuarioJwt) { return this.db.q(`${SELECT_VENTA} WHERE v.cliente_id = $1 ORDER BY v.creada_en DESC LIMIT 100`, [u.id]); }

  async listar(u: UsuarioJwt, f: Record<string, string>) {
    const params: any[] = []; const conds: string[] = ['true'];
    const P = (v: any) => { params.push(v); return `$${params.length}`; };
    const suc = sucursalPermitida(u, num(f.sucursalId));
    if (suc) conds.push(`v.sucursal_id = ${P(suc)}`);
    if (f.estado) conds.push(`v.estado = ${P(f.estado)}`);
    if (f.canal) conds.push(`v.canal = ${P(f.canal)}`);
    if (f.metodo) conds.push(`v.metodo_pago = ${P(f.metodo)}`);
    if (f.desde) conds.push(`v.creada_en >= ${P(f.desde)}::timestamptz`);
    if (f.hasta) conds.push(`v.creada_en < (${P(f.hasta)}::date + 1)`);
    if (u.rol === 'cajero' && !f.todas) conds.push(`(v.caja_id IN (SELECT id FROM cajas WHERE cajero_id = ${P(u.id)}) OR v.canal <> 'pos')`);
    if (f.q?.trim()) { const q = P(`%${f.q.trim()}%`); conds.push(`(v.numero_comprobante ILIKE ${q} OR u.nombre ILIKE ${q})`); }
    return this.db.q(`${SELECT_VENTA} WHERE ${conds.join(' AND ')} ORDER BY v.creada_en DESC LIMIT ${Math.min(num(f.limite, 200)!, 500)}`, params);
  }

  async comprobante(u: UsuarioJwt, id: number) {
    const v = await this.detalle(u, id);
    const suc = await this.db.one('SELECT nombre, ciudad, direccion, telefono FROM sucursales WHERE id=$1', [v.sucursalId]);
    return { empresa: { nombre: 'FashionStore', razonSocial: 'TechNet Solutions S.R.L.' }, sucursal: suc, venta: v };
  }

  // Contra entrega: al retirar y pagar, el personal marca la venta como entregada
  async marcarEntregada(u: UsuarioJwt, id: number) {
    await this.db.tx(async (tx) => {
      await tx.one('SELECT id FROM ventas WHERE id=$1 FOR UPDATE', [id]);
      const v = await this.obtener(id, tx); this.acceso(u, v);
      if (v.estado !== 'pendiente') throw new ConflictException('Solo se pueden entregar pedidos pendientes (contra entrega)');
      await tx.q("UPDATE ventas SET estado='entregada' WHERE id=$1", [id]);
      await tx.q("UPDATE pagos SET estado='APROBADO', actualizado_en=now() WHERE venta_id=$1 AND pasarela='contra_entrega'", [id]);
      if (v.clienteId) await this.notif.aUsuario(tx, v.clienteId, 'pedido_entregado', `Pedido ${v.comprobante} entregado`, '¡Gracias por tu compra!', 'venta', id);
    });
    return this.obtener(id);
  }

  // ---------------------------------------------------------------- devoluciones (CU-10: reintegran stock)
  async devolver(u: UsuarioJwt, id: number, d: DevolucionDto) {
    await this.db.tx(async (tx) => {
      await tx.one('SELECT id FROM ventas WHERE id=$1 FOR UPDATE', [id]);
      const v = await this.obtener(id, tx); this.acceso(u, v);
      if (!['completada', 'entregada', 'devuelta_parcial'].includes(v.estado)) throw new ConflictException(`No se puede devolver una venta en estado ${v.estado}`);
      const items = this.unificar(d.items);
      if (!items.length) throw new BadRequestException('Indica qué prendas se devuelven');
      let monto = 0;
      const dev = await tx.one('INSERT INTO devoluciones (venta_id, usuario_id, motivo, monto) VALUES ($1,$2,$3,0) RETURNING id', [id, u.id, d.motivo ?? null]);
      for (const it of items) {
        const linea = v.items.find((x: any) => x.varianteId === it.varianteId);
        if (!linea) throw new BadRequestException('Esa prenda no pertenece a la venta');
        if (it.cantidad > linea.cantidad - linea.devuelto) throw new BadRequestException(`Solo se pueden devolver ${linea.cantidad - linea.devuelto} unidad(es) de ${linea.producto}`);
        monto += linea.precioUnit * it.cantidad;
        await tx.q('INSERT INTO devolucion_items (devolucion_id, variante_id, cantidad, precio_unit) VALUES ($1,$2,$3,$4)', [dev.id, it.varianteId, it.cantidad, linea.precioUnit]);
        await this.stock.reintegrar(tx, { ventaId: id, almacenId: v.almacenId, varianteId: it.varianteId, cantidad: it.cantidad, usuarioId: u.id, nota: d.motivo });
      }
      await tx.q('UPDATE devoluciones SET monto=$2 WHERE id=$1', [dev.id, redondear(monto)]);
      const restante = v.items.reduce((s: number, x: any) => s + x.cantidad - x.devuelto, 0) - items.reduce((s, x) => s + x.cantidad, 0);
      await tx.q('UPDATE ventas SET estado=$2 WHERE id=$1', [id, restante === 0 ? 'devuelta' : 'devuelta_parcial']);
      if (restante === 0) await tx.q("UPDATE pagos SET estado='REEMBOLSADO', actualizado_en=now() WHERE venta_id=$1 AND estado='APROBADO'", [id]);
      if (v.clienteId) await this.notif.aUsuario(tx, v.clienteId, 'devolucion', `Devolución registrada: ${v.comprobante}`, `Monto a reembolsar: Bs ${redondear(monto).toFixed(2)}.`, 'venta', id);
      await this.db.auditar(u.id, 'venta.devolucion', 'venta', id, { monto: redondear(monto) }, tx);
    });
    return this.detalle(u, id);
  }

  // ---------------------------------------------------------------- sincronizacion offline (POS y app)
  async sincronizar(u: UsuarioJwt, ventas: CrearVentaDto[]) {
    const out: any[] = [];
    for (const dto of ventas.slice(0, 100)) {
      try { const r = await this.crear(u, dto); out.push({ origenOfflineId: dto.origenOfflineId, ok: true, venta: r.venta }); }
      catch (e: any) { out.push({ origenOfflineId: dto.origenOfflineId, ok: false, error: e?.response?.message ?? e.message ?? 'Error al sincronizar' }); }
    }
    return out;
  }
}

@Controller('ventas')
export class VentasController {
  constructor(private s: VentasService) {}
  @Auth() @Post() crear(@Body() d: CrearVentaDto, @Req() r: any) { return this.s.crear(r.user, d); }
  @Auth() @Post('sincronizar') sincronizar(@Body() d: CrearVentaDto[], @Req() r: any) {
    if (!Array.isArray(d)) throw new BadRequestException('Se esperaba una lista de ventas');
    return this.s.sincronizar(r.user, d);
  }
  @Auth() @Get('mias') mias(@Req() r: any) { return this.s.misVentas(r.user); }
  @Auth('admin', 'encargado', 'cajero') @Get() listar(@Query() f: Record<string, string>, @Req() r: any) { return this.s.listar(r.user, f); }
  @Auth() @Get(':id') detalle(@Param('id') id: string, @Req() r: any) { return this.s.detalle(r.user, idParam(id)); }
  @Auth() @Get(':id/comprobante') comprobante(@Param('id') id: string, @Req() r: any) { return this.s.comprobante(r.user, idParam(id)); }
  @Auth() @Post(':id/reintentar-pago') reintentar(@Param('id') id: string, @Body() d: ReintentoDto, @Req() r: any) { return this.s.reintentarPago(r.user, idParam(id), d); }
  @Auth('admin', 'encargado', 'cajero') @Post(':id/entregar') entregar(@Param('id') id: string, @Req() r: any) { return this.s.marcarEntregada(r.user, idParam(id)); }
  @Auth('admin', 'encargado', 'cajero') @Post(':id/devolucion') devolucion(@Param('id') id: string, @Body() d: DevolucionDto, @Req() r: any) { return this.s.devolver(r.user, idParam(id), d); }
}

@Module({ imports: [PagosModule], providers: [VentasService], controllers: [VentasController], exports: [VentasService] })
export class VentasModule {}
