import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Db } from '../common/db';
import { Auth, AuthOpcional } from '../common/auth';
import { idParam, num } from '../common/util';

class MensajeChat { @IsIn(['user', 'assistant']) rol: string; @IsString() @MaxLength(2000) texto: string }
class ChatDto {
  @IsString() @MaxLength(1000) mensaje: string;
  @IsOptional() @IsInt() sucursalId?: number;
  @IsOptional() @IsInt() productoId?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => MensajeChat) historial?: MensajeChat[];
}
class PreguntaDto { @IsString() @MaxLength(500) pregunta: string }
class InteraccionDto {
  @IsInt() productoId: number;
  @IsIn(['vista', 'probador', 'carrito', 'busqueda']) tipo: string;
}

/**
 * La API comercial delega en el microservicio de IA (FastAPI) las recomendaciones, el asistente y el soporte AR.
 * Asi los clientes (web y movil) hablan con un solo backend y el servicio de IA no necesita estar expuesto.
 */
@Injectable()
export class IaService {
  constructor(private db: Db) {}
  private base = () => (process.env.FASTAPI_URL || 'http://localhost:8000').replace(/\/$/, '');

  async llamar(ruta: string, cuerpo?: any, metodo = 'POST'): Promise<any> {
    let r: Response;
    try {
      r = await fetch(`${this.base()}${ruta}`, {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo && metodo !== 'GET' ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new ServiceUnavailableException('El servicio de inteligencia artificial no está disponible en este momento');
    }
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new BadRequestException(j?.detail || j?.message || 'El servicio de IA devolvió un error');
    return j;
  }

  async interaccion(usuarioId: number | null, d: InteraccionDto) {
    if (!usuarioId) return { ok: true };   // sin sesion no se registra
    await this.db.q('INSERT INTO interacciones (usuario_id, producto_id, tipo) SELECT $1, id, $3 FROM productos WHERE id = $2', [usuarioId, d.productoId, d.tipo]);
    return { ok: true };
  }
}

@Controller('ia')
export class IaController {
  constructor(private s: IaService) {}

  @AuthOpcional() @Get('recomendaciones')
  recomendaciones(@Req() r: any, @Query('productoId') p?: string, @Query('sucursalId') s?: string, @Query('limite') l?: string) {
    return this.s.llamar('/api/recomendaciones', { cliente_id: r.user?.id ?? null, producto_id: num(p) ?? null, sucursal_id: num(s) ?? null, limite: Math.min(num(l, 8)!, 20) });
  }

  @AuthOpcional() @Post('chat')
  chat(@Body() d: ChatDto, @Req() r: any) {
    return this.s.llamar('/api/asistente/chat', {
      mensaje: d.mensaje, cliente_id: r.user?.id ?? null, sucursal_id: d.sucursalId ?? null, producto_id: d.productoId ?? null,
      historial: (d.historial ?? []).map((m) => ({ rol: m.rol, texto: m.texto })),
    });
  }

  // Datos visuales de la prenda para el motor de realidad aumentada (CU-06 paso 3)
  @Get('ar/:productoId')
  ar(@Param('productoId') id: string, @Query('color') color?: string) {
    return this.s.llamar(`/api/ar/prenda/${idParam(id)}${color ? `?color=${encodeURIComponent(color)}` : ''}`, undefined, 'GET');
  }

  @Auth('admin', 'encargado') @Post('reportes')
  reportes(@Body() d: PreguntaDto) { return this.s.llamar('/api/reportes/ask', { pregunta: d.pregunta }); }

  @AuthOpcional() @Post('interacciones')
  interaccion(@Body() d: InteraccionDto, @Req() r: any) { return this.s.interaccion(r.user?.id ?? null, d); }
}

@Module({ providers: [IaService], controllers: [IaController] })
export class IaModule {}
