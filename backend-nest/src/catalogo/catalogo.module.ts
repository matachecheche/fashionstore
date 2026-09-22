import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve } from 'path';
import { randomBytes } from 'crypto';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Db, Tx } from '../common/db';
import { InventarioCore } from '../common/inventario-core';
import { Auth, AuthOpcional } from '../common/auth';
import { idParam, num, SQL_PROMO } from '../common/util';

const AR_TIPOS = ['superior', 'inferior', 'vestido', 'abrigo', 'calzado', 'accesorio'];

class StockIni { @IsInt() almacenId: number; @IsInt() @Min(0) cantidad: number }
class VarianteDto {
  @IsString() @MaxLength(10) talla: string;
  @IsString() @MaxLength(40) color: string;
  @IsOptional() @IsString() colorHex?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => StockIni) stock?: StockIni[];
}
class ImagenDto {
  @IsString() url: string;
  @IsOptional() @IsBoolean() esOverlayAr?: boolean;
  @IsOptional() @IsString() color?: string;
}
class ProductoBase {
  @IsOptional() @IsString() @MaxLength(160) nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsString() textura?: string;
  @IsOptional() @IsIn(AR_TIPOS) arTipo?: string;
  @IsOptional() @IsNumber() @IsPositive() precioMenor?: number;
  @IsOptional() @IsNumber() precioMayor?: number | null;
  @IsOptional() @IsInt() categoriaId?: number | null;
  @IsOptional() @IsInt() temporadaId?: number | null;
  @IsOptional() @IsInt() coleccionId?: number | null;
  @IsOptional() @IsInt() proveedorId?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => ImagenDto) imagenes?: ImagenDto[];
}
class CrearProductoDto extends ProductoBase {
  @IsString() @MaxLength(160) nombre: string;
  @IsNumber() @IsPositive() precioMenor: number;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => VarianteDto) variantes?: VarianteDto[];
}
class ActualizarProductoDto extends ProductoBase { @IsOptional() @IsBoolean() activo?: boolean }
class EditarVarianteDto {
  @IsOptional() @IsString() talla?: string; @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() colorHex?: string; @IsOptional() @IsBoolean() activo?: boolean;
}

const DIR_UPLOADS = resolve(process.cwd(), 'public', 'uploads');
if (!existsSync(DIR_UPLOADS)) mkdirSync(DIR_UPLOADS, { recursive: true });

function skuDe(nombre: string, talla: string, color: string, id: number) {
  const base = nombre.normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'PROD';
  return `${base}-${id}-${talla.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-${color.normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()}`;
}
function err(e: any): never {
  if (e?.code === '23505') throw new ConflictException('Ya existe una variante o SKU igual (producto + talla + color deben ser únicos)');
  if (e?.code === '23503') throw new BadRequestException('Referencia inválida (categoría, temporada, colección o proveedor inexistente)');
  if (e?.code === '23514') throw new BadRequestException('Datos inválidos: el precio por mayor no puede superar al precio al detalle');
  throw e;
}

@Injectable()
export class CatalogoService {
  constructor(private db: Db, private inv: InventarioCore) {}

  /** Unidades disponibles (existencias - reservado) de una variante, en tiendas activas; opcionalmente de una sola sucursal. */
  private disp(sucursalParam: string | null) {
    return `(SELECT COALESCE(SUM(GREATEST(s.cantidad - s.reservado, 0)), 0)::int FROM stock s
               JOIN almacenes a ON a.id = s.almacen_id AND a.es_tienda AND a.activo
               JOIN sucursales su ON su.id = a.sucursal_id AND su.activa
              WHERE s.variante_id = v.id ${sucursalParam ? `AND a.sucursal_id = ${sucursalParam}` : ''})`;
  }

