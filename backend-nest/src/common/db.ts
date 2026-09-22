import { Global, Injectable, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { types } from 'pg';
import { InventarioCore } from './inventario-core';
import { Notificador } from './notificador';
import { VentaStock } from './venta-stock';

// NUMERIC y BIGINT llegan como texto desde pg: se convierten a number; DATE se deja como 'YYYY-MM-DD'.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

export interface Tx {
  q<T = any>(sql: string, params?: any[]): Promise<T[]>;
  one<T = any>(sql: string, params?: any[]): Promise<T | null>;
}

/** Acceso a datos: TypeORM DataSource + QueryRunner con SQL parametrizado (transacciones atomicas). */
@Injectable()
export class Db implements Tx {
  constructor(private ds: DataSource) {}

  async q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const qr = this.ds.createQueryRunner();
    try {
      const r: any = await qr.query(sql, params, true);   // resultado estructurado: siempre devuelve las filas (records)
      return r.records as T[];
    } finally {
      await qr.release();
    }
  }

  async one<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.q<T>(sql, params);
    return rows[0] ?? null;
  }

  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const tx: Tx = {
      q: async (sql, params = []) => ((await qr.query(sql, params, true)) as any).records,
      one: async (sql, params = []) => (((await qr.query(sql, params, true)) as any).records[0] ?? null),
    };
    try {
      const out = await fn(tx);
      await qr.commitTransaction();
      return out;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async auditar(usuarioId: number | null, accion: string, entidad?: string, entidadId?: number, detalle?: any, tx: Tx = this) {
    await tx.q('INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1,$2,$3,$4,$5)', [
      usuarioId, accion, entidad ?? null, entidadId ?? null, detalle ? JSON.stringify(detalle) : null,
    ]);
  }
}

@Global()
@Module({ providers: [Db, InventarioCore, Notificador, VentaStock], exports: [Db, InventarioCore, Notificador, VentaStock] })
export class CommonModule {}
