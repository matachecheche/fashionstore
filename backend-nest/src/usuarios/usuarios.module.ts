import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Db } from '../common/db';
import { Auth } from '../common/auth';
import { idParam } from '../common/util';

const ROLES = ['admin', 'encargado', 'cajero', 'proveedor', 'cliente'];

class CrearUsuarioDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsIn(ROLES) rol: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsInt() sucursalId?: number;
  @IsOptional() @IsInt() proveedorId?: number;
}
class EditarUsuarioDto {
  @IsOptional() @IsString() @MinLength(2) nombre?: string;
  @IsOptional() @IsIn(ROLES) rol?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsInt() sucursalId?: number | null;
  @IsOptional() @IsInt() proveedorId?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

@Injectable()
export class UsuariosService {
  constructor(private db: Db) {}

  listar(q?: string, rol?: string) {
    return this.db.q(
      `SELECT u.id, u.nombre, u.email, u.rol, u.telefono, u.activo, u.sucursal_id AS "sucursalId", s.nombre AS sucursal,
              u.proveedor_id AS "proveedorId", pr.nombre AS proveedor, u.creado_en AS "creadoEn", u.ultimo_acceso AS "ultimoAcceso"
         FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id LEFT JOIN proveedores pr ON pr.id = u.proveedor_id
        WHERE ($1::text IS NULL OR u.nombre ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%')
          AND ($2::text IS NULL OR u.rol = $2)
        ORDER BY u.id`,
      [q || null, rol || null],
    );
  }

  private validarVinculos(rol: string, sucursalId?: number | null, proveedorId?: number | null) {
    if ((rol === 'encargado' || rol === 'cajero') && !sucursalId) throw new BadRequestException('Encargados y cajeros deben tener una sucursal asignada');
    if (rol === 'proveedor' && !proveedorId) throw new BadRequestException('Un usuario proveedor debe estar vinculado a un proveedor');
  }

  async crear(dto: CrearUsuarioDto, adminId: number) {
    this.validarVinculos(dto.rol, dto.sucursalId, dto.proveedorId);
    const email = dto.email.trim().toLowerCase();
    if (await this.db.one('SELECT 1 FROM usuarios WHERE email=$1', [email])) throw new ConflictException('Ese correo ya está registrado');
    const u = await this.db.one(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, sucursal_id, proveedor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, nombre, email, rol`,
      [dto.nombre.trim(), email, await bcrypt.hash(dto.password, 10), dto.rol, dto.telefono ?? null,
       ['encargado', 'cajero'].includes(dto.rol) ? dto.sucursalId : null, dto.rol === 'proveedor' ? dto.proveedorId : null],
    );
    await this.db.auditar(adminId, 'usuario.crear', 'usuario', u.id, { rol: dto.rol });
    return u;
  }

  async editar(id: number, dto: EditarUsuarioDto, adminId: number) {
    const actual = await this.db.one('SELECT * FROM usuarios WHERE id=$1', [id]);
    if (!actual) throw new NotFoundException('Usuario no encontrado');
    const rol = dto.rol ?? actual.rol;
    const sucursalId = dto.sucursalId !== undefined ? dto.sucursalId : actual.sucursal_id;
    const proveedorId = dto.proveedorId !== undefined ? dto.proveedorId : actual.proveedor_id;
    this.validarVinculos(rol, sucursalId, proveedorId);
    if (id === adminId && (dto.activo === false || (dto.rol && dto.rol !== 'admin'))) throw new BadRequestException('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
    await this.db.q(
      `UPDATE usuarios SET nombre=$2, rol=$3, telefono=$4, sucursal_id=$5, proveedor_id=$6, activo=$7,
              password_hash = COALESCE($8, password_hash) WHERE id=$1`,
      [id, dto.nombre?.trim() ?? actual.nombre, rol, dto.telefono ?? actual.telefono,
       ['encargado', 'cajero'].includes(rol) ? sucursalId : null, rol === 'proveedor' ? proveedorId : null,
       dto.activo ?? actual.activo, dto.password ? await bcrypt.hash(dto.password, 10) : null],
    );
    await this.db.auditar(adminId, 'usuario.editar', 'usuario', id, { rol, activo: dto.activo });
    return { ok: true };
  }
}

// Gestion de cuentas (CU-11/12 del administrador). El autorregistro de clientes vive en /auth/registro.
@Controller('usuarios')
@Auth('admin')
export class UsuariosController {
  constructor(private s: UsuariosService) {}
  @Get() listar(@Query('q') q?: string, @Query('rol') rol?: string) { return this.s.listar(q, rol); }
  @Post() crear(@Body() dto: CrearUsuarioDto, @Req() req: any) { return this.s.crear(dto, req.user.id); }
  @Patch(':id') editar(@Param('id') id: string, @Body() dto: EditarUsuarioDto, @Req() req: any) { return this.s.editar(idParam(id), dto, req.user.id); }
}

@Module({ providers: [UsuariosService], controllers: [UsuariosController] })
export class UsuariosModule {}
