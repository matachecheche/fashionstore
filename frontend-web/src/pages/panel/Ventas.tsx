import { useState } from 'react';
import { descargar, get, post } from '../../api/client';
import { useAuth, useCarga, useToast } from '../../context/App';
import { useSucursalPanel } from '../../components/panel';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner, Tabs, Vacio } from '../../components/ui';
import Comprobante from '../../components/Comprobante';
import { bs, CANAL, ESTADO_PAGO, ESTADO_VENTA, fechaHora, METODO } from '../../lib/format';

// Historial de ventas: comprobante, entrega contra entrega y devoluciones (reintegran stock)
export default function Ventas() {
  const { usuario } = useAuth(); const toast = useToast(); const { sucursalId, selector } = useSucursalPanel();
  const [tab, setTab] = useState('ventas'); const [f, setF] = useState({ q: '', estado: '', canal: '', desde: '', hasta: '' });
  const qs = new URLSearchParams({ ...(sucursalId ? { sucursalId: String(sucursalId) } : {}), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const { data, cargando, error, recargar } = useCarga(() => get(`/ventas?${qs}`), [qs], { cada: 30000 });
  const cajas = useCarga(() => (tab === 'cajas' ? get('/pos/cajas') : Promise.resolve([])), [tab]);
  const [ver, setVer] = useState<any>(null); const [comp, setComp] = useState<number | null>(null); const [dev, setDev] = useState<any>(null);
  const puedeHist = usuario && ['admin', 'encargado'].includes(usuario.rol);

  async function entregar(id: number) { try { await post(`/ventas/${id}/entregar`); toast.ok('Pedido marcado como entregado y pagado'); recargar(true); setVer(null); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Ventas</h1>{puedeHist && <button className="btn sm sec" onClick={() => descargar(`/reportes/export?tipo=ventas${sucursalId ? `&sucursalId=${sucursalId}` : ''}`, 'fashionstore-ventas.csv').catch((e) => toast.error(e.message))}>Exportar CSV</button>}</div>
      {puedeHist && <Tabs tabs={[{ id: 'ventas', titulo: 'Ventas' }, { id: 'cajas', titulo: 'Cajas (arqueos)' }]} actual={tab} onChange={setTab} />}
      {tab === 'ventas' ? <>
        <div className="row">{selector}<input placeholder="Comprobante o cliente" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} style={{ width: 200 }} />
          <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} style={{ width: 'auto' }}><option value="">Todos los estados</option>{Object.entries(ESTADO_VENTA).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select>
          <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} style={{ width: 'auto' }}><option value="">Todos los canales</option>{Object.entries(CANAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} style={{ width: 'auto' }} aria-label="Desde" /><input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} style={{ width: 'auto' }} aria-label="Hasta" /></div>
        {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
        {cargando && !data ? <Spinner /> : !data?.length ? <Vacio>No hay ventas con esos filtros.</Vacio> : (
          <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Comprobante</th><th>Fecha</th><th>Sucursal</th><th>Canal</th><th>Cliente</th><th>Pago</th><th>Estado</th><th className="right">Total</th></tr></thead><tbody>
            {data.map((v: any) => <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setVer(v)}><td><b>{v.comprobante}</b></td><td className="nowrap">{fechaHora(v.creadaEn)}</td><td>{v.sucursal}</td><td>{CANAL[v.canal]}</td><td>{v.cliente ?? <span className="muted">Mostrador</span>}</td><td>{METODO[v.metodoPago]}</td><td><Badge clase={ESTADO_VENTA[v.estado]?.clase}>{ESTADO_VENTA[v.estado]?.texto}</Badge></td><td className="right"><b>{bs(v.total)}</b></td></tr>)}</tbody></table></div>)}</> : (
        cajas.cargando ? <Spinner /> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Caja</th><th>Cajero</th><th>Sucursal</th><th>Apertura</th><th>Cierre</th><th className="right">Ventas</th><th className="right">Esperado</th><th className="right">Contado</th><th className="right">Diferencia</th></tr></thead><tbody>
          {(cajas.data ?? []).map((c: any) => <tr key={c.id}><td>#{c.id} <Badge clase={c.estado === 'abierta' ? 'ok' : ''}>{c.estado}</Badge></td><td>{c.cajero}</td><td>{c.sucursal}</td><td className="nowrap">{fechaHora(c.abiertaEn)}</td><td className="nowrap">{fechaHora(c.cerradaEn)}</td><td className="right">{bs(c.totalVentas)}</td><td className="right">{bs(c.montoEsperado)}</td><td className="right">{c.montoCierre === null ? '—' : bs(c.montoCierre)}</td><td className="right">{c.diferencia === null ? '—' : <Badge clase={c.diferencia === 0 ? 'ok' : 'warn'}>{bs(c.diferencia)}</Badge>}</td></tr>)}</tbody></table></div>)}

      {ver && <Modal ancho titulo={`Venta ${ver.comprobante}`} onClose={() => setVer(null)} pie={<>
        <button className="btn sec" onClick={() => setComp(ver.id)}>Comprobante</button>
        {ver.estado === 'pendiente' && <button className="btn verde" onClick={() => entregar(ver.id)}>Marcar entregada (cobrar)</button>}
        {['completada', 'entregada', 'devuelta_parcial'].includes(ver.estado) && <button className="btn peligro" onClick={() => { setDev(ver); setVer(null); }}>Registrar devolución</button>}</>}>
        <div className="grid2"><div className="stack"><div><span className="muted small">Fecha</span><br />{fechaHora(ver.creadaEn)}</div><div><span className="muted small">Sucursal · Canal</span><br />{ver.sucursal} · {CANAL[ver.canal]}</div><div><span className="muted small">Cliente</span><br />{ver.cliente ?? 'Mostrador'} {ver.reservaCodigo && <Badge clase="marca">Reserva {ver.reservaCodigo}</Badge>}</div></div>
          <div className="stack"><div><span className="muted small">Método</span><br />{METODO[ver.metodoPago]} {ver.pago && <Badge clase={ESTADO_PAGO[ver.pago.estado]?.clase}>{ESTADO_PAGO[ver.pago.estado]?.texto}</Badge>}</div><div><span className="muted small">Estado</span><br /><Badge clase={ESTADO_VENTA[ver.estado]?.clase}>{ESTADO_VENTA[ver.estado]?.texto}</Badge></div><div><span className="muted small">Total</span><br /><b style={{ fontSize: '1.4rem' }}>{bs(ver.total)}</b> {ver.descuento > 0 && <span className="small muted">(descuento {bs(ver.descuento)})</span>}</div></div></div>
        <div className="tabla-wrap mt"><table className="tabla"><thead><tr><th>Prenda</th><th>Variante</th><th>Cant.</th><th>Devuelto</th><th className="right">Precio</th></tr></thead><tbody>{ver.items.map((i: any) => <tr key={i.varianteId}><td>{i.producto}</td><td>{i.talla}/{i.color}</td><td>{i.cantidad}</td><td>{i.devuelto || '—'}</td><td className="right">{bs(i.precioUnit)}</td></tr>)}</tbody></table></div></Modal>}
      {dev && <Devolucion venta={dev} onClose={() => setDev(null)} onListo={() => { setDev(null); recargar(true); }} />}
      {comp && <Comprobante ventaId={comp} onClose={() => setComp(null)} />}
    </div>
  );
}

function Devolucion({ venta, onClose, onListo }: { venta: any; onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const [cant, setCant] = useState<Record<number, number>>({}); const [motivo, setMotivo] = useState(''); const [error, setError] = useState('');
  const monto = venta.items.reduce((s: number, i: any) => s + i.precioUnit * (cant[i.varianteId] ?? 0), 0);
  async function enviar() {
    const items = Object.entries(cant).filter(([, c]) => c > 0).map(([v, c]) => ({ varianteId: Number(v), cantidad: c }));
    if (!items.length) return setError('Indica al menos una prenda a devolver.');
    try { await post(`/ventas/${venta.id}/devolucion`, { items, motivo: motivo || undefined }); toast.ok('Devolución registrada: el stock fue reintegrado'); onListo(); } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo={`Devolución · ${venta.comprobante}`} onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn peligro" onClick={enviar}>Registrar devolución ({bs(monto)})</button></>}>
      <div className="stack">{venta.items.map((i: any) => { const max = i.cantidad - i.devuelto; return <div key={i.varianteId} className="row between card flat" style={{ padding: 10 }}><div><b>{i.producto}</b><div className="small muted">{i.talla}/{i.color} · {bs(i.precioUnit)} · vendidas {i.cantidad}, devueltas {i.devuelto}</div></div>
        <select disabled={max === 0} value={cant[i.varianteId] ?? 0} onChange={(e) => setCant({ ...cant, [i.varianteId]: Number(e.target.value) })} style={{ width: 70 }}>{Array.from({ length: max + 1 }, (_, n) => <option key={n}>{n}</option>)}</select></div>; })}
        <Campo label="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ej.: talla equivocada" /></Campo>{error && <Alerta>{error}</Alerta>}
        <div className="small muted">Las prendas vuelven al inventario de la tienda y el cliente recibe el aviso del reembolso.</div></div>
    </Modal>
  );
}
