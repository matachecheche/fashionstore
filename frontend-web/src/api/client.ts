// Cliente HTTP de la API comercial (NestJS). El token JWT se guarda en localStorage.
function apiPorDefecto(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  const { protocol, hostname } = window.location;
  const m = hostname.match(/^(.*)-(\d+)(\.app\.github\.dev)$/);   // GitHub Codespaces: ...-5173.app.github.dev -> ...-3000.app.github.dev
  return m ? `${protocol}//${m[1]}-3000${m[3]}` : `${protocol}//${hostname}:3000`;
}
export const API_URL = apiPorDefecto();

export class ApiError extends Error {
  constructor(public status: number, message: string, public datos?: any) { super(message); }
}

export const getToken = () => localStorage.getItem('fs_token');
export const setSesion = (token: string, usuario: any) => { localStorage.setItem('fs_token', token); localStorage.setItem('fs_usuario', JSON.stringify(usuario)); };
export const clearSesion = () => { localStorage.removeItem('fs_token'); localStorage.removeItem('fs_usuario'); };
export const usuarioGuardado = () => { try { return JSON.parse(localStorage.getItem('fs_usuario') || 'null'); } catch { return null; } };

function mensajeDe(datos: any, status: number): string {
  const m = datos?.message;
  if (Array.isArray(m)) return m.join('. ');
  if (typeof m === 'string') return m;
  if (status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  if (status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (status === 403) return 'No tienes permiso para esta operación.';
  return `Error ${status}`;
}

export async function api<T = any>(ruta: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(API_URL + '/api' + ruta, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token && opts.auth !== false ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw new ApiError(0, mensajeDe(null, 0)); }
  const texto = await res.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!res.ok) {
    if (res.status === 401 && token) { clearSesion(); window.dispatchEvent(new Event('fs-logout')); }
    throw new ApiError(res.status, mensajeDe(datos, res.status), datos);
  }
  return datos as T;
}

export const get = <T = any>(r: string) => api<T>(r);
export const post = <T = any>(r: string, body?: unknown) => api<T>(r, { method: 'POST', body: body ?? {} });
export const patch = <T = any>(r: string, body: unknown) => api<T>(r, { method: 'PATCH', body });
export const del = <T = any>(r: string) => api<T>(r, { method: 'DELETE' });

/** Las imagenes del catalogo vienen como rutas relativas (/assets/...): se completan con la URL de la API. */
export const img = (url?: string | null) => (!url ? '' : /^(https?:|data:)/.test(url) ? url : API_URL + url);

/** Descarga un archivo protegido (CSV) enviando el token. */
export async function descargar(ruta: string, nombre: string) {
  const res = await fetch(API_URL + '/api' + ruta, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'No se pudo descargar el archivo');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url);
}

export async function subirImagen(archivo: File): Promise<string> {
  const fd = new FormData(); fd.append('archivo', archivo);
  const res = await fetch(API_URL + '/api/archivos', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, Array.isArray(j.message) ? j.message.join('. ') : j.message || 'No se pudo subir la imagen');
  return j.url as string;
}
