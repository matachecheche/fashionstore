import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { get, post } from '../../api/client';
import { useToast } from '../../context/App';
import { Alerta, Spinner } from '../../components/ui';
import Comprobante from '../../components/Comprobante';
import { bs } from '../../lib/format';

// CU-08 Procesar pago electronico: seguimiento del pago (polling), QR, pasarela simulada y reintento con otro metodo
export default function Pago() {
  const { ref } = useParams(); const toast = useToast(); const nav = useNavigate();
  const [pago, setPago] = useState<any>(null); const [error, setError] = useState(''); const [ver, setVer] = useState(false); const [reintento, setReintento] = useState(false);

  useEffect(() => {
    let vivo = true;
    const cargar = () => get(`/pagos/ref/${ref}`).then((p) => { if (vivo) setPago(p); }).catch((e) => vivo && setError(e.message));
    cargar(); const t = setInterval(() => { if (!pago || pago.estado === 'PENDIENTE') cargar(); }, 3000);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line
  }, [ref, pago?.estado]);

  async function simular(a: 'aprobar' | 'rechazar') {
    try { await post(`/pagos/sandbox/${ref}/${a}`); const p = await get(`/pagos/ref/${ref}`); setPago(p); } catch (e: any) { toast.error(e.message); }
  }
  async function reintentar(metodoPago: string, pasarela?: string) {
    try { const r = await post(`/ventas/${pago.ventaId}/reintentar-pago`, { metodoPago, pasarela }); setPago(null); setReintento(false); nav(`/pago/${r.pago.referencia}`, { replace: true }); } catch (e: any) { toast.error(e.message); }
  }

  if (error) return <Alerta>{error}</Alerta>;
  if (!pago) return <Spinner />;
  const est = pago.estado;
  return (
    <div className="card auth-caja center stack" style={{ maxWidth: 520 }}>
      {est === 'APROBADO' && <><CheckCircle2 size={60} color="var(--ok)" style={{ margin: '0 auto' }} /><h2>¡Pago aprobado!</h2><p>Tu compra <b>{pago.comprobante}</b> por <b>{bs(pago.monto)}</b> fue confirmada. Ya descontamos las prendas del inventario.</p>
        <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => setVer(true)}>Ver comprobante</button><Link to="/mis-pedidos" className="btn sec">Mis pedidos</Link></div></>}
      {(est === 'RECHAZADO' || est === 'EXPIRADO') && <><XCircle size={60} color="var(--bad)" style={{ margin: '0 auto' }} /><h2>Pago {est === 'RECHAZADO' ? 'rechazado' : 'no completado'}</h2><Alerta>{pago.motivoRechazo || 'La pasarela no confirmó el pago.'}</Alerta>
        {pago.estadoVenta === 'pendiente_pago' ? <><p className="muted small">Tus prendas siguen apartadas por unos minutos. Puedes reintentar con otro método:</p>
          <div className="row" style={{ justifyContent: 'center' }}>{[['tarjeta', 'libelula', 'Tarjeta (Libélula)'], ['qr', 'libelula', 'QR'], ['tarjeta', 'stripe', 'Stripe'], ['paypal', 'paypal', 'PayPal']].map(([m, p, t]) => <button key={t} className="btn sm sec" onClick={() => reintentar(m, p)}>{t}</button>)}</div></> : <p className="muted">La compra fue cancelada y las prendas se liberaron. <Link to="/carrito">Volver al carrito</Link></p>}</>}
      {est === 'PENDIENTE' && <>
        <h2>Completa tu pago</h2><div style={{ font: '700 2rem var(--serif)', color: 'var(--marca)' }}>{bs(pago.monto)}</div>
        <div className="small muted">Pedido {pago.comprobante} · {pago.pasarelaNombre}</div>
        {pago.qrImagen && <div className="qr-box"><img src={pago.qrImagen} alt="Código QR de pago" /><div className="small muted mt">Escanea el QR con la app de tu banco</div></div>}
        {pago.checkoutUrl && !pago.sandbox && <a className="btn lg" href={pago.checkoutUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} />Abrir {pago.pasarelaNombre}</a>}
        {pago.sandbox && <div className="card flat stack" style={{ background: 'var(--info-bg)' }}><b>Pasarela simulada (demostración)</b><div className="small">Elige el resultado del pago:</div>
          <div className="row" style={{ justifyContent: 'center' }}><button className="btn verde" onClick={() => simular('aprobar')}>Simular pago aprobado</button><button className="btn peligro" onClick={() => simular('rechazar')}>Simular rechazo</button></div></div>}
        <div className="row" style={{ justifyContent: 'center', color: 'var(--gris)' }}><span className="spinner" style={{ margin: 0, width: 18, height: 18 }} /><span className="small">Esperando confirmación del pago…</span></div>
        <div className="small muted">Las prendas quedan apartadas para ti hasta que se agote el tiempo de pago.</div></>}
      {ver && <Comprobante ventaId={pago.ventaId} onClose={() => setVer(false)} />}
      {reintento && null}
    </div>
  );
}
