import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException,
  OnModuleInit, Param, Post, Query, Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Db, Tx } from '../common/db';
import { InventarioCore } from '../common/inventario-core';
import { Notificador } from '../common/notificador';
import { Auth, puedeVerSucursal, sucursalPermitida, UsuarioJwt } from '../common/auth';
import { distanciaKm, envNum, idParam, num, SQL_PROMO } from '../common/util';

class ItemReserva { @IsInt() varianteId: number; @IsInt() @IsPositive() cantidad: number }
export class CrearReservaDto {
  @IsInt() sucursalId: number;
  @IsDateString() fechaHoraEstimada: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ItemReserva) items: ItemReserva[];
  @IsOptional() @IsString() @MaxLength(300) notas?: string;
  @IsOptional() @IsString() origenOfflineId?: string;
}
class MotivoDto { @IsOptional() @IsString() @MaxLength(300) motivo?: string }

const SELECT_RESERVA = `
  SELECT r.id, r.codigo, r.estado, r.fecha_hora_estimada AS "fechaHoraEstimada", r.preparada_en AS "preparadaEn", r.vence_en AS "venceEn", r.notas,
         r.motivo_cancelacion AS "motivoCancelacion", r.creada_en AS "creadaEn", r.venta_id AS "ventaId",
         r.cliente_id AS "clienteId", u.nombre AS cliente, u.telefono AS "clienteTelefono",
         r.sucursal_id AS "sucursalId", su.nombre AS sucursal, su.ciudad, su.direccion AS "sucursalDireccion", r.almacen_id AS "almacenId",
         COALESCE((SELECT json_agg(json_build_object('varianteId', d.variante_id, 'cantidad', d.cantidad, 'productoId', p.id, 'producto', p.nombre,
                     'talla', v.talla, 'color', v.color, 'colorHex', v.color_hex,
                     'precio', ROUND(p.precio_menor * (1 - ${SQL_PROMO} / 100.0), 2)::float,
                     'imagen', (SELECT i.url FROM producto_imagenes i WHERE i.producto_id = p.id AND NOT i.es_overlay_ar AND (i.color IS NULL OR lower(i.color) = lower(v.color)) ORDER BY (lower(i.color) = lower(v.color)) DESC NULLS LAST, i.orden LIMIT 1)) ORDER BY d.id)
                     FROM detalle_reserva d JOIN variantes v ON v.id = d.variante_id JOIN productos p ON p.id = v.producto_id WHERE d.reserva_id = r.id), '[]'::json) AS items
    FROM reservas r JOIN usuarios u ON u.id = r.cliente_id JOIN sucursales su ON su.id = r.sucursal_id`;

@Injectable()
export class ReservasService implements OnModuleInit {
  private log = new Logger('Reservas');
  constructor(private db: Db, private inv: InventarioCore, private notif: Notificador) {}

  onModuleInit() {
    // Libera automaticamente las reservas vencidas cada 5 minutos (y una vez al arrancar)
    const tick = () => this.liberarVencidas().then((n) => n && this.log.log(`${n} reserva(s) vencida(s) liberada(s)`)).catch((e) => this.log.error(e.message));
    setTimeout(tick, 15000).unref();
    setInterval(tick, 5 * 60 * 1000).unref();
  }

  private conTotal(r: any) {
    return r && { ...r, total: Math.round(r.items.reduce((s: number, i: any) => s + i.precio * i.cantidad, 0) * 100) / 100 };
  }

  async obtener(id: number, tx: Tx | Db = this.db) {
    const r = await tx.one(`${SELECT_RESERVA} WHERE r.id = $1`, [id]);
    if (!r) throw new NotFoundException('Reserva no encontrada');
    return this.conTotal(r);
  }

  private acceso(u: UsuarioJwt, r: any) {
    if (u.rol === 'cliente') { if (r.clienteId !== u.id) throw new ForbiddenException('Esta reserva no te pertenece'); return; }
    if (!puedeVerSucursal(u, r.sucursalId)) throw new ForbiddenException('Esta reserva pertenece a otra sucursal');
  }

