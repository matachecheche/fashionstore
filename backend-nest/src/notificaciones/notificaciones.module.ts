import { Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { Db } from '../common/db';
import { Auth } from '../common/auth';
import { idParam } from '../common/util';

@Injectable()
export class NotificacionesService {
  constructor(private db: Db) {}
  listar(uid: number, soloNoLeidas: boolean) {
    return this.db.q(
      `SELECT id, tipo, titulo, mensaje, leida, creada_en AS "creadaEn", referencia_tipo AS "referenciaTipo", referencia_id AS "referenciaId"
         FROM notificaciones WHERE usuario_id=$1 ${soloNoLeidas ? 'AND NOT leida' : ''} ORDER BY id DESC LIMIT 60`, [uid]);
  }
  async contador(uid: number) {
    const r = await this.db.one('SELECT COUNT(*)::int AS n FROM notificaciones WHERE usuario_id=$1 AND NOT leida', [uid]);
    return { noLeidas: r.n };
  }
  async leer(uid: number, id: number) { await this.db.q('UPDATE notificaciones SET leida=true WHERE id=$1 AND usuario_id=$2', [id, uid]); return { ok: true }; }
  async leerTodas(uid: number) { await this.db.q('UPDATE notificaciones SET leida=true WHERE usuario_id=$1 AND NOT leida', [uid]); return { ok: true }; }
}

@Controller('notificaciones')
@Auth()
export class NotificacionesController {
  constructor(private s: NotificacionesService) {}
  @Get() listar(@Req() r: any, @Query('noLeidas') nl?: string) { return this.s.listar(r.user.id, nl === '1'); }
  @Get('contador') contador(@Req() r: any) { return this.s.contador(r.user.id); }
  @Post('leer-todas') todas(@Req() r: any) { return this.s.leerTodas(r.user.id); }
  @Post(':id/leer') leer(@Req() r: any, @Param('id') id: string) { return this.s.leer(r.user.id, idParam(id)); }
}

@Module({ providers: [NotificacionesService], controllers: [NotificacionesController] })
export class NotificacionesModule {}
