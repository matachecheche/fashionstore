import { ConflictException, Injectable } from '@nestjs/common';
import type { Tx } from './db';

export type TipoMov =
  | 'recepcion' | 'venta' | 'reserva' | 'liberacion_reserva' | 'retencion_pago' | 'liberacion_pago'
  | 'devolucion' | 'ajuste' | 'merma' | 'transferencia_salida' | 'transferencia_entrada' | 'stock_inicial';

export interface Mov {
  varianteId: number;
  almacenId: number;
  dCantidad?: number;   // cambio en existencias fisicas
  dReservado?: number;  // cambio en unidades retenidas
  tipo: TipoMov;
  refTipo?: string;
  refId?: number;
  usuarioId?: number | null;
  nota?: string;
}

/**
 * Nucleo de inventario (CU-10): TODO cambio de stock pasa por aqui, dentro de una transaccion.
 * Bloquea la fila (FOR UPDATE), valida que nunca haya stock negativo ni mas reservado que existente,
 * y deja el movimiento en el historial para trazabilidad.
 */
@Injectable()
export class InventarioCore {
  async mover(tx: Tx, m: Mov) {
    const dC = m.dCantidad ?? 0;
    const dR = m.dReservado ?? 0;
    let fila = await tx.one<{ cantidad: number; reservado: number }>(
      'SELECT cantidad, reservado FROM stock WHERE variante_id=$1 AND almacen_id=$2 FOR UPDATE',
      [m.varianteId, m.almacenId],
    );
    if (!fila) {
      if (dC < 0 || dR > 0) await this.sinStock(tx, m, 0);
      await tx.q('INSERT INTO stock (variante_id, almacen_id, cantidad, reservado) VALUES ($1,$2,0,0) ON CONFLICT DO NOTHING', [m.varianteId, m.almacenId]);
      fila = { cantidad: 0, reservado: 0 };
    }
    const cantidad = fila.cantidad + dC;
    const reservado = fila.reservado + dR;
    if (cantidad < 0 || reservado < 0 || reservado > cantidad) {
      // reservado < 0 significa un error de logica interna; el resto es falta de stock real
      if (reservado < 0) throw new ConflictException({ code: 'INVENTARIO_INCONSISTENTE', message: 'Inconsistencia de inventario: no hay unidades retenidas para liberar' });
      await this.sinStock(tx, m, Math.max(fila.cantidad - fila.reservado, 0));
    }
    await tx.q('UPDATE stock SET cantidad=$3, reservado=$4 WHERE variante_id=$1 AND almacen_id=$2', [m.varianteId, m.almacenId, cantidad, reservado]);
    await tx.q(
      `INSERT INTO movimientos_inventario (variante_id, almacen_id, tipo, delta_cantidad, delta_reservado, saldo_cantidad, saldo_reservado,
                                           referencia_tipo, referencia_id, usuario_id, nota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [m.varianteId, m.almacenId, m.tipo, dC, dR, cantidad, reservado, m.refTipo ?? null, m.refId ?? null, m.usuarioId ?? null, m.nota ?? null],
    );
    return { cantidad, reservado, disponible: cantidad - reservado };
  }

  private async sinStock(tx: Tx, m: Mov, disponible: number): Promise<never> {
    const v = await tx.one<any>(
      'SELECT p.nombre, v.talla, v.color FROM variantes v JOIN productos p ON p.id=v.producto_id WHERE v.id=$1',
      [m.varianteId],
    );
    const nombre = v ? `${v.nombre} (${v.talla}/${v.color})` : `variante ${m.varianteId}`;
    throw new ConflictException({
      code: 'SIN_STOCK',
      message: `Stock insuficiente de ${nombre}: disponible ${disponible}`,
      varianteId: m.varianteId,
      disponible,
    });
  }

  /** Almacen "tienda" (el que vende y reserva) de una sucursal */
  async almacenTienda(tx: Tx, sucursalId: number): Promise<number> {
    const a = await tx.one<{ id: number }>('SELECT id FROM almacenes WHERE sucursal_id=$1 AND es_tienda AND activo', [sucursalId]);
    if (!a) throw new ConflictException('La sucursal no tiene un almacén de tienda activo');
    return a.id;
  }
}
