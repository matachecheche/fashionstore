import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Patch, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { Db } from '../common/db';
import { InventarioCore } from '../common/inventario-core';
import { Auth, puedeVerSucursal, sucursalPermitida, UsuarioJwt } from '../common/auth';
import { num } from '../common/util';

class MovimientoDto {
  @IsIn(['recepcion', 'devolucion', 'ajuste', 'merma']) tipo: string;
  @IsInt() varianteId: number;
  @IsInt() almacenId: number;
  @IsInt() cantidad: number;              // para "ajuste" puede ser negativa
  @IsOptional() @IsString() nota?: string;
}
class ItemRecepcion { @IsInt() varianteId: number; @IsInt() @IsPositive() cantidad: number }
class RecepcionDto {
  @IsOptional() @IsInt() proveedorId?: number;
  @IsInt() almacenId: number;
  @IsOptional() @IsString() nota?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ItemRecepcion) items: ItemRecepcion[];
}
class TransferenciaDto {
  @IsInt() varianteId: number;
  @IsInt() origenAlmacenId: number;
  @IsInt() destinoAlmacenId: number;
  @IsInt() @IsPositive() cantidad: number;
  @IsOptional() @IsString() nota?: string;
}
class StockConfigDto {
  @IsInt() varianteId: number;
  @IsInt() almacenId: number;
  @IsOptional() @IsInt() @Min(0) stockMinimo?: number;
  @IsOptional() @IsDateString() reposicionEstimada?: string | null;
}

const BASE = `SELECT s.variante_id AS "varianteId", s.almacen_id AS "almacenId", p.id AS "productoId", p.nombre AS producto, v.talla, v.color, v.sku,
       a.nombre AS almacen, a.es_tienda AS "esTienda", su.id AS "sucursalId", su.nombre AS sucursal,
       s.cantidad, s.reservado, GREATEST(s.cantidad - s.reservado, 0) AS disponible, s.stock_minimo AS "stockMinimo",
       s.reposicion_estimada AS "reposicionEstimada",
       CASE WHEN s.cantidad - s.reservado <= 0 THEN 'agotado' WHEN s.cantidad - s.reservado <= s.stock_minimo THEN 'critico' ELSE 'ok' END AS estado
  FROM stock s JOIN variantes v ON v.id = s.variante_id JOIN productos p ON p.id = v.producto_id
  JOIN almacenes a ON a.id = s.almacen_id JOIN sucursales su ON su.id = a.sucursal_id`;

@Injectable()
export class InventarioService {
  constructor(private db: Db, private inv: InventarioCore) {}

  private async sucursalDeAlmacen(almacenId: number): Promise<number> {
    const a = await this.db.one('SELECT sucursal_id FROM almacenes WHERE id=$1 AND activo', [almacenId]);
    if (!a) throw new NotFoundException('Almacén no encontrado');
    return a.sucursal_id;
  }
  private async validarAcceso(u: UsuarioJwt, almacenId: number) {
    if (!puedeVerSucursal(u, await this.sucursalDeAlmacen(almacenId))) throw new ForbiddenException('Ese almacén pertenece a otra sucursal');
  }

  listar(u: UsuarioJwt, f: Record<string, string>) {
    const params: any[] = []; const conds: string[] = ['p.activo', 'v.activo'];
    const P = (v: any) => { params.push(v); return `$${params.length}`; };
    const suc = sucursalPermitida(u, num(f.sucursalId));
    if (suc) conds.push(`su.id = ${P(suc)}`);
    if (num(f.almacenId)) conds.push(`s.almacen_id = ${P(num(f.almacenId))}`);
    if (num(f.productoId)) conds.push(`p.id = ${P(num(f.productoId))}`);
    if (f.q?.trim()) { const q = P(`%${f.q.trim()}%`); conds.push(`(p.nombre ILIKE ${q} OR v.sku ILIKE ${q} OR v.color ILIKE ${q})`); }
    const filtroEstado = f.estado && ['ok', 'critico', 'agotado'].includes(f.estado) ? f.estado : null;
    return this.db.q(`SELECT * FROM (${BASE} WHERE ${conds.join(' AND ')}) x ${filtroEstado ? `WHERE estado = '${filtroEstado}'` : ''}
                      ORDER BY "sucursalId", producto, "varianteId" LIMIT 600`, params);
  }

