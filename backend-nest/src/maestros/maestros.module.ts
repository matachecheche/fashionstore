import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Db } from '../common/db';
import { Auth, AuthOpcional, Rol, UsuarioJwt } from '../common/auth';
import { idParam } from '../common/util';

type Tipo = 'str' | 'int' | 'num' | 'bool' | 'date';
interface Col { campo: string; col: string; tipo: Tipo; req?: boolean }
interface Cfg {
  path: string; tabla: string; select: string; orden: string;
  cols: Col[];
  flag: 'activo' | 'activa';                 // borrado logico: nunca se rompen las claves foraneas
  lectura: 'publica' | Rol[];                // quien puede listar
  escritura: Rol[];
  soloActivosPublico?: boolean;              // el publico solo ve registros activos
  extraPublico?: string;                     // filtro adicional para el publico (?vigentes=1, ?temporadaId=...)
  filtros?: Record<string, string>;          // query param -> condicion SQL con $1
  alCrear?: (db: Db, fila: any) => Promise<void>;
}

const c = (campo: string, col: string, tipo: Tipo, req = false): Col => ({ campo, col, tipo, req });

const CONFIGS: Cfg[] = [
  { path: 'categorias', tabla: 'categorias', flag: 'activa', lectura: 'publica', escritura: ['admin'], soloActivosPublico: true,
    select: 'SELECT t.id, t.nombre, t.activa FROM categorias t', orden: 't.nombre',
    cols: [c('nombre', 'nombre', 'str', true), c('activa', 'activa', 'bool')] },
  { path: 'temporadas', tabla: 'temporadas', flag: 'activa', lectura: 'publica', escritura: ['admin'], soloActivosPublico: true,
    select: `SELECT t.id, t.nombre, t.fecha_inicio AS "fechaInicio", t.fecha_fin AS "fechaFin", t.activa,
                    (t.activa AND current_date BETWEEN t.fecha_inicio AND t.fecha_fin) AS vigente FROM temporadas t`,
    orden: 't.fecha_inicio DESC',
    cols: [c('nombre', 'nombre', 'str', true), c('fechaInicio', 'fecha_inicio', 'date', true), c('fechaFin', 'fecha_fin', 'date', true), c('activa', 'activa', 'bool')] },
  { path: 'colecciones', tabla: 'colecciones', flag: 'activa', lectura: 'publica', escritura: ['admin'], soloActivosPublico: true,
    select: `SELECT t.id, t.temporada_id AS "temporadaId", te.nombre AS temporada, t.nombre, t.descripcion, t.activa
               FROM colecciones t JOIN temporadas te ON te.id = t.temporada_id`,
    orden: 't.nombre', filtros: { temporadaId: 't.temporada_id = $1' },
    cols: [c('temporadaId', 'temporada_id', 'int', true), c('nombre', 'nombre', 'str', true), c('descripcion', 'descripcion', 'str'), c('activa', 'activa', 'bool')] },
  { path: 'proveedores', tabla: 'proveedores', flag: 'activo', lectura: ['admin', 'encargado'], escritura: ['admin'],
    select: 'SELECT t.id, t.nombre, t.contacto, t.email, t.telefono, t.activo FROM proveedores t', orden: 't.nombre',
    cols: [c('nombre', 'nombre', 'str', true), c('contacto', 'contacto', 'str'), c('email', 'email', 'str'), c('telefono', 'telefono', 'str'), c('activo', 'activo', 'bool')] },
  { path: 'sucursales', tabla: 'sucursales', flag: 'activa', lectura: 'publica', escritura: ['admin'], soloActivosPublico: true,
    select: `SELECT t.id, t.nombre, t.ciudad, t.direccion, t.telefono, t.horario, t.latitud, t.longitud, t.activa FROM sucursales t`, orden: 't.ciudad, t.nombre',
    cols: [c('nombre', 'nombre', 'str', true), c('ciudad', 'ciudad', 'str', true), c('direccion', 'direccion', 'str'), c('telefono', 'telefono', 'str'),
           c('horario', 'horario', 'str'), c('latitud', 'latitud', 'num'), c('longitud', 'longitud', 'num'), c('activa', 'activa', 'bool')],
    // toda sucursal nace con su almacén "tienda" (el que vende y reserva)
    alCrear: async (db, f) => { await db.q(`INSERT INTO almacenes (sucursal_id, nombre, es_tienda) VALUES ($1, $2, true)`, [f.id, `Tienda ${f.nombre.replace(/^Sucursal\s+/i, '')}`]); } },
  { path: 'almacenes', tabla: 'almacenes', flag: 'activo', lectura: ['admin', 'encargado', 'cajero'], escritura: ['admin'],
    select: `SELECT t.id, t.sucursal_id AS "sucursalId", s.nombre AS sucursal, t.nombre, t.es_tienda AS "esTienda", t.activo
               FROM almacenes t JOIN sucursales s ON s.id = t.sucursal_id`,
    orden: 's.nombre, t.es_tienda DESC, t.nombre', filtros: { sucursalId: 't.sucursal_id = $1' },
    cols: [c('sucursalId', 'sucursal_id', 'int', true), c('nombre', 'nombre', 'str', true), c('esTienda', 'es_tienda', 'bool'), c('activo', 'activo', 'bool')] },
  { path: 'promociones', tabla: 'promociones', flag: 'activa', lectura: 'publica', escritura: ['admin'], soloActivosPublico: true,
    select: `SELECT t.id, t.nombre, t.porcentaje, t.producto_id AS "productoId", p.nombre AS producto, t.categoria_id AS "categoriaId", ca.nombre AS categoria,
                    t.temporada_id AS "temporadaId", te.nombre AS temporada, t.fecha_inicio AS "fechaInicio", t.fecha_fin AS "fechaFin", t.activa,
                    (t.activa AND current_date BETWEEN t.fecha_inicio AND t.fecha_fin) AS vigente
               FROM promociones t LEFT JOIN productos p ON p.id = t.producto_id LEFT JOIN categorias ca ON ca.id = t.categoria_id
               LEFT JOIN temporadas te ON te.id = t.temporada_id`,
    orden: 't.fecha_fin DESC', extraPublico: 'current_date BETWEEN t.fecha_inicio AND t.fecha_fin',
    cols: [c('nombre', 'nombre', 'str', true), c('porcentaje', 'porcentaje', 'num', true), c('productoId', 'producto_id', 'int'), c('categoriaId', 'categoria_id', 'int'),
           c('temporadaId', 'temporada_id', 'int'), c('fechaInicio', 'fecha_inicio', 'date'), c('fechaFin', 'fecha_fin', 'date'), c('activa', 'activa', 'bool')] },
];

