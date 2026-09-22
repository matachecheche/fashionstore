import { BadRequestException } from '@nestjs/common';

export const num = (v: any, def?: number) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const envNum = (k: string, def: number) => num(process.env[k], def) as number;

export function idParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('Identificador inválido');
  return n;
}

export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Distancia en km entre dos coordenadas (Haversine). */
export function distanciaKm(lat1?: number | null, lon1?: number | null, lat2?: number | null, lon2?: number | null): number | null {
  if ([lat1, lon1, lat2, lon2].some((x) => x === null || x === undefined)) return null;
  const R = 6371, rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2! - lat1!), dLon = rad(lon2! - lon1!);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1!)) * Math.cos(rad(lat2!)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/** CSV apto para Excel en espanol: separador ';' y BOM UTF-8 (asi los acentos y la ene se ven bien). */
export function toCsv(filas: any[], columnas: { campo: string; titulo: string }[]): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = columnas.map((c) => esc(c.titulo)).join(';');
  const cuerpo = filas.map((f) => columnas.map((c) => esc(f[c.campo])).join(';')).join('\r\n');
  return '\uFEFF' + cab + '\r\n' + cuerpo + '\r\n';
}

/** Fragmento SQL: mayor porcentaje de promocion vigente para un producto (alias p). */
export const SQL_PROMO = `COALESCE((SELECT MAX(pr.porcentaje) FROM promociones pr
   WHERE pr.activa AND current_date BETWEEN pr.fecha_inicio AND pr.fecha_fin
     AND (pr.producto_id = p.id OR pr.categoria_id = p.categoria_id OR pr.temporada_id = p.temporada_id
          OR (pr.producto_id IS NULL AND pr.categoria_id IS NULL AND pr.temporada_id IS NULL))), 0)`;
