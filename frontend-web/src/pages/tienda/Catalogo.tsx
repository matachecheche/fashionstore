import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../../api/client';
import { useCarga, useDatos } from '../../context/App';
import { Campo, ErrorCarga, ProductoCard, Spinner, Vacio } from '../../components/ui';

// CU-03 Consultar catalogo y disponibilidad por sucursal
export default function Catalogo() {
  const [sp, setSp] = useSearchParams();
  const { sucursalId, setSucursalId, sucursales } = useDatos();
  const cats = useCarga(() => get('/categorias'), []);
  const temps = useCarga(() => get('/temporadas'), []);
  const cols = useCarga(() => get(`/colecciones${sp.get('temporadaId') ? `?temporadaId=${sp.get('temporadaId')}` : ''}`), [sp.get('temporadaId')]);
  const facets = useCarga(() => get('/productos/filtros'), []);
  const p = (k: string) => sp.get(k) ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const [q, setQ] = useState(p('q'));
  useEffect(() => setQ(p('q')), [sp.get('q')]);   // eslint-disable-line

  const params = new URLSearchParams(sp); if (sucursalId) params.set('sucursalId', String(sucursalId)); params.set('limite', '120');
  const lista = useCarga(() => get(`/productos?${params}`), [sp.toString(), sucursalId]);
  const tallas = (facets.data ?? []).filter((f: any) => f.tipo === 'talla'); const colores = (facets.data ?? []).filter((f: any) => f.tipo === 'color');
  const hayFiltros = [...sp.keys()].some((k) => k !== 'orden');

  return (
    <div className="catalogo">
      <aside className="card filtros stack" aria-label="Filtros">
        <div className="row between"><h3 style={{ margin: 0 }}>Filtros</h3>{hayFiltros && <button className="btn sm ghost" onClick={() => setSp({})}>Limpiar</button>}</div>
        <form onSubmit={(e) => { e.preventDefault(); set('q', q); }}><Campo label="Buscar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, material…" /></Campo></form>
        <Campo label="Sucursal (disponibilidad)"><select value={sucursalId ?? ''} onChange={(e) => setSucursalId(e.target.value ? Number(e.target.value) : null)}><option value="">Todas</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
        {sucursalId && <label className="check"><input type="checkbox" checked={p('soloDisponibles') === '1'} onChange={(e) => set('soloDisponibles', e.target.checked ? '1' : '')} />Solo con stock en esta sucursal</label>}
        <Campo label="Categoría"><select value={p('categoriaId')} onChange={(e) => set('categoriaId', e.target.value)}><option value="">Todas</option>{(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Temporada"><select value={p('temporadaId')} onChange={(e) => { set('temporadaId', e.target.value); set('coleccionId', ''); }}><option value="">Todas</option>{(temps.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Campo>
        <Campo label="Colección"><select value={p('coleccionId')} onChange={(e) => set('coleccionId', e.target.value)}><option value="">Todas</option>{(cols.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <div><div className="small" style={{ fontWeight: 600, color: 'var(--gris)', marginBottom: 6 }}>Talla</div><div className="row" style={{ gap: 6 }}>{tallas.map((t: any) => <button key={t.valor} className={`talla ${p('talla') === t.valor ? 'act' : ''}`} style={{ minWidth: 38, padding: '5px 9px' }} onClick={() => set('talla', p('talla') === t.valor ? '' : t.valor)}>{t.valor}</button>)}</div></div>
        <div><div className="small" style={{ fontWeight: 600, color: 'var(--gris)', marginBottom: 6 }}>Color</div><div className="swatches">{colores.map((c: any) => <button key={c.valor} className={`swatch ${p('color').toLowerCase() === c.valor.toLowerCase() ? 'act' : ''}`} style={{ background: c.hex }} title={c.valor} aria-label={c.valor} onClick={() => set('color', p('color').toLowerCase() === c.valor.toLowerCase() ? '' : c.valor)} />)}</div></div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}><Campo label="Precio mín."><input type="number" min={0} value={p('min')} onChange={(e) => set('min', e.target.value)} /></Campo><Campo label="Precio máx."><input type="number" min={0} value={p('max')} onChange={(e) => set('max', e.target.value)} /></Campo></div>
        <label className="check"><input type="checkbox" checked={p('temporadaActual') === '1'} onChange={(e) => set('temporadaActual', e.target.checked ? '1' : '')} />Solo temporada actual</label>
      </aside>
      <section>
        <div className="row between mb"><h2 style={{ margin: 0 }}>Catálogo {lista.data && <span className="muted small">({lista.data.length} prendas)</span>}</h2>
          <select value={p('orden')} onChange={(e) => set('orden', e.target.value)} style={{ width: 'auto' }} aria-label="Ordenar"><option value="">Más recientes</option><option value="precio_asc">Precio: menor a mayor</option><option value="precio_desc">Precio: mayor a menor</option><option value="nombre">Nombre A-Z</option></select></div>
        {lista.error && <ErrorCarga mensaje={lista.error} reintentar={() => lista.recargar()} />}
        {lista.cargando ? <Spinner /> : lista.data?.length ? <div className="grid-prod">{lista.data.map((x: any) => <ProductoCard key={x.id} p={x} />)}</div> : <Vacio icono="🔍">No encontramos prendas con esos filtros.<br /><button className="btn sec mt" onClick={() => setSp({})}>Quitar filtros</button></Vacio>}
      </section>
    </div>
  );
}