  alertas(u: UsuarioJwt, sucursalId?: number) {
    const suc = sucursalPermitida(u, sucursalId);
    return this.db.q(
      `SELECT producto_id AS "productoId", producto, variante_id AS "varianteId", talla, color, sku, sucursal_id AS "sucursalId", sucursal,
              almacen_id AS "almacenId", almacen, cantidad, reservado, disponible, stock_minimo AS "stockMinimo", estado
         FROM inventario_critico WHERE ($1::int IS NULL OR sucursal_id = $1) ORDER BY estado DESC, disponible, sucursal`, [suc]);
  }

  movimientos(u: UsuarioJwt, f: Record<string, string>) {
    const params: any[] = []; const conds: string[] = ['true'];
    const P = (v: any) => { params.push(v); return `$${params.length}`; };
    const suc = sucursalPermitida(u, num(f.sucursalId));
    if (suc) conds.push(`a.sucursal_id = ${P(suc)}`);
    if (num(f.varianteId)) conds.push(`m.variante_id = ${P(num(f.varianteId))}`);
    if (num(f.almacenId)) conds.push(`m.almacen_id = ${P(num(f.almacenId))}`);
    if (f.tipo) conds.push(`m.tipo = ${P(f.tipo)}`);
    if (f.desde) conds.push(`m.creado_en >= ${P(f.desde)}::timestamptz`);
    if (f.hasta) conds.push(`m.creado_en < (${P(f.hasta)}::date + 1)`);
    return this.db.q(
      `SELECT m.id, m.creado_en AS fecha, m.tipo, m.delta_cantidad AS "deltaCantidad", m.delta_reservado AS "deltaReservado",
              m.saldo_cantidad AS "saldoCantidad", m.saldo_reservado AS "saldoReservado", m.referencia_tipo AS "referenciaTipo", m.referencia_id AS "referenciaId",
              m.nota, p.nombre AS producto, v.talla, v.color, a.nombre AS almacen, su.nombre AS sucursal, u.nombre AS usuario
         FROM movimientos_inventario m JOIN variantes v ON v.id = m.variante_id JOIN productos p ON p.id = v.producto_id
         JOIN almacenes a ON a.id = m.almacen_id JOIN sucursales su ON su.id = a.sucursal_id LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE ${conds.join(' AND ')} ORDER BY m.id DESC LIMIT ${Math.min(num(f.limite, 200)!, 1000)}`, params);
  }

  // CU-10: movimientos manuales (recepcion, devolucion, ajuste, merma)
  async movimiento(u: UsuarioJwt, d: MovimientoDto) {
    await this.validarAcceso(u, d.almacenId);
    if (d.cantidad === 0) throw new BadRequestException('La cantidad no puede ser cero');
    if (d.tipo !== 'ajuste' && d.cantidad < 0) throw new BadRequestException('La cantidad debe ser positiva (para restar usa "ajuste" con cantidad negativa o "merma")');
    const delta = d.tipo === 'merma' ? -Math.abs(d.cantidad) : d.cantidad;
    return this.db.tx((tx) => this.inv.mover(tx, {
      varianteId: d.varianteId, almacenId: d.almacenId, dCantidad: delta, tipo: d.tipo as any, refTipo: 'manual', usuarioId: u.id, nota: d.nota,
    }));
  }

