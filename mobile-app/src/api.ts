import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(public status: number, message: string, public datos?: any) { super(message); }
}
let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };
export const cargarToken = async () => { token = await AsyncStorage.getItem('fs_token'); return token; };

function mensaje(datos: any, status: number) {
  const m = datos?.message;
  if (Array.isArray(m)) return m.join('. ');
  if (typeof m === 'string') return m;
  if (status === 0) return 'Sin conexión con el servidor. Revisa tu red y la dirección de la API.';
  if (status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  return `Error ${status}`;
}

export async function api<T = any>(ruta: string, opts: { method?: string; body?: unknown; timeout?: number } = {}): Promise<T> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opts.timeout ?? 20000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${ruta}`, {
      method: opts.method ?? 'GET', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw new ApiError(0, mensaje(null, 0)); } finally { clearTimeout(t); }
  const txt = await res.text(); let datos: any = null; try { datos = txt ? JSON.parse(txt) : null; } catch { datos = txt; }
  if (!res.ok) throw new ApiError(res.status, mensaje(datos, res.status), datos);
  return datos as T;
}
export const get = <T = any>(r: string) => api<T>(r);
export const post = <T = any>(r: string, body?: unknown) => api<T>(r, { method: 'POST', body: body ?? {} });
export const patch = <T = any>(r: string, body: unknown) => api<T>(r, { method: 'PATCH', body });

/** Las imagenes vienen como rutas relativas (/assets/...): se completan con la URL de la API. */
export const img = (u?: string | null) => (!u ? undefined : /^(https?:|data:|file:)/.test(u) ? u : API_URL + u);
export const bs = (n: number | null | undefined) => `Bs ${Number(n ?? 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaHora = (d?: string | null) => (d ? new Date(d).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