  async buscar(f: Record<string, string>, esAdmin: boolean) {
    const params: any[] = [];
    const P = (v: any) => { params.push(v); return `$${params.length}`; };
    const conds: string[] = [];
    if (!(f.todos === '1' && esAdmin)) conds.push('p.activo = true');
    if (f.q?.trim()) { const q = P(`%${f.q.trim()}%`); conds.push(`(p.nombre ILIKE ${q} OR p.descripcion ILIKE ${q} OR c.nombre ILIKE ${q} OR co.nombre ILIKE ${q} OR p.material ILIKE ${q})`); }
    if (num(f.categoriaId)) conds.push(`p.categoria_id = ${P(num(f.categoriaId))}`);
    if (num(f.temporadaId)) conds.push(`p.temporada_id = ${P(num(f.temporadaId))}`);
    if (num(f.coleccionId)) conds.push(`p.coleccion_id = ${P(num(f.coleccionId))}`);
    if (num(f.proveedorId)) conds.push(`p.proveedor_id = ${P(num(f.proveedorId))}`);
    if (f.temporadaActual === '1') conds.push(`t.activa AND current_date BETWEEN t.fecha_inicio AND t.fecha_fin`);
    if (f.talla) conds.push(`EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.activo AND v.talla = ${P(f.talla)})`);
    if (f.color) conds.push(`EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.activo AND lower(v.color) = lower(${P(f.color)}))`);
    if (num(f.min) !== undefined) conds.push(`p.precio_menor >= ${P(num(f.min))}`);
    if (num(f.max) !== undefined) conds.push(`p.precio_menor <= ${P(num(f.max))}`);
    const suc = num(f.sucursalId) ? P(num(f.sucursalId)) : null;
    if (f.soloDisponibles === '1') conds.push(`EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.activo AND ${this.disp(suc)} > 0)`);
    if (f.ids) conds.push(`p.id = ANY(${P(f.ids.split(',').map(Number).filter(Boolean))})`);

    const orden = { precio_asc: 'p.precio_menor ASC', precio_desc: 'p.precio_menor DESC', nombre: 'p.nombre ASC' }[f.orden as string] ?? 'p.id DESC';
    const limite = Math.min(num(f.limite, 100)!, 300);
    const offset = Math.max(num(f.offset, 0)!, 0);

    const filas = await this.db.q(
      `SELECT p.id, p.nombre, p.descripcion, p.material, p.textura, p.ar_tipo AS "arTipo", p.precio_menor AS "precioMenor", p.precio_mayor AS "precioMayor",
              p.activo, p.categoria_id AS "categoriaId", c.nombre AS categoria, p.temporada_id AS "temporadaId", t.nombre AS temporada,
              p.coleccion_id AS "coleccionId", co.nombre AS coleccion, p.proveedor_id AS "proveedorId",
              promo.pct AS promocion, ROUND(p.precio_menor * (1 - promo.pct / 100.0), 2)::float AS "precioVigente",
              COALESCE((SELECT json_agg(json_build_object('id', i.id, 'url', i.url, 'esOverlayAr', i.es_overlay_ar, 'color', i.color, 'orden', i.orden) ORDER BY i.orden, i.id)
                          FROM producto_imagenes i WHERE i.producto_id = p.id), '[]'::json) AS imagenes,
              COALESCE((SELECT json_agg(json_build_object('id', v.id, 'talla', v.talla, 'color', v.color, 'colorHex', v.color_hex, 'sku', v.sku, 'activo', v.activo,
                                                          'disponible', ${this.disp(suc)}) ORDER BY v.id)
                          FROM variantes v WHERE v.producto_id = p.id AND (v.activo OR ${esAdmin && f.todos === '1' ? 'true' : 'false'})), '[]'::json) AS variantes
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN temporadas t ON t.id = p.temporada_id
         LEFT JOIN colecciones co ON co.id = p.coleccion_id
         LEFT JOIN LATERAL (SELECT ${SQL_PROMO} AS pct) promo ON true
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY ${orden} LIMIT ${limite} OFFSET ${offset}`,
      params,
    );
    return filas.map((p: any) => ({ ...p, stockTotal: p.variantes.reduce((s: number, v: any) => s + v.disponible, 0) }));
  }

