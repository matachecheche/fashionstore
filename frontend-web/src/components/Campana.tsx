import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { get, post } from '../api/client';
import { hace } from '../lib/format';
import { useAuth } from '../context/App';

// Campana de notificaciones (CU-04: se notifica a la sucursal y al cliente). Consulta cada 15 s.
export default function Campana() {
  const { usuario } = useAuth();
  const nav = useNavigate();
  const [n, setN] = useState(0);
  const [lista, setLista] = useState<any[]>([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cargarN = () => get('/notificaciones/contador').then((r) => setN(r.noLeidas)).catch(() => {});
  useEffect(() => { cargarN(); const t = setInterval(cargarN, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const staff = usuario && ['admin', 'encargado', 'cajero'].includes(usuario.rol);

  async function abrir() { setAbierto((a) => !a); if (!abierto) setLista(await get('/notificaciones')); }
  async function ir(x: any) {
    await post(`/notificaciones/${x.id}/leer`); cargarN(); setAbierto(false);
    if (x.referenciaTipo === 'reserva') nav(staff ? '/panel/reservas' : '/mis-reservas');
    else if (x.referenciaTipo === 'venta') nav(staff ? '/panel/ventas' : '/mis-pedidos');
    else if (x.referenciaTipo === 'propuesta') nav('/panel/propuestas');
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={abrir} aria-label={`Notificaciones (${n} sin leer)`}><Bell size={21} />{n > 0 && <span className="contador">{n > 9 ? '9+' : n}</span>}</button>
      {abierto && (
        <div className="menu-pop" style={{ width: 340, maxHeight: 420, overflowY: 'auto' }}>
          <div className="row between" style={{ padding: '10px 16px', borderBottom: '1px solid var(--linea)' }}><b>Notificaciones</b><button className="btn sm ghost" onClick={async () => { await post('/notificaciones/leer-todas'); setN(0); setLista(lista.map((x) => ({ ...x, leida: true }))); }}>Marcar todas</button></div>
          {lista.length === 0 && <div className="vacio" style={{ padding: 24 }}>Sin notificaciones</div>}
          {lista.map((x) => <button key={x.id} onClick={() => ir(x)} style={{ background: x.leida ? undefined : 'var(--marca-suave)', alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: '.88rem' }}>{x.titulo}</b><span className="small muted">{x.mensaje}</span><span className="small" style={{ color: 'var(--marca)' }}>{hace(x.creadaEn)}</span></button>)}
        </div>)}
    </div>
  );
}