  // ---------------------------------------------------------------- CU-04 Reservar prendas
  async crear(u: UsuarioJwt, dto: CrearReservaDto) {
    const fecha = new Date(dto.fechaHoraEstimada);
    const ahora = Date.now();
    if (isNaN(fecha.getTime()) || fecha.getTime() < ahora - 10 * 60 * 1000) throw new BadRequestException('La fecha y hora de atención no puede estar en el pasado');
    if (fecha.getTime() > ahora + envNum('RESERVA_MAX_DIAS', 7) * 86400000) throw new BadRequestException(`Solo puedes reservar con hasta ${envNum('RESERVA_MAX_DIAS', 7)} días de anticipación`);

    // unifica variantes repetidas
    const mapa = new Map<number, number>();
    for (const it of dto.items) mapa.set(it.varianteId, (mapa.get(it.varianteId) ?? 0) + it.cantidad);
    const items = [...mapa.entries()].map(([varianteId, cantidad]) => ({ varianteId, cantidad })).sort((a, b) => a.varianteId - b.varianteId);

    if (dto.origenOfflineId) {  // idempotencia para reservas creadas sin conexion en la app movil
      const ya = await this.db.one("SELECT id FROM reservas WHERE cliente_id=$1 AND notas LIKE $2", [u.id, `%[off:${dto.origenOfflineId}]%`]);
      if (ya) return this.obtener(ya.id);
    }

    const suc = await this.db.one('SELECT id, nombre, latitud, longitud FROM sucursales WHERE id=$1 AND activa', [dto.sucursalId]);
    if (!suc) throw new NotFoundException('Sucursal no encontrada');

    let faltantes: any[] = [];
    let creada: number | null = null;
    try {
      creada = await this.db.tx(async (tx) => {
        const almacenId = await this.inv.almacenTienda(tx, dto.sucursalId);
        for (const it of items) {
          const v = await tx.one('SELECT p.nombre, v.talla, v.color FROM variantes v JOIN productos p ON p.id=v.producto_id WHERE v.id=$1 AND v.activo AND p.activo', [it.varianteId]);
          if (!v) throw new BadRequestException(`La variante ${it.varianteId} no existe o fue dada de baja`);
          const s = await tx.one('SELECT cantidad - reservado AS disp FROM stock WHERE variante_id=$1 AND almacen_id=$2 FOR UPDATE', [it.varianteId, almacenId]);
          const disp = Math.max(s?.disp ?? 0, 0);
          if (disp < it.cantidad) faltantes.push({ varianteId: it.varianteId, producto: v.nombre, talla: v.talla, color: v.color, solicitado: it.cantidad, disponible: disp });
        }
        if (faltantes.length) throw new ConflictException('SIN_STOCK');

        const vence = new Date(fecha.getTime() + envNum('RESERVA_GRACIA_HORAS', 2) * 3600000);
        const marca = dto.origenOfflineId ? ` [off:${dto.origenOfflineId}]` : '';
        const r = await tx.one(
          `INSERT INTO reservas (cliente_id, sucursal_id, almacen_id, fecha_hora_estimada, vence_en, notas) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, codigo`,
          [u.id, dto.sucursalId, almacenId, fecha, vence, ((dto.notas ?? '') + marca).trim() || null],
        );
        for (const it of items) {
          await tx.q('INSERT INTO detalle_reserva (reserva_id, variante_id, cantidad) VALUES ($1,$2,$3)', [r.id, it.varianteId, it.cantidad]);
          await this.inv.mover(tx, { varianteId: it.varianteId, almacenId, dReservado: it.cantidad, tipo: 'reserva', refTipo: 'reserva', refId: r.id, usuarioId: u.id, nota: `Reserva ${r.codigo}` });
          await tx.q(`INSERT INTO interacciones (usuario_id, producto_id, tipo) SELECT $1, producto_id, 'reserva' FROM variantes WHERE id = $2`, [u.id, it.varianteId]);
        }
        const cli = await tx.one('SELECT nombre FROM usuarios WHERE id=$1', [u.id]);
        await this.notif.aPersonalSucursal(tx, dto.sucursalId, 'reserva_nueva', 'Nueva reserva ' + r.codigo,
          `${cli.nombre} reservó ${items.reduce((s, i) => s + i.cantidad, 0)} prenda(s) para ${fecha.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}.`, 'reserva', r.id);
        await this.notif.aUsuario(tx, u.id, 'reserva_confirmada', 'Reserva confirmada ' + r.codigo,
          `Tu reserva en ${suc.nombre} quedó registrada. Muestra el código ${r.codigo} al llegar.`, 'reserva', r.id);
        return r.id as number;
      });
    } catch (e: any) {
      if (e instanceof ConflictException && faltantes.length) throw await this.respuestaSinStock(suc, items, faltantes);
      throw e;
    }
    return this.obtener(creada!);
  }

