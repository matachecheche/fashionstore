import { ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { bs } from '../lib/format';
import { img } from '../api/client';

export function Modal({ titulo, onClose, children, pie, ancho }: { titulo: string; onClose: () => void; children: ReactNode; pie?: ReactNode; ancho?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${ancho ? 'ancho' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header><h3>{titulo}</h3><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></header>
        <div className="cuerpo">{children}</div>
        {pie && <footer>{pie}</footer>}
      </div>
    </div>
  );
}

export const Badge = ({ clase = '', children }: { clase?: string; children: ReactNode }) => <span className={`badge ${clase}`}>{children}</span>;
export const Spinner = () => <div className="spinner" role="status" aria-label="Cargando" />;
export const Vacio = ({ icono = '🧺', children }: { icono?: string; children: ReactNode }) => <div className="vacio"><div className="ico">{icono}</div>{children}</div>;
export const Alerta = ({ tipo = 'error', children }: { tipo?: 'error' | 'info' | 'warn' | 'ok'; children: ReactNode }) => <div className={`alerta ${tipo}`}>{children}</div>;
export const Campo = ({ label, ayuda, children }: { label: string; ayuda?: string; children: ReactNode }) => <label className="campo"><span>{label}</span>{children}{ayuda && <small>{ayuda}</small>}</label>;

/** Ayuda contextual: pasa el mouse (o enfoca) para ver la explicacion (Parte III: tooltips). */
export const Tip = ({ texto, children }: { texto: string; children: ReactNode }) => <span className="tip" tabIndex={0}>{children}<span role="tooltip">{texto}</span></span>;

export function Tabs({ tabs, actual, onChange }: { tabs: { id: string; titulo: string }[]; actual: string; onChange: (id: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" className={`tab ${actual === t.id ? 'act' : ''}`} onClick={() => onChange(t.id)}>{t.titulo}</button>)}</div>;
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return <div className="alerta error row between"><span>{mensaje}</span>{reintentar && <button className="btn sm sec" onClick={reintentar}>Reintentar</button>}</div>;
}

export function Kpi({ valor, titulo, alerta }: { valor: ReactNode; titulo: string; alerta?: boolean }) {
  return <div className={`kpi ${alerta ? 'alerta-k' : ''}`}><div className="v">{valor}</div><div className="l">{titulo}</div></div>;
}

export function Barras({ datos, formato = bs }: { datos: { etiqueta: string; valor: number }[]; formato?: (n: number) => string }) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  if (!datos.length) return <div className="muted small">Sin datos en el período.</div>;
  return <div>{datos.map((d) => <div className="barra" key={d.etiqueta}><span title={d.etiqueta} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.etiqueta}</span><div className="pista"><div className="rel" style={{ width: `${(d.valor / max) * 100}%` }} /></div><b className="right">{formato(d.valor)}</b></div>)}</div>;
}

/** Grafico de area/lineas en SVG puro (sin librerias). */
export function LineaSvg({ puntos }: { puntos: { fecha: string; total: number }[] }) {
  const W = 640, H = 200, P = 28;
  const max = Math.max(...puntos.map((p) => p.total), 1);
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(puntos.length - 1, 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Ventas por día">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="#eee3e7" /><text x={2} y={y(max * f) + 4} fontSize="10" fill="#8a7d83">{Math.round(max * f)}</text></g>)}
        <path d={`${linea} L${x(puntos.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill="#7a2f4522" /><path d={linea} fill="none" stroke="#7a2f45" strokeWidth="2.5" strokeLinejoin="round" />
        {puntos.map((p, i) => <circle key={p.fecha} cx={x(i)} cy={y(p.total)} r={sel === i ? 6 : 3.5} fill="#7a2f45" onMouseEnter={() => setSel(i)} onMouseLeave={() => setSel(null)} />)}
        {puntos.filter((_, i) => i % Math.ceil(puntos.length / 6) === 0).map((p) => <text key={p.fecha} x={x(puntos.indexOf(p))} y={H - 8} fontSize="10" textAnchor="middle" fill="#8a7d83">{p.fecha.slice(5)}</text>)}
      </svg>
      {sel !== null && <div className="small" style={{ position: 'absolute', top: 0, right: 0, background: '#fff', border: '1px solid var(--linea)', borderRadius: 8, padding: '4px 10px' }}><b>{puntos[sel].fecha}</b> · {bs(puntos[sel].total)}</div>}
    </div>
  );
}

export function ProductoCard({ p, sucursalId }: { p: any; sucursalId?: number | null }) {
  const foto = p.imagen ?? p.imagenes?.find((i: any) => !i.esOverlayAr)?.url;
  const agotado = (p.stockTotal ?? p.disponible ?? 1) <= 0;
  const precio = p.precioVigente ?? p.precio;
  const lista = p.precioMenor ?? p.precio;
  const colores: { color: string; hex: string }[] = p.variantes
    ? [...new Map<string, any>(p.variantes.map((v: any) => [v.color, { color: v.color, hex: v.colorHex }])).values()]
    : (p.colores ?? []).map((c: string) => ({ color: c, hex: '#bbb' }));
  return (
    <Link to={`/producto/${p.id ?? p.productoId}`} className="prod" aria-label={p.nombre}>
      <div className="foto">
        {foto && <img src={img(foto)} alt={p.nombre} loading="lazy" />}
        {p.promocion > 0 && <span className="cinta">-{Math.round(p.promocion)}%</span>}
        {agotado && <span className="cinta agotado">Agotado</span>}
        {p.motivo && !/^(Lo más|Popular)/.test(p.motivo) && <span className="cinta der" title={p.motivo}>IA ✨</span>}
      </div>
      <div className="info">
        <span className="cat">{p.categoria}{p.temporada ? ` · ${p.temporada}` : ''}</span>
        <span className="nombre">{p.nombre}</span>
        <span className="precio">{bs(precio)}{p.promocion > 0 && <s>{bs(lista)}</s>}</span>
        {p.variantes && <div className="swatches">{colores.map((c) => <span key={c.color} className="swatch mini" style={{ background: c.hex }} title={c.color} />)}</div>}
        {p.motivo && !/^(Lo más|Popular)/.test(p.motivo) && <span className="small muted">{p.motivo}</span>}
      </div>
    </Link>
  );
}