  async recepcion(u: UsuarioJwt, d: RecepcionDto) {
    await this.validarAcceso(u, d.almacenId);
    return this.db.tx(async (tx) => {
      const r = await tx.one('INSERT INTO recepciones (proveedor_id, almacen_id, usuario_id, nota) VALUES ($1,$2,$3,$4) RETURNING id', [d.proveedorId ?? null, d.almacenId, u.id, d.nota ?? null]);
      for (const it of [...d.items].sort((a, b) => a.varianteId - b.varianteId)) {
        await tx.q('INSERT INTO recepcion_items (recepcion_id, variante_id, cantidad) VALUES ($1,$2,$3)', [r.id, it.varianteId, it.cantidad]);
        await this.inv.mover(tx, { varianteId: it.varianteId, almacenId: d.almacenId, dCantidad: it.cantidad, tipo: 'recepcion', refTipo: 'recepcion', refId: r.id, usuarioId: u.id, nota: d.nota });
      }
      await this.db.auditar(u.id, 'inventario.recepcion', 'recepcion', r.id, { items: d.items.length }, tx);
      return { id: r.id, items: d.items.length };
    });
  }

  async transferencia(u: UsuarioJwt, d: TransferenciaDto) {
    if (d.origenAlmacenId === d.destinoAlmacenId) throw new BadRequestException('El origen y el destino deben ser distintos');
    await this.validarAcceso(u, d.origenAlmacenId);
    await this.sucursalDeAlmacen(d.destinoAlmacenId);
    return this.db.tx(async (tx) => {
      const nota = d.nota ?? 'Transferencia entre almacenes';
      await this.inv.mover(tx, { varianteId: d.varianteId, almacenId: d.origenAlmacenId, dCantidad: -d.cantidad, tipo: 'transferencia_salida', refTipo: 'transferencia', usuarioId: u.id, nota });
      await this.inv.mover(tx, { varianteId: d.varianteId, almacenId: d.destinoAlmacenId, dCantidad: d.cantidad, tipo: 'transferencia_entrada', refTipo: 'transferencia', usuarioId: u.id, nota });
      return { ok: true };
    });
  }

  async configurar(u: UsuarioJwt, d: StockConfigDto) {
    await this.validarAcceso(u, d.almacenId);
    const r = await this.db.q(
      `UPDATE stock SET stock_minimo = COALESCE($3, stock_minimo), reposicion_estimada = CASE WHEN $4::boolean THEN $5::date ELSE reposicion_estimada END
        WHERE variante_id=$1 AND almacen_id=$2 RETURNING variante_id`,
      [d.varianteId, d.almacenId, d.stockMinimo ?? null, d.reposicionEstimada !== undefined, d.reposicionEstimada ?? null]);
    if (!r.length) throw new NotFoundException('No hay stock registrado para esa variante en ese almacén');
    return { ok: true };
  }
}

@Controller('inventario')
export class InventarioController {
  constructor(private s: InventarioService) {}
  @Auth('admin', 'encargado', 'cajero') @Get() listar(@Query() f: Record<string, string>, @Req() r: any) { return this.s.listar(r.user, f); }
  @Auth('admin', 'encargado', 'cajero') @Get('alertas') alertas(@Query('sucursalId') s: string, @Req() r: any) { return this.s.alertas(r.user, num(s)); }
  @Auth('admin', 'encargado') @Get('movimientos') movimientos(@Query() f: Record<string, string>, @Req() r: any) { return this.s.movimientos(r.user, f); }
  @Auth('admin', 'encargado') @Post('movimientos') mov(@Body() d: MovimientoDto, @Req() r: any) { return this.s.movimiento(r.user, d); }
  @Auth('admin', 'encargado') @Post('recepciones') rec(@Body() d: RecepcionDto, @Req() r: any) { return this.s.recepcion(r.user, d); }
  @Auth('admin', 'encargado') @Post('transferencias') tr(@Body() d: TransferenciaDto, @Req() r: any) { return this.s.transferencia(r.user, d); }
  @Auth('admin', 'encargado') @Patch('stock') cfg(@Body() d: StockConfigDto, @Req() r: any) { return this.s.configurar(r.user, d); }
}

@Module({ providers: [InventarioService], controllers: [InventarioController] })
export class InventarioModule {}