  async obtener(id: number, esAdmin = false, sucursalId?: number) {
    const r = await this.buscar({ ids: String(id), todos: '1', ...(sucursalId ? { sucursalId: String(sucursalId) } : {}) }, esAdmin);
    const p = r[0];
    if (!p || (!p.activo && !esAdmin)) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  filtros() {
    return this.db.q(
      `SELECT 'talla' AS tipo, v.talla AS valor, NULL AS hex FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.activo AND p.activo GROUP BY v.talla
       UNION ALL
       SELECT 'color', v.color, MAX(v.color_hex) FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.activo AND p.activo GROUP BY v.color
       ORDER BY 1, 2`,
    );
  }

  // CU-03: disponibilidad de cada variante en cada sucursal
  disponibilidad(productoId: number) {
    return this.db.q(
      `SELECT d.sucursal_id AS "sucursalId", d.sucursal, d.ciudad, su.direccion, su.horario, su.latitud, su.longitud,
              d.variante_id AS "varianteId", d.talla, d.color, d.color_hex AS "colorHex", d.disponible,
              d.reposicion_estimada AS "reposicionEstimada"
         FROM disponibilidad_sucursal d JOIN sucursales su ON su.id = d.sucursal_id
        WHERE d.producto_id = $1 ORDER BY d.ciudad, d.sucursal, d.variante_id`,
      [productoId],
    );
  }

  private async guardarImagenes(tx: Tx, productoId: number, imgs: ImagenDto[]) {
    await tx.q('DELETE FROM producto_imagenes WHERE producto_id = $1', [productoId]);
    let n = 0, nAr = 100;
    for (const i of imgs) {
      await tx.q('INSERT INTO producto_imagenes (producto_id, url, orden, es_overlay_ar, color) VALUES ($1,$2,$3,$4,$5)',
        [productoId, i.url, i.esOverlayAr ? nAr++ : n++, !!i.esOverlayAr, i.color ?? null]);
    }
  }

  private async crearVariante(tx: Tx, productoId: number, nombre: string, v: VarianteDto, usuarioId: number) {
    const fila = await tx.one(
      `INSERT INTO variantes (producto_id, talla, color, color_hex, sku) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [productoId, v.talla.trim(), v.color.trim(), /^#[0-9a-fA-F]{6}$/.test(v.colorHex ?? '') ? v.colorHex : '#888888', v.sku?.trim() || `TMP-${randomBytes(4).toString('hex')}`],
    );
    if (!v.sku?.trim()) await tx.q('UPDATE variantes SET sku=$2 WHERE id=$1', [fila.id, skuDe(nombre, v.talla, v.color, fila.id)]);
    for (const s of v.stock ?? []) {
      if (s.cantidad > 0) await this.inv.mover(tx, { varianteId: fila.id, almacenId: s.almacenId, dCantidad: s.cantidad, tipo: 'recepcion', usuarioId, nota: 'Stock inicial al crear la variante' });
    }
    return fila.id as number;
  }

  // CU-11
  async crear(dto: CrearProductoDto, usuarioId: number) {
    try {
      const id = await this.db.tx(async (tx) => {
        const p = await tx.one(
          `INSERT INTO productos (nombre, descripcion, material, textura, ar_tipo, precio_menor, precio_mayor, categoria_id, temporada_id, coleccion_id, proveedor_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [dto.nombre.trim(), dto.descripcion ?? null, dto.material ?? null, dto.textura ?? 'liso', dto.arTipo ?? 'superior', dto.precioMenor,
           dto.precioMayor ?? null, dto.categoriaId ?? null, dto.temporadaId ?? null, dto.coleccionId ?? null, dto.proveedorId ?? null],
        );
        if (dto.imagenes?.length) await this.guardarImagenes(tx, p.id, dto.imagenes);
        for (const v of dto.variantes ?? []) await this.crearVariante(tx, p.id, dto.nombre, v, usuarioId);
        await this.db.auditar(usuarioId, 'producto.crear', 'producto', p.id, { nombre: dto.nombre }, tx);
        return p.id as number;
      });
      return this.obtener(id, true);
    } catch (e) { err(e); }
  }

  async actualizar(id: number, dto: ActualizarProductoDto, usuarioId: number) {
    const map: [keyof ActualizarProductoDto, string][] = [
      ['nombre', 'nombre'], ['descripcion', 'descripcion'], ['material', 'material'], ['textura', 'textura'], ['arTipo', 'ar_tipo'],
      ['precioMenor', 'precio_menor'], ['precioMayor', 'precio_mayor'], ['categoriaId', 'categoria_id'], ['temporadaId', 'temporada_id'],
      ['coleccionId', 'coleccion_id'], ['proveedorId', 'proveedor_id'], ['activo', 'activo'],
    ];
    const sets: string[] = ['actualizado_en = now()']; const vals: any[] = [id];
    for (const [k, col] of map) if (dto[k] !== undefined) { vals.push(dto[k]); sets.push(`${col} = $${vals.length}`); }
    try {
      await this.db.tx(async (tx) => {
        const r = await tx.q(`UPDATE productos SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, vals);
        if (!r.length) throw new NotFoundException('Producto no encontrado');
        if (dto.imagenes) await this.guardarImagenes(tx, id, dto.imagenes);
        await this.db.auditar(usuarioId, 'producto.editar', 'producto', id, null, tx);
      });
    } catch (e) { if (e instanceof NotFoundException) throw e; err(e); }
    return this.obtener(id, true);
  }

  async agregarVariante(productoId: number, dto: VarianteDto, usuarioId: number) {
    const p = await this.db.one('SELECT nombre FROM productos WHERE id=$1', [productoId]);
    if (!p) throw new NotFoundException('Producto no encontrado');
    try { await this.db.tx((tx) => this.crearVariante(tx, productoId, p.nombre, dto, usuarioId)); } catch (e) { err(e); }
    return this.obtener(productoId, true);
  }

  async editarVariante(id: number, dto: EditarVarianteDto) {
    try {
      const r = await this.db.q(
        `UPDATE variantes SET talla = COALESCE($2, talla), color = COALESCE($3, color), color_hex = COALESCE($4, color_hex), activo = COALESCE($5, activo)
          WHERE id = $1 RETURNING producto_id AS "productoId"`, [id, dto.talla ?? null, dto.color ?? null, dto.colorHex ?? null, dto.activo ?? null]);
      if (!r.length) throw new NotFoundException('Variante no encontrada');
      return this.obtener(r[0].productoId, true);
    } catch (e) { if (e instanceof NotFoundException) throw e; err(e); }
  }
}

@Controller()
export class CatalogoController {
  constructor(private s: CatalogoService) {}

  @AuthOpcional() @Get('productos')
  buscar(@Query() f: Record<string, string>, @Req() req: any) { return this.s.buscar(f, req.user?.rol === 'admin'); }

  @Get('productos/filtros') filtros() { return this.s.filtros(); }

  @AuthOpcional() @Get('productos/:id')
  obtener(@Param('id') id: string, @Query('sucursalId') suc: string, @Req() req: any) { return this.s.obtener(idParam(id), req.user?.rol === 'admin', num(suc)); }

  @Get('productos/:id/disponibilidad') disponibilidad(@Param('id') id: string) { return this.s.disponibilidad(idParam(id)); }

  @Auth('admin') @Post('productos')
  crear(@Body() dto: CrearProductoDto, @Req() req: any) { return this.s.crear(dto, req.user.id); }

  @Auth('admin') @Patch('productos/:id')
  actualizar(@Param('id') id: string, @Body() dto: ActualizarProductoDto, @Req() req: any) { return this.s.actualizar(idParam(id), dto, req.user.id); }

  @Auth('admin') @Delete('productos/:id')
  baja(@Param('id') id: string, @Req() req: any) { return this.s.actualizar(idParam(id), { activo: false }, req.user.id); }

  @Auth('admin') @Post('productos/:id/variantes')
  variante(@Param('id') id: string, @Body() dto: VarianteDto, @Req() req: any) { return this.s.agregarVariante(idParam(id), dto, req.user.id); }

  @Auth('admin') @Patch('variantes/:id')
  editarVariante(@Param('id') id: string, @Body() dto: EditarVarianteDto) { return this.s.editarVariante(idParam(id), dto); }

  // Subida de imagenes (fotos de catalogo o PNG con fondo transparente para el vestidor AR)
  @Auth('admin', 'proveedor') @Post('archivos')
  @UseInterceptors(FileInterceptor('archivo', {
    storage: diskStorage({ destination: DIR_UPLOADS, filename: (_r, f, cb) => cb(null, `${Date.now()}-${randomBytes(4).toString('hex')}${extname(f.originalname).toLowerCase()}`) }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_r, f, cb) => (/^image\/(png|jpe?g|webp|gif)$/.test(f.mimetype) ? cb(null, true) : cb(new BadRequestException('Solo se permiten imágenes PNG, JPG, WEBP o GIF'), false)),
  }))
  subir(@UploadedFile() archivo: Express.Multer.File) {
    if (!archivo) throw new BadRequestException('Adjunta una imagen en el campo "archivo"');
    return { url: `/uploads/${archivo.filename}` };
  }
}

@Module({ providers: [CatalogoService], controllers: [CatalogoController], exports: [CatalogoService] })
export class CatalogoModule {}
