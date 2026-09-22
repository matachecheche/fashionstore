import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { ApiError, cargarToken, get, post, setToken } from './api';
import { COLORES } from './config';
import { leerCola, sincronizar } from './offline';

// ------------------------------------------------------------------ Sesion
export interface Usuario { id: number; nombre: string; email: string; rol: string; telefono?: string; documento?: string; preferencias?: any }
interface AuthCtx { usuario: Usuario | null; cargando: boolean; login(e: string, p: string): Promise<void>; registrar(d: any): Promise<void>; logout(): Promise<void>; refrescar(): Promise<void> }
const Auth = createContext<AuthCtx>(null as any); export const useAuth = () => useContext(Auth);

// ------------------------------------------------------------------ Avisos
const Toast = createContext<{ ok(t: string): void; error(t: string): void; info(t: string): void }>(null as any); export const useToast = () => useContext(Toast);

// ------------------------------------------------------------------ Datos publicos + sucursal elegida
interface DatosCtx { config: any; sucursales: any[]; sucursalId: number | null; setSucursalId(id: number | null): void; online: boolean; pendientes: number; recargarPendientes(): void }
const Datos = createContext<DatosCtx>(null as any); export const useDatos = () => useContext(Datos);

// ------------------------------------------------------------------ Carrito
export interface ItemCarrito { varianteId: number; productoId: number; nombre: string; talla: string; color: string; colorHex: string; precio: number; imagen?: string; cantidad: number }
interface CarritoCtx { items: ItemCarrito[]; agregar(i: Omit<ItemCarrito, 'cantidad'>, c?: number): void; cambiar(id: number, c: number): void; quitar(id: number): void; vaciar(): void; total: number; cantidad: number }
const Carrito = createContext<CarritoCtx>(null as any); export const useCarrito = () => useContext(Carrito);