  /** Flujo alternativo de CU-04: sugiere sucursales cercanas con stock y la fecha estimada de reposicion. */
  private async respuestaSinStock(suc: any, items: { varianteId: number; cantidad: number }[], faltantes: any[]) {
    const alt = await this.db.q(
      `SELECT su.id AS "sucursalId", su.nombre AS sucursal, su.ciudad, su.direccion, su.horario, su.latitud, su.longitud
         FROM sucursales su JOIN almacenes a ON a.sucursal_id = su.id AND a.es_tienda AND a.activo
        WHERE su.activa AND su.id <> $1 AND NOT EXISTS (
          SELECT 1 FROM unnest($2::int[], $3::int[]) AS it(vid, qty)
           WHERE COALESCE((SELECT s.cantidad - s.reservado FROM stock s WHERE s.variante_id = it.vid AND s.almacen_id = a.id), 0) < it.qty)`,
      [suc.id, items.map((i) => i.varianteId), items.map((i) => i.cantidad)],
    );
    const alternativas = alt
      .map((a: any) => ({ ...a, distanciaKm: distanciaKm(suc.latitud, suc.longitud, a.latitud, a.longitud) }))
      .sort((a: any, b: any) => (a.distanciaKm ?? 1e9) - (b.distanciaKm ?? 1e9));
    const rep = await this.db.one(
      `SELECT MIN(reposicion_estimada) AS f FROM stock s JOIN almacenes a ON a.id = s.almacen_id AND a.es_tienda
        WHERE a.sucursal_id = $1 AND s.variante_id = ANY($2) AND s.reposicion_estimada >= current_date`,
      [suc.id, faltantes.map((f) => f.varianteId)],
    );
    return new ConflictException({
      code: 'SIN_STOCK_SUCURSAL',
      message: alternativas.length
        ? `Algunas prendas no están disponibles en ${suc.nombre}. Estas sucursales sí tienen todo tu pedido.`
        : `Algunas prendas no están disponibles en ${suc.nombre} y ninguna otra sucursal tiene todo el pedido.`,
      faltantes, alternativas, reposicionEstimada: rep?.f ?? null,
    });
  }

  // ---------------------------------------------------------------- consultas
  async mias(u: UsuarioJwt) {
    const r = await this.db.q(`${SELECT_RESERVA} WHERE r.cliente_id = $1 ORDER BY r.creada_en DESC LIMIT 100`, [u.id]);
    return r.map((x: any) => this.conTotal(x));
  }

  async listar(u: UsuarioJwt, f: Record<string, string>) {
    const params: any[] = []; const conds: string[] = ['true'];
    const P = (v: any) => { params.push(v); return `$${params.length}`; };
    const suc = sucursalPermitida(u, num(f.sucursalId));
    if (suc) conds.push(`r.sucursal_id = ${P(suc)}`);
    if (f.estado) conds.push(`r.estado = ${P(f.estado)}`);
    if (f.desde) conds.push(`r.fecha_hora_estimada >= ${P(f.desde)}::timestamptz`);
    if (f.hasta) conds.push(`r.fecha_hora_estimada < (${P(f.hasta)}::date + 1)`);
    if (f.vencidas === '1') conds.push(`r.estado = 'PENDIENTE' AND r.vence_en < now()`);
    if (f.q?.trim()) { const q = P(`%${f.q.trim()}%`); conds.push(`(r.codigo ILIKE ${q} OR u.nombre ILIKE ${q} OR u.email ILIKE ${q})`); }
    const filas = await this.db.q(`${SELECT_RESERVA} WHERE ${conds.join(' AND ')} ORDER BY (r.estado IN ('PENDIENTE','EN_ATENCION')) DESC, r.fecha_hora_estimada ASC LIMIT 300`, params);
    return filas.map((x: any) => this.conTotal(x));
  }

