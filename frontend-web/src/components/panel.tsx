import { useEffect, useState } from 'react';
import { get } from '../api/client';
import { useAuth, useCarga, useDatos } from '../context/App';
import { Campo } from './ui';

/** Filtro de sucursal del panel: el administrador elige; encargado y cajero quedan fijos en la suya. */
export function useSucursalPanel() {
  const { usuario } = useAuth();
  const { sucursales } = useDatos();
  const [sel, setSel] = useState<number | ''>('');
  const fija = usuario && usuario.rol !== 'admin' ? usuario.sucursalId ?? null : null;
  const valor = fija ?? (sel === '' ? null : sel);
  const selector = fija ? null : (
    <select value={sel} onChange={(e) => setSel(e.target.value ? Number(e.target.value) : '')} style={{ width: 'auto' }} aria-label="Sucursal">
      <option value="">Todas las sucursales</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>);
  return { sucursalId: valor as number | null, selector, fija };
}

/** Busca un producto y elige una variante (talla/color). Devuelve la variante elegida. */
export function SelectorVariante({ onChange, sucursalId }: { onChange: (v: any | null) => void; sucursalId?: number | null }) {
  const [q, setQ] = useState(''); const [lista, setLista] = useState<any[]>([]); const [prod, setProd] = useState<any>(null); const [vid, setVid] = useState('');
  useEffect(() => { const t = setTimeout(() => { get(`/productos?limite=12${q ? `&q=${encodeURIComponent(q)}` : ''}`).then(setLista).catch(() => {}); }, 250); return () => clearTimeout(t); }, [q]);
  return (
    <div className="stack">
      <Campo label="Buscar producto"><input value={q} onChange={(e) => { setQ(e.target.value); setProd(null); setVid(''); onChange(null); }} placeholder="Nombre del producto…" /></Campo>
      {!prod && q && <div className="col" style={{ maxHeight: 180, overflowY: 'auto' }}>{lista.map((p) => <button type="button" key={p.id} className="btn sec sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setProd(p); setQ(p.nombre); }}>{p.nombre}</button>)}</div>}
      {prod && <Campo label="Variante (talla / color)"><select value={vid} onChange={(e) => { setVid(e.target.value); onChange(prod.variantes.find((v: any) => v.id === Number(e.target.value)) ? { ...prod.variantes.find((v: any) => v.id === Number(e.target.value)), producto: prod.nombre } : null); }}>
        <option value="">Elige…</option>{prod.variantes.map((v: any) => <option key={v.id} value={v.id}>{v.talla} / {v.color} — {v.sku}</option>)}</select></Campo>}
    </div>
  );
}

export function useAlmacenes(sucursalId?: number | null) {
  return useCarga(() => get(`/almacenes${sucursalId ? `?sucursalId=${sucursalId}` : ''}`), [sucursalId]);
}
