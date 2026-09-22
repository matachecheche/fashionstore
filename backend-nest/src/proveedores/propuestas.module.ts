import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Db } from '../common/db';
import { InventarioCore } from '../common/inventario-core';
import { Notificador } from '../common/notificador';
import { Auth, UsuarioJwt } from '../common/auth';
import { idParam } from '../common/util';

class VarPropuesta {
  @IsString() @MaxLength(10) talla: string;
  @IsString() @MaxLength(40) color: string;
  @IsOptional() @IsString() colorHex?: string;
  @IsInt() @Min(0) @Max(100000) cantidad: number;
}
class CrearPropuestaDto {
  @IsString() @MaxLength(160) nombre: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsInt() temporadaId?: number;
  @IsOptional() @IsInt() coleccionId?: number;
  @IsOptional() @IsInt() categoriaId?: number;
  @IsIn(['superior', 'inferior', 'vestido', 'abrigo', 'calzado', 'accesorio']) arTipo: string;
  @IsNumber() @IsPositive() precioSugerido: number;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => VarPropuesta) variantes: VarPropuesta[];
}
class AprobarDto {
  @IsOptional() @IsInt() almacenId?: number;
  @IsOptional() @IsInt() categoriaId?: number;
  @IsOptional() @IsNumber() @IsPositive() precioMenor?: number;
}
class RechazarDto { @IsString() @MaxLength(300) motivo: string }

const ARCHIVO_TIPO: Record<string, string> = { vestido: 'vestido', superior: 'blusa', inferior: 'pantalon', abrigo: 'chaqueta', calzado: 'zapato', accesorio: 'cartera' };
const PALETA = ['negro', 'blanco', 'rojo', 'azul', 'rosado', 'beige', 'verde', 'camel', 'gris', 'celeste', 'mostaza', 'vino'];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

@Injectable()
export class PropuestasService {
  constructor(private db: Db, private inv: InventarioCore, private notif: Notificador) {}

  private readonly SEL = `SELECT pp.id, pp.proveedor_id AS "proveedorId", pr.nombre AS proveedor, pp.nombre, pp.descripcion, pp.ar_tipo AS "arTipo",
      pp.precio_sugerido AS "precioSugerido", pp.variantes, pp.imagen_url AS "imagenUrl", pp.estado, pp.motivo_rechazo AS "motivoRechazo",
      pp.producto_id AS "productoId", pp.creada_en AS "creadaEn", pp.resuelta_en AS "resueltaEn",
      pp.temporada_id AS "temporadaId", te.nombre AS temporada, pp.coleccion_id AS "coleccionId", co.nombre AS coleccion, pp.categoria_id AS "categoriaId", ca.nombre AS categoria
    FROM propuestas_producto pp JOIN proveedores pr ON pr.id = pp.proveedor_id LEFT JOIN temporadas te ON te.id = pp.temporada_id
    LEFT JOIN colecciones co ON co.id = pp.coleccion_id LEFT JOIN categorias ca ON ca.id = pp.categoria_id`;

  listar(u: UsuarioJwt, estado?: string) {
    return this.db.q(`${this.SEL} WHERE ($1::int IS NULL OR pp.proveedor_id = $1) AND ($2::text IS NULL OR pp.estado = $2) ORDER BY (pp.estado = 'PENDIENTE') DESC, pp.id DESC`,
      [u.rol === 'proveedor' ? u.proveedorId : null, estado || null]);
  }

