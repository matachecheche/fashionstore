import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, post } from './api';

// Modo sin conexion: cache del catalogo + cola de operaciones (reservas y pedidos contra entrega) que se sincronizan solas.
const COLA = 'fs_cola';
export interface Pendiente { id: string; tipo: 'reserva' | 'venta'; cuerpo: any; creadaEn: number; etiqueta: string }

export const nuevoId = () => `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export async function leerCola(): Promise<Pendiente[]> { try { return JSON.parse((await AsyncStorage.getItem(COLA)) || '[]'); } catch { return []; } }
export async function encolar(p: Omit<Pendiente, 'creadaEn'>) { const c = await leerCola(); c.push({ ...p, creadaEn: Date.now() }); await AsyncStorage.setItem(COLA, JSON.stringify(c)); return c.length; }

export async function cacheSet(clave: string, valor: any) { try { await AsyncStorage.setItem(`fs_cache_${clave}`, JSON.stringify({ t: Date.now(), v: valor })); } catch { /* sin espacio */ } }
export async function cacheGet<T = any>(clave: string): Promise<T | null> { try { const r = await AsyncStorage.getItem(`fs_cache_${clave}`); return r ? JSON.parse(r).v : null; } catch { return null; } }

/** Envia lo pendiente. Los errores de negocio (sin stock, etc.) se descartan y se informan; los de red se reintentan luego. */
export async function sincronizar(): Promise<{ enviados: number; errores: string[]; pendientes: number }> {
  const cola = await leerCola(); const quedan: Pendiente[] = []; const errores: string[] = []; let enviados = 0;
  for (const p of cola) {
    try {
      if (p.tipo === 'reserva') await post('/reservas', { ...p.cuerpo, origenOfflineId: p.id });
      else await post('/ventas', { ...p.cuerpo, origenOfflineId: p.id });
      enviados++;
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 0) quedan.push(p);
      else if (e instanceof ApiError && e.status === 401) quedan.push(p);
      else errores.push(`${p.etiqueta}: ${e.message}`);
    }
  }
  await AsyncStorage.setItem(COLA, JSON.stringify(quedan));
  return { enviados, errores, pendientes: quedan.length };
}
