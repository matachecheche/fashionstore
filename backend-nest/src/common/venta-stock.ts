import { ConflictException, Injectable } from '@nestjs/common';
import type { Tx } from './db';
import { InventarioCore } from './inventario-core';

export interface ItemStock { varianteId: number; cantidad: number }

/** Logica de stock compartida por ventas y pagos (CU-07 / CU-10). */
@Injectable()
export class VentaStock {
  constructor(private inv: InventarioCore) {}

  /**
   * Descuenta el stock de una venta confirmada.
   *  - Con reserva: consume las unidades retenidas de lo que se compra y libera el resto; la reserva pasa a COMPLETADA.
   *  - Con retencion propia (pago digital pendiente): convierte lo retenido en salida.
   *  - Sin retencion (venta de mostrador): descuenta directamente lo disponible.
   */
  async consumir(tx: Tx, o: { ventaId: number; almacenId: number; reservaId?: number | null; retenido: boolean; items: ItemStock[]; usuarioId?: number | null }) {
    const items = [...o.items].sort((a, b) => a.varianteId - b.varianteId);
    const base = { almacenId: o.almacenId, refTipo: 'venta', refId: o.ventaId, usuarioId: o.usuarioId ?? null };
    if (o.reservaId) {
      const det = await tx.q('SELECT variante_id, cantidad FROM detalle_reserva WHERE reserva_id=$1 ORDER BY variante_id', [o.reservaId]);
      const reservado = new Map<number, number>(det.map((d: any) => [d.variante_id, d.cantidad]));
      for (const it of items) {
        if ((reservado.get(it.varianteId) ?? 0) < it.cantidad) throw new ConflictException('La venta incluye más unidades de las reservadas');
        await this.inv.mover(tx, { ...base, varianteId: it.varianteId, dCantidad: -it.cantidad, dReservado: -it.cantidad, tipo: 'venta' });
        reservado.set(it.varianteId, reservado.get(it.varianteId)! - it.cantidad);
      }
      for (const [varianteId, resto] of [...reservado.entries()].sort((a, b) => a[0] - b[0])) {
        if (resto > 0) await this.inv.mover(tx, { ...base, varianteId, dReservado: -resto, tipo: 'liberacion_reserva', nota: 'Prenda reservada que no se compró' });
      }
      await tx.q(`UPDATE reservas SET estado='COMPLETADA', venta_id=$2, actualizada_en=now() WHERE id=$1`, [o.reservaId, o.ventaId]);
      return;
    }
    for (const it of items) {
      await this.inv.mover(tx, { ...base, varianteId: it.varianteId, dCantidad: -it.cantidad, dReservado: o.retenido ? -it.cantidad : 0, tipo: 'venta' });
    }
  }

  /** Retiene unidades mientras se espera la confirmacion del pago digital. */
  async retener(tx: Tx, o: { ventaId: number; almacenId: number; items: ItemStock[]; usuarioId?: number | null }) {
    for (const it of [...o.items].sort((a, b) => a.varianteId - b.varianteId)) {
      await this.inv.mover(tx, { varianteId: it.varianteId, almacenId: o.almacenId, dReservado: it.cantidad, tipo: 'retencion_pago', refTipo: 'venta', refId: o.ventaId, usuarioId: o.usuarioId ?? null });
    }
  }

  async liberarRetencion(tx: Tx, o: { ventaId: number; almacenId: number; items: ItemStock[] }) {
    for (const it of [...o.items].sort((a, b) => a.varianteId - b.varianteId)) {
      await this.inv.mover(tx, { varianteId: it.varianteId, almacenId: o.almacenId, dReservado: -it.cantidad, tipo: 'liberacion_pago', refTipo: 'venta', refId: o.ventaId });
    }
  }

  /** Devolucion: las unidades vuelven al almacen del que salieron. */
  async reintegrar(tx: Tx, o: { ventaId: number; almacenId: number; varianteId: number; cantidad: number; usuarioId?: number | null; nota?: string }) {
    await this.inv.mover(tx, { varianteId: o.varianteId, almacenId: o.almacenId, dCantidad: o.cantidad, tipo: 'devolucion', refTipo: 'venta', refId: o.ventaId, usuarioId: o.usuarioId ?? null, nota: o.nota });
  }
}