  // Actor Proveedor: registra/envia informacion de productos y disponibilidad por temporada/coleccion
  async crear(u: UsuarioJwt, d: CrearPropuestaDto) {
    if (!u.proveedorId) throw new ForbiddenException('Tu usuario no está vinculado a un proveedor');
    const vars = d.variantes.map((v) => ({ talla: v.talla.trim(), color: v.color.trim(), colorHex: /^#[0-9a-fA-F]{6}$/.test(v.colorHex ?? '') ? v.colorHex : '#888888', cantidad: v.cantidad }));
    const r = await this.db.tx(async (tx) => {
      const p = await tx.one(
        `INSERT INTO propuestas_producto (proveedor_id, temporada_id, coleccion_id, categoria_id, nombre, descripcion, ar_tipo, precio_sugerido, variantes, imagen_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [u.proveedorId, d.temporadaId ?? null, d.coleccionId ?? null, d.categoriaId ?? null, d.nombre.trim(), d.descripcion ?? null, d.arTipo, d.precioSugerido, JSON.stringify(vars), d.imagenUrl ?? null]);
      await this.notif.aAdmins(tx, 'propuesta_nueva', 'Nueva propuesta de proveedor', `${d.nombre} (${vars.reduce((s, v) => s + v.cantidad, 0)} unidades disponibles)`, 'propuesta', p.id);
      return p.id;
    });
    return this.db.one(`${this.SEL} WHERE pp.id = $1`, [r]);
  }

  async aprobar(u: UsuarioJwt, id: number, d: AprobarDto) {
    return this.db.tx(async (tx) => {
      const p = await tx.one('SELECT * FROM propuestas_producto WHERE id=$1 FOR UPDATE', [id]);
      if (!p) throw new NotFoundException('Propuesta no encontrada');
      if (p.estado !== 'PENDIENTE') throw new ConflictException('La propuesta ya fue resuelta');
      const almacenId = d.almacenId ?? (await tx.one('SELECT id FROM almacenes WHERE activo ORDER BY es_tienda, id LIMIT 1')).id;   // por defecto una bodega
      const prod = await tx.one(
        `INSERT INTO productos (categoria_id, temporada_id, coleccion_id, proveedor_id, nombre, descripcion, ar_tipo, precio_menor, precio_mayor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, nombre`,
        [d.categoriaId ?? p.categoria_id, p.temporada_id, p.coleccion_id, p.proveedor_id, p.nombre, p.descripcion, p.ar_tipo, d.precioMenor ?? p.precio_sugerido, null]);
      const colores = [...new Set<string>(p.variantes.map((v: any) => v.color))];
      let orden = 0;
      for (const c of colores) {
        const key = PALETA.includes(norm(c)) ? norm(c) : 'negro';
        const base = `/assets/prendas/${ARCHIVO_TIPO[p.ar_tipo]}-${key}`;
        await tx.q('INSERT INTO producto_imagenes (producto_id, url, orden, es_overlay_ar, color) VALUES ($1,$2,$3,false,$4), ($1,$5,$6,true,$4)',
          [prod.id, orden === 0 && p.imagen_url ? p.imagen_url : `${base}-foto.jpg`, orden, c, `${base}-ar.png`, 100 + orden]);
        orden++;
      }
      for (const v of [...p.variantes].sort((a: any, b: any) => 0)) {
        const fila = await tx.one('INSERT INTO variantes (producto_id, talla, color, color_hex, sku) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [prod.id, v.talla, v.color, v.colorHex, `PRV${prod.id}-${norm(v.talla).toUpperCase()}-${norm(v.color).slice(0, 3).toUpperCase()}`]);
        if (v.cantidad > 0) await this.inv.mover(tx, { varianteId: fila.id, almacenId, dCantidad: v.cantidad, tipo: 'recepcion', refTipo: 'propuesta', refId: id, usuarioId: u.id, nota: `Recepción por propuesta #${id} del proveedor` });
      }
      await tx.q("UPDATE propuestas_producto SET estado='APROBADA', producto_id=$2, resuelta_en=now() WHERE id=$1", [id, prod.id]);
      await tx.q(`INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id)
                  SELECT id, 'propuesta_aprobada', 'Propuesta aprobada', $2, 'propuesta', $3 FROM usuarios WHERE proveedor_id = $1 AND activo`, [p.proveedor_id, `Tu propuesta "${p.nombre}" fue aprobada y ya está en el catálogo.`, id]);
      await this.db.auditar(u.id, 'propuesta.aprobar', 'propuesta', id, { productoId: prod.id }, tx);
      return { ok: true, productoId: prod.id };
    });
  }

  async rechazar(u: UsuarioJwt, id: number, d: RechazarDto) {
    await this.db.tx(async (tx) => {
      const p = await tx.one('SELECT * FROM propuestas_producto WHERE id=$1 FOR UPDATE', [id]);
      if (!p) throw new NotFoundException('Propuesta no encontrada');
      if (p.estado !== 'PENDIENTE') throw new ConflictException('La propuesta ya fue resuelta');
      await tx.q("UPDATE propuestas_producto SET estado='RECHAZADA', motivo_rechazo=$2, resuelta_en=now() WHERE id=$1", [id, d.motivo]);
      await tx.q(`INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id)
                  SELECT id, 'propuesta_rechazada', 'Propuesta rechazada', $2, 'propuesta', $3 FROM usuarios WHERE proveedor_id = $1 AND activo`, [p.proveedor_id, `"${p.nombre}": ${d.motivo}`, id]);
    });
    return { ok: true };
  }
}

@Controller('propuestas')
export class PropuestasController {
  constructor(private s: PropuestasService) {}
  @Auth('proveedor', 'admin') @Get() listar(@Req() r: any, @Query('estado') e?: string) { return this.s.listar(r.user, e); }
  @Auth('proveedor') @Post() crear(@Body() d: CrearPropuestaDto, @Req() r: any) { return this.s.crear(r.user, d); }
  @Auth('admin') @Post(':id/aprobar') aprobar(@Param('id') id: string, @Body() d: AprobarDto, @Req() r: any) { return this.s.aprobar(r.user, idParam(id), d); }
  @Auth('admin') @Post(':id/rechazar') rechazar(@Param('id') id: string, @Body() d: RechazarDto, @Req() r: any) { return this.s.rechazar(r.user, idParam(id), d); }
}

@Module({ providers: [PropuestasService], controllers: [PropuestasController] })
export class PropuestasModule {}
