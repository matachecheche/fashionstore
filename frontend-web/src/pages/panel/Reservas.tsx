import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, img, post } from '../../api/client';
import { useAuth, useCarga, useToast } from '../../context/App';
import { useSucursalPanel } from '../../components/panel';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner, Tabs, Vacio } from '../../components/ui';
import Comprobante from '../../components/Comprobante';
import { PasosReserva } from '../tienda/MisReservas';
import { bs, ESTADO_RESERVA, fechaHora } from '../../lib/format';

const FILTROS = [{ id: 'activas', titulo: 'Activas' }, { id: 'PENDIENTE', titulo: 'Pendientes' }, { id: 'EN_ATENCION', titulo: 'En atención' }, { id: 'COMPLETADA', titulo: 'Completadas' }, { id: 'CANCELADA', titulo: 'Canceladas' }, { id: 'todas', titulo: 'Todas' }];

// CU-05 Gestionar recepcion de reservas (encargado de sucursal)
export default function Reservas() {
  const { usuario } = useAuth(); const toast = useToast(); const { sucursalId, selector } = useSucursalPanel();
  const [filtro, setFiltro] = useState('activas'); const [q, setQ] = useState('');
  const puedeCobrar = usuario && ['cajero', 'encargado'].includes(usuario.rol);
  const { data, cargando, error, recargar } = useCarga(() => get(`/reservas?${sucursalId ? `sucursalId=${sucursalId}&` : ''}${['PENDIENTE', 'EN_ATENCION', 'COMPLETADA', 'CANCELADA'].includes(filtro) ? `estado=${filtro}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`), [sucursalId, filtro, q], { cada: 15000 });
  const [cobrar, setCobrar] = useState<any>(null); const [cancelar, setCancelar] = useState<any>(null); const [motivo, setMotivo] = useState(''); const [comp, setComp] = useState<number | null>(null);
  const lista = (data ?? []).filter((r: any) => filtro !== 'activas' || ['PENDIENTE', 'EN_ATENCION'].includes(r.estado));

  async function accion(id: number, a: string, msg: string) { try { await post(`/reservas/${id}/${a}`, {}); toast.ok(msg); recargar(true); } catch (e: any) { toast.error(e.message); } }
  async function liberar() { try { const r = await post('/reservas/liberar-vencidas'); toast.ok(`${r.liberadas} reserva(s) vencida(s) liberada(s)`); recargar(true); } catch (e: any) { toast.error(e.message); } }
  async function confirmarCancel() { try { await post(`/reservas/${cancelar.id}/cancelar`, { motivo }); toast.ok('Reserva cancelada'); setCancelar(null); setMotivo(''); recargar(true); } catch (e: any) { toast.error(e.message); } }

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Reservas</h1><div className="row">{selector}<input placeholder="Buscar código o cliente" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />{usuario?.rol !== 'cajero' && <button className="btn sec sm" onClick={liberar} title="Cancela las pendientes cuya hora límite pasó y devuelve el stock">Liberar vencidas</button>}</div></div>
      <Tabs tabs={FILTROS} actual={filtro} onChange={setFiltro} />
      {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {cargando && !data ? <Spinner /> : !lista.length ? <Vacio icono="📅">No hay reservas en esta vista.</Vacio> : (
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(420px,1fr))' }}>{lista.map((r: any) => {
          const vencida = r.estado === 'PENDIENTE' && new Date(r.venceEn) < new Date();
          return (
            <div key={r.id} className={`reserva-card ${vencida ? 'venc' : ''}`}>
              <div className="row between"><div><b style={{ font: '700 1.15rem var(--serif)', letterSpacing: '.05em', color: 'var(--marca)' }}>{r.codigo}</b> <Badge clase={ESTADO_RESERVA[r.estado].clase}>{ESTADO_RESERVA[r.estado].texto}</Badge>{r.preparadaEn && r.estado === 'PENDIENTE' && <> <Badge clase="ok">Preparada</Badge></>}{vencida && <> <Badge clase="bad">Vencida</Badge></>}</div><b>{bs(r.total)}</b></div>
              <div className="small"><b>{r.cliente}</b> {r.clienteTelefono && <span className="muted">· {r.clienteTelefono}</span>}<br /><span className="muted">{r.sucursal} · Llega: <b>{fechaHora(r.fechaHoraEstimada)}</b> · Vence: {fechaHora(r.venceEn)}</span></div>
              {r.notas && <div className="small muted">📝 {r.notas.replace(/\[off:[^\]]+\]/g, '')}</div>}
              <PasosReserva r={r} />
              <div className="reserva-items">{r.items.map((i: any) => <div className="r-item" key={i.varianteId}><img src={img(i.imagen)} alt="" /><div><b>{i.producto}</b><br />{i.color} · {i.talla} × {i.cantidad}</div></div>)}</div>
              {r.motivoCancelacion && <div className="small muted">Motivo: {r.motivoCancelacion}</div>}
              <div className="row">
                {r.estado === 'PENDIENTE' && !r.preparadaEn && <button className="btn sm" onClick={() => accion(r.id, 'preparar', 'Marcada como preparada: se avisó al cliente')}>Marcar como preparada</button>}
                {r.estado === 'PENDIENTE' && <button className="btn sm sec" onClick={() => accion(r.id, 'confirmar-atencion', 'Cliente en atención')}>Confirmar atención</button>}
                {['PENDIENTE', 'EN_ATENCION'].includes(r.estado) && puedeCobrar && <button className="btn sm verde" onClick={() => setCobrar(r)}>Cobrar</button>}
                {r.estado === 'EN_ATENCION' && <button className="btn sm sec" onClick={() => accion(r.id, 'finalizar', 'Reserva finalizada sin compra: stock liberado')}>Finalizar sin compra</button>}
                {['PENDIENTE', 'EN_ATENCION'].includes(r.estado) && <button className="btn sm peligro" onClick={() => setCancelar(r)}>Cancelar</button>}
                {r.ventaId && <button className="btn sm ghost" onClick={() => setComp(r.ventaId)}>Ver comprobante</button>}
              </div>
            </div>); })}</div>)}
      {cobrar && <CobrarReserva reserva={cobrar} onClose={() => setCobrar(null)} onListo={(ventaId) => { setCobrar(null); recargar(true); setComp(ventaId); }} />}
      {cancelar && <Modal titulo={`Cancelar ${cancelar.codigo}`} onClose={() => setCancelar(null)} pie={<><button className="btn sec" onClick={() => setCancelar(null)}>Volver</button><button className="btn peligro" onClick={confirmarCancel}>Cancelar reserva</button></>}>
        <p>Se liberarán las prendas bloqueadas y se avisará al cliente.</p><Campo label="Motivo (opcional)"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></Campo></Modal>}
      {comp && <Comprobante ventaId={comp} onClose={() => setComp(null)} />}
    </div>
  );
}

// Convierte la reserva en venta presencial: el cliente se lleva todo o solo parte de lo reservado
function CobrarReserva({ reserva, onClose, onListo }: { reserva: any; onClose: () => void; onListo: (ventaId: number) => void }) {
  const toast = useToast();
  const caja = useCarga(() => get('/pos/caja/activa'), []);
  const [cant, setCant] = useState<Record<number, number>>(Object.fromEntries(reserva.items.map((i: any) => [i.varianteId, i.cantidad])));
  const [metodo, setMetodo] = useState('efectivo'); const [doc, setDoc] = useState(''); const [enviando, setEnviando] = useState(false); const [error, setError] = useState('');
  const total = reserva.items.reduce((s: number, i: any) => s + i.precio * (cant[i.varianteId] ?? 0), 0);
  async function cobrar() {
    const items = reserva.items.filter((i: any) => cant[i.varianteId] > 0).map((i: any) => ({ varianteId: i.varianteId, cantidad: cant[i.varianteId] }));
    if (!items.length) return setError('Elige al menos una prenda. Si no compra nada, usa «Finalizar sin compra».');
    setEnviando(true); setError('');
    try { const r = await post('/ventas', { canal: 'pos', reservaId: reserva.id, items, metodoPago: metodo, documentoCliente: doc || undefined }); toast.ok(`Venta ${r.venta.comprobante} registrada`); onListo(r.venta.id); } catch (e: any) { setError(e.message); } finally { setEnviando(false); }
  }
  return (
    <Modal titulo={`Cobrar reserva ${reserva.codigo}`} onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn verde" disabled={enviando || !caja.data} onClick={cobrar}>{enviando ? 'Cobrando…' : `Cobrar ${bs(total)}`}</button></>}>
      {caja.cargando ? <Spinner /> : !caja.data ? <Alerta tipo="warn">Para cobrar necesitas una caja abierta. <Link to="/panel/pos">Abrir caja en el punto de venta</Link></Alerta> : (
        <div className="stack">
          <div className="small muted">Cliente: <b>{reserva.cliente}</b>. Las unidades que no lleve vuelven al stock.</div>
          {reserva.items.map((i: any) => <div key={i.varianteId} className="row between card flat" style={{ padding: 10 }}><div><b>{i.producto}</b><div className="small muted">{i.color} · {i.talla} · {bs(i.precio)} c/u</div></div>
            <div className="row">Se lleva:<select value={cant[i.varianteId]} onChange={(e) => setCant({ ...cant, [i.varianteId]: Number(e.target.value) })} style={{ width: 70 }}>{Array.from({ length: i.cantidad + 1 }, (_, n) => <option key={n}>{n}</option>)}</select></div></div>)}
          <div className="form-grid"><Campo label="Método de pago"><select value={metodo} onChange={(e) => setMetodo(e.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta física</option><option value="qr">QR</option><option value="transferencia">Transferencia</option></select></Campo><Campo label="NIT / CI (opcional)"><input value={doc} onChange={(e) => setDoc(e.target.value)} /></Campo></div>
          {error && <Alerta>{error}</Alerta>}</div>)}
    </Modal>
  );
}
