import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Db } from './db';

export type Rol = 'admin' | 'encargado' | 'cajero' | 'proveedor' | 'cliente';
export interface UsuarioJwt { id: number; email: string; rol: Rol; sucursalId: number | null; proveedorId: number | null }

export const STAFF: Rol[] = ['admin', 'encargado', 'cajero'];
export const esStaff = (u?: UsuarioJwt | null) => !!u && STAFF.includes(u.rol);

export const JWT_SECRET = () => process.env.JWT_SECRET || 'cambia-esta-clave-secreta-antes-de-produccion';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private db: Db) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: JWT_SECRET() });
  }
  // Se consulta la BD en cada peticion: una cuenta desactivada o con rol cambiado pierde acceso de inmediato.
  async validate(p: { sub: number }): Promise<UsuarioJwt> {
    const u = await this.db.one('SELECT id, email, rol, activo, sucursal_id, proveedor_id FROM usuarios WHERE id=$1', [p.sub]);
    if (!u || !u.activo) throw new UnauthorizedException('Cuenta inexistente o desactivada');
    return { id: u.id, email: u.email, rol: u.rol, sucursalId: u.sucursal_id, proveedorId: u.proveedor_id };
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.get<Rol[]>('roles', ctx.getHandler()) ?? this.reflector.get<Rol[]>('roles', ctx.getClass());
    if (!roles || roles.length === 0) return true;
    const u = ctx.switchToHttp().getRequest().user;
    if (!u || !roles.includes(u.rol)) throw new ForbiddenException('No tienes permiso para esta operación');
    return true;
  }
}

/** Requiere sesion; si se indican roles, ademas el usuario debe tener uno de ellos. */
export const Auth = (...roles: Rol[]) => applyDecorators(SetMetadata('roles', roles), UseGuards(AuthGuard('jwt'), RolesGuard));

/** Igual que AuthGuard('jwt') pero nunca rechaza: sin token deja req.user = null. */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(ctx: ExecutionContext) { return super.canActivate(ctx) as any; }
  handleRequest(_e: any, user: any) { return user || null; }
}
export const AuthOpcional = () => UseGuards(OptionalJwtGuard);

/** Para encargados/cajeros: fuerza el filtro a su propia sucursal. Admin puede consultar cualquiera. */
export function sucursalPermitida(u: UsuarioJwt, pedida?: number | null): number | null {
  if (u.rol === 'admin' || !u.sucursalId) return pedida ?? null;
  return u.sucursalId;
}
export function puedeVerSucursal(u: UsuarioJwt, sucursalId: number) {
  return u.rol === 'admin' || !u.sucursalId || u.sucursalId === sucursalId;
}