function convertir(col: Col, v: any) {
  if (v === undefined) return undefined;
  if (v === null || v === '') { if (col.req) throw new BadRequestException(`El campo "${col.campo}" es obligatorio`); return null; }
  switch (col.tipo) {
    case 'str': return String(v).trim();
    case 'int': case 'num': {
      const n = Number(v);
      if (!Number.isFinite(n) || (col.tipo === 'int' && !Number.isInteger(n))) throw new BadRequestException(`El campo "${col.campo}" debe ser numérico`);
      return n;
    }
    case 'bool': return v === true || v === 'true' || v === 1;
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(v))) throw new BadRequestException(`El campo "${col.campo}" debe ser una fecha (AAAA-MM-DD)`);
      return String(v).slice(0, 10);
  }
}

function traducirError(e: any): never {
  if (e?.code === '23505') throw new ConflictException('Ya existe un registro con esos datos (valor duplicado)');
  if (e?.code === '23503') throw new BadRequestException('Referencia inválida: el registro relacionado no existe');
  if (e?.code === '23514') throw new BadRequestException('Los datos no cumplen las reglas de validación (revisa fechas, porcentajes y precios)');
  throw e;
}

function crearControlador(cfg: Cfg) {
  @Controller(cfg.path)
  class MaestroController {
    constructor(@Inject(Db) private db: Db) {}

    private fila(id: number) { return this.db.one(`${cfg.select} WHERE t.id = $1`, [id]); }

    @AuthOpcional() @Get()
    async listar(@Query() q: Record<string, string>, @Req() req: any) {
      const u: UsuarioJwt | null = req.user;
      const conds: string[] = []; const params: any[] = [];
      if (cfg.lectura === 'publica') {
        const admin = u?.rol === 'admin' && q.todas === '1';
        if (cfg.soloActivosPublico && !admin) conds.push(`t.${cfg.flag} = true`);
        if (cfg.extraPublico && q.vigentes === '1') conds.push(cfg.extraPublico);
      } else if (!u || !cfg.lectura.includes(u.rol)) {
        throw new BadRequestException('Inicia sesión con un rol autorizado para consultar este recurso');
      }
      for (const [k, cond] of Object.entries(cfg.filtros ?? {})) {
        if (q[k] !== undefined && q[k] !== '') { params.push(Number(q[k])); conds.push(cond.replace('$1', `$${params.length}`)); }
      }
      return this.db.q(`${cfg.select}${conds.length ? ' WHERE ' + conds.join(' AND ') : ''} ORDER BY ${cfg.orden}`, params);
    }

    @Auth(...cfg.escritura) @Post()
    async crear(@Body() body: any, @Req() req: any) {
      const campos: string[] = []; const vals: any[] = [];
      for (const col of cfg.cols) {
        const v = convertir(col, body?.[col.campo]);
        if (col.req && v === undefined) throw new BadRequestException(`El campo "${col.campo}" es obligatorio`);
        if (v !== undefined) { campos.push(col.col); vals.push(v); }
      }
      try {
        const nueva = await this.db.tx(async (tx) => {
          const r = await tx.one(`INSERT INTO ${cfg.tabla} (${campos.join(',')}) VALUES (${vals.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id, nombre`, vals);
          if (cfg.alCrear) await cfg.alCrear({ q: tx.q } as any, r);
          await this.db.auditar(req.user.id, `${cfg.path}.crear`, cfg.path, r.id, null, tx);
          return r;
        });
        return this.fila(nueva.id);
      } catch (e) { traducirError(e); }
    }

    @Auth(...cfg.escritura) @Patch(':id')
    async editar(@Param('id') id: string, @Body() body: any, @Req() req: any) {
      const n = idParam(id);
      const sets: string[] = []; const vals: any[] = [n];
      for (const col of cfg.cols) {
        const v = convertir(col, body?.[col.campo]);
        if (v !== undefined) { vals.push(v); sets.push(`${col.col} = $${vals.length}`); }
      }
      if (!sets.length) throw new BadRequestException('No hay campos para actualizar');
      try {
        const r = await this.db.q(`UPDATE ${cfg.tabla} SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, vals);
        if (!r.length) throw new NotFoundException('Registro no encontrado');
        await this.db.auditar(req.user.id, `${cfg.path}.editar`, cfg.path, n);
        return this.fila(n);
      } catch (e) { if (e instanceof NotFoundException) throw e; traducirError(e); }
    }

    // "Eliminar" = desactivar (baja logica). Asi el historial de ventas, reservas e inventario nunca se rompe.
    @Auth(...cfg.escritura) @Delete(':id')
    async desactivar(@Param('id') id: string, @Req() req: any) {
      const n = idParam(id);
      const r = await this.db.q(`UPDATE ${cfg.tabla} SET ${cfg.flag} = false WHERE id = $1 RETURNING id`, [n]);
      if (!r.length) throw new NotFoundException('Registro no encontrado');
      await this.db.auditar(req.user.id, `${cfg.path}.desactivar`, cfg.path, n);
      return { ok: true };
    }
  }
  return MaestroController;
}

@Module({ controllers: CONFIGS.map(crearControlador) })
export class MaestrosModule {}