  async deCodigo(u: UsuarioJwt, codigo: string) {
    const r = await this.db.one(`${SELECT_RESERVA} WHERE upper(r.codigo) = upper($1)`, [codigo.trim()]);
    if (!r) throw new NotFoundException('No existe una reserva con ese código');
    this.acceso(u, r);
    return this.conTotal(r);
  }

  async detalle(u: UsuarioJwt, id: number) { const r = await this.obtener(id); this.acceso(u, r); return r; }

  // ---------------------------------------------------------------- transiciones
  private async liberarStock(tx: Tx, r: any, usuarioId: number | null, nota: string) {
    const items = await tx.q('SELECT variante_id, cantidad FROM detalle_reserva WHERE reserva_id=$1 ORDER BY variante_id', [r.id]);
    for (const it of items) {
      await this.inv.mover(tx, { varianteId: it.variante_id, almacenId: r.almacenId, dReservado: -it.cantidad, tipo: 'liberacion_reserva', refTipo: 'reserva', refId: r.id, usuarioId, nota });
    }
  }

  private async cancelarTx(tx: Tx, r: any, motivo: string, usuarioId: number | null, notificar = true) {
    await this.liberarStock(tx, r, usuarioId, `Reserva ${r.codigo} cancelada`);
    await tx.q(`UPDATE reservas SET estado='CANCELADA', motivo_cancelacion=$2, actualizada_en=now() WHERE id=$1`, [r.id, motivo]);
    if (notificar) await this.notif.aUsuario(tx, r.clienteId, 'reserva_cancelada', `Reserva ${r.codigo} cancelada`, motivo, 'reserva', r.id);
  }

  async cancelar(u: UsuarioJwt, id: number, motivo?: string) {
    await this.db.tx(async (tx) => {
      const r = await this.bloquear(tx, id);
      this.acceso(u, r);
      const permitido = u.rol === 'cliente' ? r.estado === 'PENDIENTE' : ['PENDIENTE', 'EN_ATENCION'].includes(r.estado);
      if (!permitido) throw new ConflictException(`No se puede cancelar una reserva en estado ${r.estado}`);
      await this.cancelarTx(tx, r, motivo?.trim() || (u.rol === 'cliente' ? 'Cancelada por el cliente' : 'Cancelada por la sucursal'), u.id, u.rol !== 'cliente');
      if (u.rol === 'cliente') await this.notif.aPersonalSucursal(tx, r.sucursalId, 'reserva_cancelada', `Reserva ${r.codigo} cancelada`, 'El cliente canceló su reserva.', 'reserva', r.id);
    });
    return this.obtener(id);
  }

  // CU-05: el encargado prepara las prendas
  async preparar(u: UsuarioJwt, id: number) {
    await this.db.tx(async (tx) => {
      const r = await this.bloquear(tx, id); this.acceso(u, r);
      if (r.estado !== 'PENDIENTE') throw new ConflictException('Solo se pueden preparar reservas PENDIENTES');
      await tx.q('UPDATE reservas SET preparada_en = COALESCE(preparada_en, now()), actualizada_en = now() WHERE id=$1', [id]);
      await this.notif.aUsuario(tx, r.clienteId, 'reserva_preparada', `Tu reserva ${r.codigo} está lista`, `Las prendas ya están preparadas en ${r.sucursal}. Te esperamos.`, 'reserva', id);
    });
    return this.obtener(id);
  }

  // CU-05: el cliente llego a la tienda
  async confirmarAtencion(u: UsuarioJwt, id: number) {
    await this.db.tx(async (tx) => {
      const r = await this.bloquear(tx, id); this.acceso(u, r);
      if (r.estado !== 'PENDIENTE') throw new ConflictException('Solo se puede confirmar la atención de reservas PENDIENTES');
      await tx.q(`UPDATE reservas SET estado='EN_ATENCION', atendida_por=$2, preparada_en = COALESCE(preparada_en, now()), actualizada_en=now() WHERE id=$1`, [id, u.id]);
      await this.notif.aUsuario(tx, r.clienteId, 'reserva_en_atencion', `Reserva ${r.codigo} en atención`, 'Ya estás siendo atendido en la sucursal.', 'reserva', id);
    });
    return this.obtener(id);
  }

