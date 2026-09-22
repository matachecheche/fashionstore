import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Banknote, CreditCard, Globe, QrCode } from 'lucide-react';
import { get, img, post } from '../../api/client';
import { useAuth, useCarga, useCarrito, useDatos, useToast } from '../../context/App';
import { Alerta, Campo, Spinner } from '../../components/ui';
import { bs } from '../../lib/format';

// CU-07 Comprar desde web o app: metodo de pago (Libelula tarjeta/QR, Stripe, PayPal o contra entrega)
const METODOS = [
  { id: 'tarjeta:libelula', metodo: 'tarjeta', pasarela: 'libelula', icono: <CreditCard />, t: 'Tarjeta de crédito/débito', d: 'Pago en bolivianos con Libélula (bancos de Bolivia)' },
  { id: 'qr:libelula', metodo: 'qr', pasarela: 'libelula', icono: <QrCode />, t: 'QR interoperable', d: 'Escanea el QR desde la app de tu banco (Libélula)' },
  { id: 'tarjeta:stripe', metodo: 'tarjeta', pasarela: 'stripe', icono: <Globe />, t: 'Tarjeta internacional (Stripe)', d: 'Para pagos desde el extranjero (se cobra en USD)' },
  { id: 'paypal:paypal', metodo: 'paypal', pasarela: 'paypal', icono: <Globe />, t: 'PayPal', d: 'Paga con tu cuenta PayPal (se cobra en USD)' },
  { id: 'contra_entrega:', metodo: 'contra_entrega', pasarela: undefined, icono: <Banknote />, t: 'Pagar al retirar (contra entrega)', d: 'Reservamos las prendas y pagas en la sucursal' },
];

