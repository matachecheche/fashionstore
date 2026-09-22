import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearSesion, get, post, setSesion, usuarioGuardado } from '../api/client';

// ------------------------------------------------------------------ Sesion
export interface Usuario { id: number; nombre: string; email: string; rol: 'admin' | 'encargado' | 'cajero' | 'proveedor' | 'cliente'; telefono?: string; documento?: string; sucursalId?: number | null; proveedorId?: number | null; preferencias?: any; sucursal?: any }
interface AuthCtx { usuario: Usuario | null; login(email: string, password: string): Promise<Usuario>; registrar(d: any): Promise<Usuario>; logout(): void; refrescar(): Promise<void>; esStaff: boolean }
const Auth = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Auth);

// ------------------------------------------------------------------ Avisos (toasts)
type Aviso = { id: number; tipo: 'ok' | 'error' | 'info'; texto: string };
interface ToastCtx { ok(t: string): void; error(t: string): void; info(t: string): void }
const Toast = createContext<ToastCtx>(null as any);
export const useToast = () => useContext(Toast);

// ------------------------------------------------------------------ Configuracion publica + sucursal elegida
interface Config { marca: string; pagos: { modo: 'sandbox' | 'produccion'; pasarelas: { id: string; nombre: string; metodos: string[]; internacional: boolean; real: boolean }[]; tipoCambioUsd: number }; reservas: { maxDias: number; graciaHoras: number } }
interface DatosCtx { config: Config | null; sucursales: any[]; sucursalId: number | null; setSucursalId(id: number | null): void }
const Datos = createContext<DatosCtx>(null as any);
export const useDatos = () => useContext(Datos);

// ------------------------------------------------------------------ Carrito (persistente en el navegador)
export interface ItemCarrito { varianteId: number; productoId: number; nombre: string; talla: string; color: string; colorHex: string; precio: number; imagen?: string; cantidad: number }
interface CarritoCtx { items: ItemCarrito[]; agregar(i: Omit<ItemCarrito, 'cantidad'>, cant?: number): void; cambiar(varianteId: number, cant: number): void; quitar(varianteId: number): void; vaciar(): void; total: number; cantidad: number }
const Carrito = createContext<CarritoCtx>(null as any);
export const useCarrito = () => useContext(Carrito);

export function Providers({ children }: { children: ReactNode }) {
  // sesion
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioGuardado());
  const login = useCallback(async (email: string, password: string) => {
    const r = await post('/auth/login', { email, password }); setSesion(r.token, r.usuario); setUsuario(r.usuario); return r.usuario as Usuario;
  }, []);
  const registrar = useCallback(async (d: any) => { const r = await post('/auth/registro', d); setSesion(r.token, r.usuario); setUsuario(r.usuario); return r.usuario as Usuario; }, []);
  const logout = useCallback(() => { clearSesion(); setUsuario(null); }, []);
  const refrescar = useCallback(async () => { try { const u = await get('/auth/me'); localStorage.setItem('fs_usuario', JSON.stringify(u)); setUsuario(u); } catch { /* sin sesion */ } }, []);
  useEffect(() => { const f = () => setUsuario(null); window.addEventListener('fs-logout', f); return () => window.removeEventListener('fs-logout', f); }, []);
  useEffect(() => { if (usuario) refrescar(); /* eslint-disable-next-line */ }, []);
  const auth = useMemo(() => ({ usuario, login, registrar, logout, refrescar, esStaff: !!usuario && ['admin', 'encargado', 'cajero'].includes(usuario.rol) }), [usuario, login, registrar, logout, refrescar]);

  // avisos
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const n = useRef(0);
  const push = useCallback((tipo: Aviso['tipo'], texto: string) => {
    const id = ++n.current; setAvisos((a) => [...a, { id, tipo, texto }]); setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);
  const toast = useMemo(() => ({ ok: (t: string) => push('ok', t), error: (t: string) => push('error', t), info: (t: string) => push('info', t) }), [push]);

  // config + sucursales
  const [config, setConfig] = useState<Config | null>(null);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSuc] = useState<number | null>(() => { const v = localStorage.getItem('fs_sucursal'); return v ? Number(v) : null; });
  useEffect(() => { get('/config').then(setConfig).catch(() => {}); get('/sucursales').then(setSucursales).catch(() => {}); }, []);
  const setSucursalId = useCallback((id: number | null) => { setSuc(id); id ? localStorage.setItem('fs_sucursal', String(id)) : localStorage.removeItem('fs_sucursal'); }, []);
  const datos = useMemo(() => ({ config, sucursales, sucursalId, setSucursalId }), [config, sucursales, sucursalId, setSucursalId]);

  // carrito
  const [items, setItems] = useState<ItemCarrito[]>(() => { try { return JSON.parse(localStorage.getItem('fs_carrito') || '[]'); } catch { return []; } });
  useEffect(() => { localStorage.setItem('fs_carrito', JSON.stringify(items)); }, [items]);
  const carrito = useMemo<CarritoCtx>(() => ({
    items,
    agregar: (i, cant = 1) => setItems((prev) => { const e = prev.find((x) => x.varianteId === i.varianteId); return e ? prev.map((x) => (x === e ? { ...x, cantidad: x.cantidad + cant, precio: i.precio } : x)) : [...prev, { ...i, cantidad: cant }]; }),
    cambiar: (id, c) => setItems((p) => (c <= 0 ? p.filter((x) => x.varianteId !== id) : p.map((x) => (x.varianteId === id ? { ...x, cantidad: c } : x)))),
    quitar: (id) => setItems((p) => p.filter((x) => x.varianteId !== id)),
    vaciar: () => setItems([]),
    total: items.reduce((s, i) => s + i.precio * i.cantidad, 0), cantidad: items.reduce((s, i) => s + i.cantidad, 0),
  }), [items]);

  return (
    <Auth.Provider value={auth}><Toast.Provider value={toast}><Datos.Provider value={datos}><Carrito.Provider value={carrito}>
      {children}
      <div className="toasts" aria-live="polite">{avisos.map((a) => <div key={a.id} className={`toast ${a.tipo}`}>{a.texto}</div>)}</div>
    </Carrito.Provider></Datos.Provider></Toast.Provider></Auth.Provider>
  );
}

/** Hook de carga con estado (datos, cargando, error, recargar). */
export function useCarga<T>(fn: () => Promise<T>, deps: any[] = [], opciones: { cada?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const fnRef = useRef(fn); fnRef.current = fn;
  const recargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try { setData(await fnRef.current()); setError(''); } catch (e: any) { setError(e.message || 'Error'); } finally { setCargando(false); }
  }, []);
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, deps);
  useEffect(() => { if (!opciones.cada) return; const t = setInterval(() => recargar(true), opciones.cada); return () => clearInterval(t); }, [opciones.cada, recargar]);
  return { data, cargando, error, recargar, setData };
}
export { api };
