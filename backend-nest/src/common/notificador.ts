import { Injectable } from '@nestjs/common';
import type { Tx } from './db';

/** Notificaciones dentro de la aplicacion (campana en web y en la app movil). */
@Injectable()
export class Notificador {
  async aUsuario(tx: Tx, usuarioId: number, tipo: string, titulo: string, mensaje: string, refTipo?: string, refId?: number) {
    await tx.q(
      'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [usuarioId, tipo, titulo, mensaje, refTipo ?? null, refId ?? null],
    );
  }

  /** Encargados y cajeros de una sucursal */
  async aPersonalSucursal(tx: Tx, sucursalId: number, tipo: string, titulo: string, mensaje: string, refTipo?: string, refId?: number) {
    await tx.q(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id)
       SELECT id, $2, $3, $4, $5, $6 FROM usuarios WHERE activo AND rol IN ('encargado','cajero') AND sucursal_id = $1`,
      [sucursalId, tipo, titulo, mensaje, refTipo ?? null, refId ?? null],
    );
  }

  async aAdmins(tx: Tx, tipo: string, titulo: string, mensaje: string, refTipo?: string, refId?: number) {
    await tx.q(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id)
       SELECT id, $1, $2, $3, $4, $5 FROM usuarios WHERE activo AND rol = 'admin'`,
      [tipo, titulo, mensaje, refTipo ?? null, refId ?? null],
    );
  }
}
