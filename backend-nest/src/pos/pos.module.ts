import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Post, Req } from '@nestjs/common';
import { IsNumber, Min } from 'class-validator';
import { Db } from '../common/db';
import { Auth, UsuarioJwt } from '../common/auth';
import { InventarioCore } from '../common/inventario-core';
import { redondear } from '../common/util';

class AbrirCajaDto { @IsNumber() @Min(0) montoApertura: number }
class CerrarCajaDto { @IsNumber() @Min(0) montoCierre: number }

@Injectable()
export class PosService {
  constructor(private db: Db, private inv: InventarioCore) {}

  private async resumen(cajaId: number) {
    const porMetodo = await this.db.q(
      `SELECT metodo_pago AS metodo, COUNT(*)::int AS ventas, COALESCE(SUM(total),0)::float AS total
         FROM ventas WHERE caja_id=$1 AND estado IN ('completada','entregada','devuelta_parcial') GROUP BY metodo_pago ORDER BY 1`, [cajaId]);
    const dev = await this.db.one(
      `SELECT COALESCE(SUM(d.monto),0)::float AS monto FROM devoluciones d JOIN ventas v ON v.id = d.venta_id
        WHERE v.caja_id=$1 AND v.metodo_pago = 'efectivo'`, [cajaId]);
    const totalVentas = porMetodo.reduce((s: number, m: any) => s + m.total, 0);
    const efectivo = porMetodo.find((m: any) => m.metodo === 'efectivo')?.total ?? 0;
    return { porMetodo, totalVentas: redondear(totalVentas), efectivoVentas: redondear(efectivo), devolucionesEfectivo: dev?.monto ?? 0 };
  }

  private async cajaConResumen(c: any) {
    if (!c) return null;
    const r = await this.resumen(c.id);
    const esperado = redondear(Number(c.monto_apertura) + r.efectivoVentas - r.devolucionesEfectivo);
    return {
      id: c.id, estado: c.estado, sucursalId: c.sucursal_id, almacenId: c.almacen_id, cajeroId: c.cajero_id, montoApertura: Number(c.monto_apertura),
      montoCierre: c.monto_cierre === null ? null : Number(c.monto_cierre), montoEsperado: c.estado === 'cerrada' ? Number(c.monto_esperado) : esperado,
      abiertaEn: c.abierta_en, cerradaEn: c.cerrada_en, ...r,
      diferencia: c.estado === 'cerrada' ? redondear(Number(c.monto_cierre) - Number(c.monto_esperado)) : null,
    };
  }

  async activa(u: UsuarioJwt) {
    return this.cajaConResumen(await this.db.one("SELECT * FROM cajas WHERE cajero_id=$1 AND estado='abierta'", [u.id]));
  }

  async abrir(u: UsuarioJwt, d: AbrirCajaDto) {
    if (!u.sucursalId) throw new BadRequestException('Tu usuario no tiene una sucursal asignada: pide al administrador que te asigne una para operar la caja');
    if (await this.db.one("SELECT 1 FROM cajas WHERE cajero_id=$1 AND estado='abierta'", [u.id])) throw new ConflictException('Ya tienes una caja abierta');
    const almacenId = await this.db.tx((tx) => this.inv.almacenTienda(tx, u.sucursalId!));
    const c = await this.db.one('INSERT INTO cajas (almacen_id, sucursal_id, cajero_id, monto_apertura) VALUES ($1,$2,$3,$4) RETURNING *', [almacenId, u.sucursalId, u.id, d.montoApertura]);
    return this.cajaConResumen(c);
  }

  async cerrar(u: UsuarioJwt, d: CerrarCajaDto) {
    const c = await this.db.one("SELECT * FROM cajas WHERE cajero_id=$1 AND estado='abierta'", [u.id]);
    if (!c) throw new BadRequestException('No tienes una caja abierta');
    const esperado = (await this.cajaConResumen(c))!.montoEsperado;
    const cerrada = await this.db.one("UPDATE cajas SET estado='cerrada', monto_cierre=$2, monto_esperado=$3, cerrada_en=now() WHERE id=$1 RETURNING *", [c.id, d.montoCierre, esperado]);
    return this.cajaConResumen(cerrada);
  }

  async historial(u: UsuarioJwt) {
    const filas = await this.db.q(
      `SELECT c.*, u.nombre AS cajero, s.nombre AS sucursal FROM cajas c JOIN usuarios u ON u.id = c.cajero_id JOIN sucursales s ON s.id = c.sucursal_id
        WHERE ($1::int IS NULL OR c.sucursal_id = $1) ORDER BY c.abierta_en DESC LIMIT 100`, [u.rol === 'admin' ? null : u.sucursalId]);
    const out: any[] = [];
    for (const f of filas) out.push({ ...(await this.cajaConResumen(f)), cajero: f.cajero, sucursal: f.sucursal });
    return out;
  }
}

@Controller('pos')
export class PosController {
  constructor(private s: PosService) {}
  @Auth('cajero', 'encargado') @Get('caja/activa') activa(@Req() r: any) { return this.s.activa(r.user); }
  @Auth('cajero', 'encargado') @Post('caja/abrir') abrir(@Body() d: AbrirCajaDto, @Req() r: any) { return this.s.abrir(r.user, d); }
  @Auth('cajero', 'encargado') @Post('caja/cerrar') cerrar(@Body() d: CerrarCajaDto, @Req() r: any) { return this.s.cerrar(r.user, d); }
  @Auth('admin', 'encargado') @Get('cajas') historial(@Req() r: any) { return this.s.historial(r.user); }
}

@Module({ providers: [PosService], controllers: [PosController] })
export class PosModule {}