export default function Checkout() {
  const [sp] = useSearchParams(); const reservaId = Number(sp.get('reserva')) || null;
  const { items, total, vaciar } = useCarrito(); const { usuario } = useAuth(); const { sucursales, sucursalId, config } = useDatos(); const toast = useToast(); const nav = useNavigate();
  const reserva = useCarga(() => (reservaId ? get(`/reservas/${reservaId}`) : Promise.resolve(null)), [reservaId]);
  const [suc, setSuc] = useState<number | ''>(sucursalId ?? ''); const [metodo, setMetodo] = useState(METODOS[0].id); const [doc, setDoc] = useState(usuario?.documento ?? '');
  const [enviando, setEnviando] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!usuario) nav('/login', { state: { desde: '/checkout' } }); }, [usuario, nav]);
  // disponibilidad del carrito en cada sucursal: se preselecciona una que tenga TODO el pedido
  const disp = useCarga(async () => { const ids = [...new Set(items.map((i) => i.productoId))]; return (await Promise.all(ids.map((id) => get(`/productos/${id}/disponibilidad`)))).flat(); }, [items.length]);
  const tieneTodo = (sid: number) => !!disp.data && items.every((i) => (disp.data!.find((d: any) => d.varianteId === i.varianteId && d.sucursalId === sid)?.disponible ?? 0) >= i.cantidad);
  useEffect(() => {
    if (reservaId || !sucursales.length || !disp.data) return;
    if (suc && tieneTodo(Number(suc))) return;
    const elegida = (sucursalId && tieneTodo(sucursalId) ? sucursalId : sucursales.find((s) => tieneTodo(s.id))?.id) ?? sucursalId ?? sucursales[0].id;
    setSuc(elegida);   // eslint-disable-next-line
  }, [sucursales, disp.data, reservaId]);
  if (reservaId && reserva.cargando) return <Spinner />;
  const lineas = reservaId && reserva.data ? reserva.data.items.map((i: any) => ({ key: i.varianteId, nombre: i.producto, det: `${i.color} · ${i.talla}`, cant: i.cantidad, precio: i.precio, imagen: i.imagen })) : items.map((i) => ({ key: i.varianteId, nombre: i.nombre, det: `${i.color} · ${i.talla}`, cant: i.cantidad, precio: i.precio, imagen: i.imagen }));
  const suma = lineas.reduce((s: number, l: any) => s + l.precio * l.cant, 0);
  const m = METODOS.find((x) => x.id === metodo)!;
  const real = (id?: string) => config?.pagos.pasarelas.find((p) => p.id === id);
  if (!lineas.length) return <Alerta tipo="info">No hay nada para pagar. <Link to="/catalogo">Ir al catálogo</Link></Alerta>;

  async function pagar() {
    setError(''); setEnviando(true);
    try {
      const r = await post('/ventas', { canal: 'web', metodoPago: m.metodo, pasarela: m.pasarela, documentoCliente: doc || undefined, ...(reservaId ? { reservaId } : { sucursalId: Number(suc), items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })) }) });
      if (!reservaId) vaciar();
      toast.ok(`Compra ${r.venta.comprobante} registrada`);
      nav(`/pago/${r.pago.referencia}`, { replace: true });
    } catch (e: any) { setError(e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="detalle" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
      <div className="stack">
        <h1>Finalizar compra</h1>
        {reservaId && <Alerta tipo="info">Pagando la reserva <b>{reserva.data?.codigo}</b> en {reserva.data?.sucursal}.</Alerta>}
        {!reservaId && <div className="card"><h3>1. Sucursal de retiro</h3><select value={suc} onChange={(e) => setSuc(Number(e.target.value))} aria-label="Sucursal">{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} — {s.ciudad}{disp.data ? (tieneTodo(s.id) ? ' ✓ tiene todo tu pedido' : ' (sin stock completo)') : ''}</option>)}</select>
          {suc && disp.data && !tieneTodo(Number(suc)) && <div className="mt"><Alerta tipo="warn">Esa sucursal no tiene todas las prendas de tu pedido. Elige una marcada con ✓ o ajusta tu carrito.</Alerta></div>}
          <div className="small muted mt">Retirarás tus prendas en esta sucursal (se verifica el stock al pagar).</div></div>}
        <div className="card stack"><h3>{reservaId ? '1' : '2'}. Método de pago</h3>
          {config?.pagos.modo === 'sandbox' && <Alerta tipo="info">Modo demostración: las pasarelas están simuladas y no se cobra nada real.</Alerta>}
          {METODOS.map((x) => (
            <label key={x.id} className={`metodo ${metodo === x.id ? 'act' : ''}`}><input type="radio" name="metodo" checked={metodo === x.id} onChange={() => setMetodo(x.id)} /><span style={{ color: 'var(--marca)' }}>{x.icono}</span>
              <div><div className="t">{x.t} {x.pasarela && config?.pagos.modo === 'produccion' && !real(x.pasarela)?.real && <span className="badge warn">no configurada</span>}</div><div className="d">{x.d}</div></div></label>))}
        </div>
        <div className="card"><h3>{reservaId ? '2' : '3'}. Datos del comprobante (opcional)</h3><Campo label="NIT / CI"><input value={doc} onChange={(e) => setDoc(e.target.value)} maxLength={30} /></Campo></div>
      </div>
      <div className="card stack" style={{ position: 'sticky', top: 90 }}>
        <h3>Tu pedido</h3>
        {lineas.map((l: any) => <div key={l.key} className="row" style={{ flexWrap: 'nowrap' }}><img src={img(l.imagen)} alt="" style={{ width: 44, height: 58, objectFit: 'cover', borderRadius: 8 }} /><div className="grow"><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{l.nombre}</div><div className="small muted">{l.det} × {l.cant}</div></div><b>{bs(l.precio * l.cant)}</b></div>)}
        <hr style={{ border: 0, borderTop: '1px solid var(--linea)', width: '100%' }} />
        <div className="row between"><b>Total</b><b className="precio" style={{ fontSize: '1.3rem' }}>{bs(suma)}</b></div>
        {(m.pasarela === 'stripe' || m.pasarela === 'paypal') && config && <div className="small muted">≈ US$ {(suma / config.pagos.tipoCambioUsd).toFixed(2)} (TC {config.pagos.tipoCambioUsd})</div>}
        {error && <Alerta>{error}</Alerta>}
        <button className="btn lg block" disabled={enviando || (!reservaId && !suc)} onClick={pagar}>{enviando ? 'Procesando…' : m.metodo === 'contra_entrega' ? 'Confirmar pedido' : 'Continuar al pago'}</button>
        <div className="small muted">El precio final y el stock se validan en el servidor al confirmar.</div>
      </div>
    </div>
  );
}
