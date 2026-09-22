import { Body, ConflictException, Controller, Get, Injectable, Module, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Db } from '../common/db';
import { Auth, JWT_SECRET, JwtStrategy } from '../common/auth';

// Rol de negocio -> rol de PostgreSQL que PostgREST activa con SET ROLE segun el claim "role" del JWT
const ROL_POSTGRES: Record<string, string> = {
  admin: 'app_admin', encargado: 'app_encargado', cajero: 'app_cajero', proveedor: 'app_proveedor', cliente: 'app_cliente',
};

class RegistroDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) @MaxLength(100) password: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
}
class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
class PerfilDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsString() @MaxLength(30) documento?: string;
  @IsOptional() @IsObject() preferencias?: Record<string, any>;
}
class PasswordDto {
  @IsString() actual: string;
  @IsString() @MinLength(6) @MaxLength(100) nueva: string;
}

const COLS = 'id, nombre, email, rol, telefono, documento, sucursal_id, proveedor_id, preferencias';

@Injectable()
export class AuthService {
  constructor(private db: Db, private jwt: JwtService) {}

  private firmar(u: any) {
    const token = this.jwt.sign({ sub: u.id, email: u.email, rol: u.rol, role: ROL_POSTGRES[u.rol], sucursalId: u.sucursal_id, proveedorId: u.proveedor_id });
    return { token, usuario: this.publico(u) };
  }
  private publico(u: any) {
    return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, telefono: u.telefono, documento: u.documento,
             sucursalId: u.sucursal_id, proveedorId: u.proveedor_id, preferencias: u.preferencias ?? {} };
  }

  // CU-01: el autorregistro publico SIEMPRE crea clientes (nadie puede autoasignarse un rol de personal)
  async registrar(dto: RegistroDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.db.one('SELECT 1 FROM usuarios WHERE email=$1', [email])) throw new ConflictException('Ese correo ya está registrado');
    const u = await this.db.one(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, telefono) VALUES ($1,$2,$3,'cliente',$4) RETURNING ${COLS}`,
      [dto.nombre.trim(), email, await bcrypt.hash(dto.password, 10), dto.telefono ?? null],
    );
    return this.firmar(u);
  }

  // CU-02
  async login(dto: LoginDto) {
    const u = await this.db.one(`SELECT ${COLS}, password_hash, activo FROM usuarios WHERE email=$1`, [dto.email.trim().toLowerCase()]);
    if (!u || !(await bcrypt.compare(dto.password, u.password_hash))) throw new UnauthorizedException('Correo o contraseña incorrectos');
    if (!u.activo) throw new UnauthorizedException('Tu cuenta está desactivada. Contacta al administrador.');
    await this.db.q('UPDATE usuarios SET ultimo_acceso = now() WHERE id=$1', [u.id]);
    return this.firmar(u);
  }

  async me(id: number) {
    const u = await this.db.one(`SELECT ${COLS} FROM usuarios WHERE id=$1`, [id]);
    if (!u) throw new UnauthorizedException();
    const sucursal = u.sucursal_id ? await this.db.one('SELECT id, nombre, ciudad FROM sucursales WHERE id=$1', [u.sucursal_id]) : null;
    return { ...this.publico(u), sucursal };
  }

  async actualizar(id: number, d: PerfilDto) {
    const u = await this.db.one(
      `UPDATE usuarios SET nombre = COALESCE($2, nombre), telefono = COALESCE($3, telefono), documento = COALESCE($4, documento),
              preferencias = COALESCE($5::jsonb, preferencias) WHERE id=$1 RETURNING ${COLS}`,
      [id, d.nombre?.trim() ?? null, d.telefono ?? null, d.documento ?? null, d.preferencias ? JSON.stringify(d.preferencias) : null],
    );
    return this.publico(u);
  }

  async cambiarPassword(id: number, d: PasswordDto) {
    const u = await this.db.one('SELECT password_hash FROM usuarios WHERE id=$1', [id]);
    if (!u || !(await bcrypt.compare(d.actual, u.password_hash))) throw new UnauthorizedException('La contraseña actual no es correcta');
    await this.db.q('UPDATE usuarios SET password_hash=$2 WHERE id=$1', [id, await bcrypt.hash(d.nueva, 10)]);
    return { ok: true };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('registro') registro(@Body() dto: RegistroDto) { return this.auth.registrar(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Auth() @Get('me') me(@Req() req: any) { return this.auth.me(req.user.id); }
  @Auth() @Patch('me') actualizar(@Req() req: any, @Body() dto: PerfilDto) { return this.auth.actualizar(req.user.id, dto); }
  @Auth() @Post('me/password') password(@Req() req: any, @Body() dto: PasswordDto) { return this.auth.cambiarPassword(req.user.id, dto); }
}

@Module({
  imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET(), signOptions: { expiresIn: '7d' } })],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
