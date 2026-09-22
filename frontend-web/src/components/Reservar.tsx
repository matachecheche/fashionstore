import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MapPin } from 'lucide-react';
import { Modal, Alerta, Campo } from './ui';
import { post } from '../api/client';
import { useAuth, useDatos, useToast } from '../context/App';
import { fechaHora, paraInput } from '../lib/format';

export interface ItemReserva { varianteId: number; cantidad: number; etiqueta: string }

// CU-04 Reservar prendas: sucursal + horario + validacion de disponibilidad (con sucursales alternativas si no hay stock)
export default function ReservarDialog({ items, sucursalInicial, onClose, onHecha }: { items: ItemReserva[]; sucursalInicial?: number | null; onClose: () => void; onHecha?: () => void }) {
  const { sucursales, config } = useDatos();
  const { usuario } = useAuth();
  const toast = useToast();
  const [sucursalId, setSucursalId] = useState<number | ''>(sucursalInicial ?? '');
  const manana = new Date(Date.now() + 3 * 3600000); manana.setMinutes(0, 0, 0);
  const [cuando, setCuando] = useState(paraInput(manana));
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [conflicto, setConflicto] = useState<any>(null);
  const [hecha, setHecha] = useState<any>(null);
  const max = new Date(Date.now() + (config?.reservas.maxDias ?? 7) * 86400000);

  async function enviar(suc = sucursalId) {
    if (!usuario) return setError('Inicia sesión para reservar.');
    if (!suc) return setError('Elige la sucursal donde quieres probarte las prendas.');
    setEnviando(true); setError(''); setConflicto(null);
    try {
      const r = await post('/reservas', { sucursalId: Number(suc), fechaHoraEstimada: new Date(cuando).toISOString(), items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })), notas: notas || undefined });
      setHecha(r); onHecha?.(); toast.ok(`Reserva ${r.codigo} confirmada`);
    } catch (e: any) {
      if (e.status === 409 && e.datos?.code === 'SIN_STOCK_SUCURSAL') setConflicto(e.datos); else setError(e.message);
    } finally { setEnviando(false); }
  }

  if (hecha) return (
    <Modal titulo="Reserva confirmada" onClose={onClose} pie={<><Link to="/mis-reservas" className="btn" onClick={onClose}>Ver mis reservas</Link><button className="btn sec" onClick={onClose}>Seguir comprando</button></>}>
      <div className="center stack"><CheckCircle2 size={54} color="var(--ok)" /><h2>¡Todo listo!</h2>
        <div className="card flat" style={{ background: 'var(--marca-suave)' }}><div className="small muted">Código de seguimiento</div><div style={{ font: '700 2rem var(--serif)', letterSpacing: '.08em', color: 'var(--marca)' }}>{hecha.codigo}</div><span className="badge warn">PENDIENTE</span></div>
        <p>Te esperamos en <b>{hecha.sucursal}</b> el <b>{fechaHora(hecha.fechaHoraEstimada)}</b>.<br /><span className="muted small">{hecha.sucursalDireccion}. Muestra tu código al llegar. Las prendas están bloqueadas para ti hasta {fechaHora(hecha.venceEn)}.</span></p></div>
    </Modal>);

  return (
    <Modal titulo="Reservar para probar en tienda" onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={enviando} onClick={() => enviar()}>{enviando ? 'Reservando…' : 'Confirmar reserva'}</button></>}>
      <div className="stack">
        <div className="card flat"><b>Prendas a reservar</b>{items.map((i) => <div key={i.varianteId} className="small">• {i.etiqueta} × {i.cantidad}</div>)}</div>
        <div className="form-grid">
          <Campo label="Sucursal"><select value={sucursalId} onChange={(e) => setSucursalId(e.target.value ? Number(e.target.value) : '')}><option value="">Elige una sucursal…</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} — {s.ciudad}</option>)}</select></Campo>
          <Campo label="Horario aproximado de atención" ayuda={`Hasta ${config?.reservas.maxDias ?? 7} días de anticipación`}><input type="datetime-local" value={cuando} min={paraInput(new Date())} max={paraInput(max)} onChange={(e) => setCuando(e.target.value)} /></Campo>
        </div>
        <Campo label="Notas (opcional)"><textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} placeholder="Ej.: llegaré con una amiga" /></Campo>
        {error && <Alerta>{error}</Alerta>}
        {conflicto && (
          <div className="stack">
            <Alerta tipo="warn">{conflicto.message}</Alerta>
            {conflicto.faltantes.map((f: any) => <div key={f.varianteId} className="small">✗ {f.producto} ({f.talla}/{f.color}): pediste {f.solicitado}, disponibles {f.disponible}</div>)}
            {conflicto.reposicionEstimada && <Alerta tipo="info">Fecha estimada de reposición en esa sucursal: <b>{conflicto.reposicionEstimada}</b></Alerta>}
            {conflicto.alternativas.map((a: any) => (
              <div key={a.sucursalId} className="row between card flat" style={{ padding: 12 }}>
                <div><b><MapPin size={14} /> {a.sucursal}</b> <span className="small muted">{a.ciudad}{a.distanciaKm != null ? ` · a ${a.distanciaKm} km` : ''}</span><div className="small muted">{a.direccion}</div></div>
                <button className="btn sm" onClick={() => { setSucursalId(a.sucursalId); enviar(a.sucursalId); }}>Reservar aquí</button>
              </div>))}
          </div>)}
      </div>
    </Modal>
  );
}