export function Providers({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null); const [cargando, setCargando] = useState(true);
  const guardar = async (r: any) => { await AsyncStorage.setItem('fs_token', r.token); setToken(r.token); setUsuario(r.usuario); };
  const auth = useMemo<AuthCtx>(() => ({
    usuario, cargando,
    login: async (email, password) => guardar(await post('/auth/login', { email, password })),
    registrar: async (d) => guardar(await post('/auth/registro', d)),
    logout: async () => { await AsyncStorage.removeItem('fs_token'); setToken(null); setUsuario(null); },
    refrescar: async () => { try { setUsuario(await get('/auth/me')); } catch { /* sin sesion */ } },
  }), [usuario, cargando]);
  useEffect(() => { (async () => { const t = await cargarToken(); if (t) { try { setUsuario(await get('/auth/me')); } catch (e) { if (e instanceof ApiError && e.status === 401) { await AsyncStorage.removeItem('fs_token'); setToken(null); } } } setCargando(false); })(); }, []);

  // avisos
  const [aviso, setAviso] = useState<{ t: string; tipo: string } | null>(null); const op = useRef(new Animated.Value(0)).current;
  const mostrar = useCallback((tipo: string, t: string) => { setAviso({ t, tipo }); Animated.sequence([Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }), Animated.delay(2600), Animated.timing(op, { toValue: 0, duration: 250, useNativeDriver: true })]).start(); }, [op]);
  const toast = useMemo(() => ({ ok: (t: string) => mostrar('ok', t), error: (t: string) => mostrar('error', t), info: (t: string) => mostrar('info', t) }), [mostrar]);

  // config, sucursales, conexion y cola
  const [config, setConfig] = useState<any>(null); const [sucursales, setSucursales] = useState<any[]>([]); const [sucursalId, setSuc] = useState<number | null>(null);
  const [online, setOnline] = useState(true); const [pendientes, setPendientes] = useState(0);
  const recargarPendientes = useCallback(() => { leerCola().then((c) => setPendientes(c.length)); }, []);
  useEffect(() => { AsyncStorage.getItem('fs_sucursal').then((v) => v && setSuc(Number(v))); get('/config').then(setConfig).catch(() => {}); get('/sucursales').then((s) => { setSucursales(s); AsyncStorage.setItem('fs_sucursales', JSON.stringify(s)); }).catch(async () => { const c = await AsyncStorage.getItem('fs_sucursales'); if (c) setSucursales(JSON.parse(c)); }); recargarPendientes(); }, [recargarPendientes]);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)), []);
  useEffect(() => {   // al volver la conexion (y cada minuto) se sincroniza lo pendiente
    const ir = async () => { if (!usuario) return; const r = await sincronizar(); recargarPendientes(); if (r.enviados) toast.ok(`${r.enviados} operación(es) sincronizada(s)`); if (r.errores.length) toast.error(r.errores[0]); };
    if (online) ir(); const t = setInterval(() => online && ir(), 60000); return () => clearInterval(t);
  }, [online, usuario, recargarPendientes, toast]);
  const setSucursalId = useCallback((id: number | null) => { setSuc(id); id ? AsyncStorage.setItem('fs_sucursal', String(id)) : AsyncStorage.removeItem('fs_sucursal'); }, []);
  const datos = useMemo(() => ({ config, sucursales, sucursalId, setSucursalId, online, pendientes, recargarPendientes }), [config, sucursales, sucursalId, setSucursalId, online, pendientes, recargarPendientes]);

  // carrito persistente
  const [items, setItems] = useState<ItemCarrito[]>([]); const listo = useRef(false);
  useEffect(() => { AsyncStorage.getItem('fs_carrito').then((v) => { if (v) setItems(JSON.parse(v)); listo.current = true; }); }, []);
  useEffect(() => { if (listo.current) AsyncStorage.setItem('fs_carrito', JSON.stringify(items)); }, [items]);
  const carrito = useMemo<CarritoCtx>(() => ({
    items,
    agregar: (i, c = 1) => setItems((p) => { const e = p.find((x) => x.varianteId === i.varianteId); return e ? p.map((x) => (x === e ? { ...x, cantidad: x.cantidad + c } : x)) : [...p, { ...i, cantidad: c }]; }),
    cambiar: (id, c) => setItems((p) => (c <= 0 ? p.filter((x) => x.varianteId !== id) : p.map((x) => (x.varianteId === id ? { ...x, cantidad: c } : x)))),
    quitar: (id) => setItems((p) => p.filter((x) => x.varianteId !== id)), vaciar: () => setItems([]),
    total: items.reduce((s, i) => s + i.precio * i.cantidad, 0), cantidad: items.reduce((s, i) => s + i.cantidad, 0),
  }), [items]);

  const colorAviso = aviso?.tipo === 'ok' ? COLORES.ok : aviso?.tipo === 'error' ? COLORES.bad : COLORES.info;
  return (
    <Auth.Provider value={auth}><Toast.Provider value={toast}><Datos.Provider value={datos}><Carrito.Provider value={carrito}>
      {children}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, opacity: op, zIndex: 99 }}>
        {aviso && <View style={{ backgroundColor: colorAviso, padding: 13, borderRadius: 12 }}><Text style={{ color: '#fff', fontWeight: '600' }}>{aviso.t}</Text></View>}
      </Animated.View>
    </Carrito.Provider></Datos.Provider></Toast.Provider></Auth.Provider>
  );
}

/** Carga con cache: si no hay red devuelve lo ultimo guardado. */
export function useCarga<T>(fn: () => Promise<T>, deps: any[] = [], cada?: number) {
  const [data, setData] = useState<T | null>(null); const [cargando, setCargando] = useState(true); const [error, setError] = useState(''); const ref = useRef(fn); ref.current = fn;
  const recargar = useCallback(async (silencioso = false) => { if (!silencioso) setCargando(true); try { setData(await ref.current()); setError(''); } catch (e: any) { setError(e.message || 'Error'); } finally { setCargando(false); } }, []);
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, deps);
  useEffect(() => { if (!cada) return; const t = setInterval(() => recargar(true), cada); return () => clearInterval(t); }, [cada, recargar]);
  return { data, cargando, error, recargar };
}