  /** El cliente se probo las prendas y no compro: se cierra la reserva y se libera el stock. */
  async finalizarSinCompra(u: UsuarioJwt, id: number) {
    await this.db.tx(async (tx) => {
      const r = await this.bloquear(tx, id); this.acceso(u, r);
      if (r.estado !== 'EN_ATENCION') throw new ConflictException('Solo se puede finalizar una reserva EN_ATENCION');
      await this.liberarStock(tx, r, u.id, `Reserva ${r.codigo} finalizada sin compra`);
      await tx.q(`UPDATE reservas SET estado='COMPLETADA', actualizada_en=now() WHERE id=$1`, [id]);
      await this.notif.aUsuario(tx, r.clienteId, 'reserva_completada', `Reserva ${r.codigo} finalizada`, '¡Gracias por visitarnos!', 'reserva', id);
    });
    return this.obtener(id);
  }

  private async bloquear(tx: Tx, id: number) {
    await tx.one('SELECT id FROM reservas WHERE id=$1 FOR UPDATE', [id]);
    return this.obtener(id, tx);
  }

  /** Reservas PENDIENTES cuya hora limite paso: se cancelan y se libera el stock retenido. */
  async liberarVencidas(): Promise<number> {
    const ids = await this.db.q(`SELECT id FROM reservas WHERE estado = 'PENDIENTE' AND vence_en < now()`);
    let n = 0;
    for (const { id } of ids) {
      await this.db.tx(async (tx) => {
        const bloqueada = await tx.one(`SELECT id FROM reservas WHERE id=$1 AND estado='PENDIENTE' AND vence_en < now() FOR UPDATE SKIP LOCKED`, [id]);
        if (!bloqueada) return;
        const r = await this.obtener(id, tx);
        await this.cancelarTx(tx, r, 'Reserva vencida: el cliente no se presentó a tiempo', null);
        n++;
      });
    }
    return n;
  }
}

@Controller('reservas')
export class ReservasController {
  constructor(private s: ReservasService) {}
  @Auth('cliente', 'admin', 'encargado', 'cajero') @Post() crear(@Body() d: CrearReservaDto, @Req() r: any) { return this.s.crear(r.user, d); }
  @Auth() @Get('mias') mias(@Req() r: any) { return this.s.mias(r.user); }
  @Auth('admin', 'encargado', 'cajero') @Get() listar(@Query() f: Record<string, string>, @Req() r: any) { return this.s.listar(r.user, f); }
  @Auth('admin', 'encargado', 'cajero') @Get('codigo/:codigo') porCodigo(@Param('codigo') c: string, @Req() r: any) { return this.s.deCodigo(r.user, c); }
  @Auth('admin', 'encargado') @Post('liberar-vencidas') async vencidas() { return { liberadas: await this.s.liberarVencidas() }; }
  @Auth() @Get(':id') detalle(@Param('id') id: string, @Req() r: any) { return this.s.detalle(r.user, idParam(id)); }
  @Auth() @Post(':id/cancelar') cancelar(@Param('id') id: string, @Body() d: MotivoDto, @Req() r: any) { return this.s.cancelar(r.user, idParam(id), d?.motivo); }
  @Auth('admin', 'encargado', 'cajero') @Post(':id/preparar') preparar(@Param('id') id: string, @Req() r: any) { return this.s.preparar(r.user, idParam(id)); }
  @Auth('admin', 'encargado', 'cajero') @Post(':id/confirmar-atencion') atender(@Param('id') id: string, @Req() r: any) { return this.s.confirmarAtencion(r.user, idParam(id)); }
  @Auth('admin', 'encargado', 'cajero') @Post(':id/finalizar') finalizar(@Param('id') id: string, @Req() r: any) { return this.s.finalizarSinCompra(r.user, idParam(id)); }
}

@Module({ providers: [ReservasService], controllers: [ReservasController], exports: [ReservasService] })
export class ReservasModule {}
