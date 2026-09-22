import { useCallback, useEffect, useState } from 'react';
import { Minus, Plus, Search, Trash2, WifiOff } from 'lucide-react';
import { ApiError, get, img, post } from '../../api/client';
import { useAuth, useCarga, useToast } from '../../context/App';
import { Alerta, Badge, Campo, Modal, Spinner } from '../../components/ui';
import Comprobante from '../../components/Comprobante';
import { bs, METODO } from '../../lib/format';

interface Linea { varianteId: number; productoId: number; nombre: string; talla: string; color: string; colorHex: string; precioMenor: number; precioMayor: number; cantidad: number; max: number }
const COLA = 'fs_cola_pos'; const CACHE = 'fs_cache_pos';
const leerCola = (): any[] => { try { return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch { return []; } };

// CU-09 Registrar venta presencial (cajero): caja, busqueda de prendas, cobro con efectivo/tarjeta/QR/transferencia y comprobante.
// Funciona sin internet: las ventas se guardan en el navegador y se sincronizan solas al volver la conexion (idempotente por origenOfflineId).
export default function POS() {
  const { usuario } = useAuth(); const toast = useToast();
  const caja = useCarga(() => get('/pos/caja/activa'), []);
  const [q, setQ] = useState(''); const [prods, setProds] = useState<any[]>([]); const [offline, setOffline] = useState(!navigator.onLine);
  const [ticket, setTicket] = useState<Linea[]>([]); const [tipoVenta, setTipoVenta] = useState<'menor' | 'mayor'>('menor'); const [reserva, setReserva] = useState<any>(null); const [codigo, setCodigo] = useState('');
  const [elegir, setElegir] = useState<any>(null); const [cobrando, setCobrando] = useState(false); const [comp, setComp] = useState<number | null>(null); const [cola, setCola] = useState(leerCola().length);
  const [abrir, setAbrir] = useState(''); const [cerrar, setCerrar] = useState(false);
  const sucursalId = caja.data?.sucursalId;

  // catalogo con stock de ESTA sucursal (con cache para trabajar sin conexion)
  useEffect(() => {
    if (!sucursalId) return;
    const t = setTimeout(() => get(`/productos?sucursalId=${sucursalId}&limite=60${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => { setProds(r); setOffline(false); if (!q) localStorage.setItem(CACHE, JSON.stringify(r)); }).catch((e) => {
      if (e.status === 0) { setOffline(true); const c: any[] = JSON.parse(localStorage.getItem(CACHE) || '[]'); setProds(q ? c.filter((p) => p.nombre.toLowerCase().includes(q.toLowerCase())) : c); }
    }), 250);
    return () => clearTimeout(t);
  }, [q, sucursalId]);

  const sincronizar = useCallback(async () => {
    const pendientes = leerCola(); if (!pendientes.length || !navigator.onLine) return;
    try {
      const res: any[] = await post('/ventas/sincronizar', pendientes);
      const fallidas = pendientes.filter((p) => !res.find((r) => r.origenOfflineId === p.origenOfflineId)?.ok);
      localStorage.setItem(COLA, JSON.stringify(fallidas)); setCola(fallidas.length);
      const ok = res.filter((r) => r.ok).length; if (ok) toast.ok(`${ok} venta(s) sincronizada(s)`);
      const malas = res.filter((r) => !r.ok); if (malas.length) toast.error(`${malas.length} venta(s) no se pudieron sincronizar: ${malas[0].error}`);
    } catch { /* sigue sin conexion */ }
  }, [toast]);
  useEffect(() => { const on = () => { setOffline(false); sincronizar(); }; const off = () => setOffline(true); window.addEventListener('online', on); window.addEventListener('offline', off); sincronizar(); const t = setInterval(sincronizar, 30000); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); }; }, [sincronizar]);

  const precio = (l: Linea) => (tipoVenta === 'mayor' ? l.precioMayor : l.precioMenor);
  const total = ticket.reduce((s, l) => s + precio(l) * l.cantidad, 0);
  function agregar(p: any, v: any) {
    setTicket((t) => { const e = t.find((x) => x.varianteId === v.id); if (e) return t.map((x) => (x === e ? { ...x, cantidad: Math.min(x.cantidad + 1, x.max) } : x)); return [...t, { varianteId: v.id, productoId: p.id, nombre: p.nombre, talla: v.talla, color: v.color, colorHex: v.colorHex, precioMenor: p.precioVigente, precioMayor: p.precioMayor ?? p.precioMenor, cantidad: 1, max: v.disponible }]; });
    setElegir(null);
  }
  async function buscarReserva() {
    try {
      const r = await get(`/reservas/codigo/${encodeURIComponent(codigo)}`);
      if (!['PENDIENTE', 'EN_ATENCION'].includes(r.estado)) return toast.error(`La reserva está ${r.estado}`);
      setReserva(r); setTipoVenta('menor');
      setTicket(r.items.map((i: any) => ({ varianteId: i.varianteId, productoId: i.productoId, nombre: i.producto, talla: i.talla, color: i.color, colorHex: i.colorHex, precioMenor: i.precio, precioMayor: i.precio, cantidad: i.cantidad, max: i.cantidad })));
      toast.info(`Reserva de ${r.cliente} cargada. Quita las prendas que no se lleva.`);
    } catch (e: any) { toast.error(e.message); }
  }
  const nuevo = () => { setTicket([]); setReserva(null); setCodigo(''); setTipoVenta('menor'); };

  async function abrirCaja() { try { await post('/pos/caja/abrir', { montoApertura: Number(abrir) || 0 }); toast.ok('Caja abierta'); caja.recargar(); } catch (e: any) { toast.error(e.message); } }

  if (caja.cargando) return <Spinner />;
  if (!caja.data) return (
    <div className="card auth-caja stack"><h2>Abrir caja</h2><p className="muted">Para registrar ventas debes abrir tu caja indicando el efectivo con el que inicias.</p>
      {!usuario?.sucursalId && <Alerta tipo="warn">Tu usuario no tiene sucursal asignada. Pide al administrador que te asigne una.</Alerta>}
      <Campo label="Monto inicial (Bs)"><input type="number" min={0} step="0.5" value={abrir} onChange={(e) => setAbrir(e.target.value)} autoFocus /></Campo>
      <button className="btn lg" disabled={!usuario?.sucursalId} onClick={abrirCaja}>Abrir caja</button></div>);

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Punto de venta</h1>
        <div className="row">{offline && <Badge clase="warn"><WifiOff size={12} /> Sin conexión</Badge>}{cola > 0 && <Badge clase="info">{cola} venta(s) por sincronizar</Badge>}
          <span className="small muted">Caja #{caja.data.id} · Efectivo esperado <b>{bs(caja.data.montoEsperado)}</b> · Ventas {bs(caja.data.totalVentas)}</span><button className="btn sm sec" onClick={() => setCerrar(true)}>Cerrar caja</button></div></div>
      <div className="pos">
        <div className="stack">
          <div className="row"><div className="buscador" style={{ maxWidth: 'none', flex: 1 }}><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar prenda por nombre o código…" aria-label="Buscar prenda" /></div>
            <div className="row"><input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código RES-XXXXXX" style={{ width: 170 }} aria-label="Código de reserva" /><button className="btn sec" disabled={!codigo} onClick={buscarReserva}>Buscar reserva</button></div></div>
          <div className="pos-prods">{prods.map((p) => { const agot = p.stockTotal <= 0; return (
            <button key={p.id} className="pos-prod" disabled={agot} style={agot ? { opacity: .5 } : {}} onClick={() => setElegir(p)}><img src={img(p.imagenes.find((i: any) => !i.esOverlayAr)?.url)} alt="" /><div><div style={{ fontWeight: 600, fontSize: '.85rem' }}>{p.nombre}</div><div className="precio" style={{ fontSize: '.9rem' }}>{bs(p.precioVigente)}</div><div className="small muted">{agot ? 'Agotado' : `${p.stockTotal} en tienda`}</div></div></button>); })}
            {!prods.length && <div className="muted">Sin resultados.</div>}</div>
        </div>
        <div className="card ticket stack">
          <div className="row between"><h3 style={{ margin: 0 }}>Ticket</h3>{ticket.length > 0 && <button className="btn sm ghost" onClick={nuevo}>Limpiar</button>}</div>
          {reserva && <Alerta tipo="info">Reserva <b>{reserva.codigo}</b> · {reserva.cliente}</Alerta>}
          <div className="row"><span className="small muted">Tipo de venta:</span><label className="check"><input type="radio" checked={tipoVenta === 'menor'} onChange={() => setTipoVenta('menor')} />Por menor</label><label className="check"><input type="radio" disabled={!!reserva} checked={tipoVenta === 'mayor'} onChange={() => setTipoVenta('mayor')} />Por mayor</label></div>
          {!ticket.length ? <div className="muted small center" style={{ padding: 20 }}>Selecciona prendas para empezar</div> : ticket.map((l) => (
            <div key={l.varianteId} className="row between" style={{ flexWrap: 'nowrap', borderBottom: '1px solid var(--linea)', paddingBottom: 8 }}>
              <div><div style={{ fontWeight: 600, fontSize: '.88rem' }}>{l.nombre}</div><div className="small muted row" style={{ gap: 5 }}><span className="swatch mini" style={{ background: l.colorHex }} />{l.color} · {l.talla} · {bs(precio(l))}</div></div>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}><button className="icon-btn" onClick={() => setTicket((t) => t.map((x) => (x === l ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x)))} aria-label="Menos"><Minus size={14} /></button><b>{l.cantidad}</b><button className="icon-btn" onClick={() => setTicket((t) => t.map((x) => (x === l ? { ...x, cantidad: Math.min(x.max, x.cantidad + 1) } : x)))} aria-label="Más"><Plus size={14} /></button><button className="icon-btn" onClick={() => setTicket((t) => t.filter((x) => x !== l))} aria-label="Quitar"><Trash2 size={15} /></button></div></div>))}
          <div className="row between"><b>Total</b><b className="precio" style={{ fontSize: '1.5rem' }}>{bs(total)}</b></div>
          {tipoVenta === 'menor' && !reserva && <div className="small muted">Las promociones vigentes se aplican al cobrar.</div>}
          <button className="btn lg verde block" disabled={!ticket.length} onClick={() => setCobrando(true)}>Cobrar</button>
        </div>
      </div>
      {elegir && <Modal titulo={elegir.nombre} onClose={() => setElegir(null)}><div className="stack"><div className="small muted">Elige talla y color (stock de tu tienda):</div>
        {[...new Set<string>(elegir.variantes.map((v: any) => v.color))].map((c) => <div key={c}><b>{c}</b><div className="row mt" style={{ gap: 8 }}>{elegir.variantes.filter((v: any) => v.color === c).map((v: any) => <button key={v.id} className="talla" disabled={v.disponible <= 0} onClick={() => agregar(elegir, v)} title={`${v.disponible} disponibles`}>{v.talla} <span className="small muted">({v.disponible})</span></button>)}</div></div>)}</div></Modal>}
      {cobrando && <Cobro total={total} onClose={() => setCobrando(false)} onCobrar={async (metodo, doc) => {
        const cuerpo = { canal: 'pos', metodoPago: metodo, tipoVenta, documentoCliente: doc || undefined, origenOfflineId: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...(reserva ? { reservaId: reserva.id } : {}), items: ticket.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })) };
        try { const r = await post('/ventas', cuerpo); setCobrando(false); nuevo(); caja.recargar(true); toast.ok(`Venta ${r.venta.comprobante} registrada`); setComp(r.venta.id); }
        catch (e: any) {
          if (e instanceof ApiError && e.status === 0) { localStorage.setItem(COLA, JSON.stringify([...leerCola(), cuerpo])); setCola(leerCola().length); setCobrando(false); nuevo(); toast.info('Sin conexión: la venta se guardó y se sincronizará sola.'); }
          else throw e;
        }
      }} />}
      {comp && <Comprobante ventaId={comp} onClose={() => setComp(null)} />}
      {cerrar && <CerrarCaja caja={caja.data} onClose={() => setCerrar(false)} onHecho={() => { setCerrar(false); caja.recargar(); }} />}
    </div>
  );
}

function Cobro({ total, onClose, onCobrar }: { total: number; onClose: () => void; onCobrar: (m: string, doc: string) => Promise<void> }) {
  const [metodo, setMetodo] = useState('efectivo'); const [recibido, setRecibido] = useState(''); const [doc, setDoc] = useState(''); const [error, setError] = useState(''); const [enviando, setEnviando] = useState(false);
  const cambio = Number(recibido) - total;
  async function ir() { setEnviando(true); setError(''); try { await onCobrar(metodo, doc); } catch (e: any) { setError(e.message); setEnviando(false); } }
  return (
    <Modal titulo="Cobrar" onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Volver</button><button className="btn verde" disabled={enviando || (metodo === 'efectivo' && recibido !== '' && cambio < 0)} onClick={ir}>{enviando ? 'Registrando…' : 'Confirmar venta'}</button></>}>
      <div className="stack"><div className="center"><div className="small muted">Total a cobrar (antes de promociones)</div><div style={{ font: '700 2.2rem var(--serif)', color: 'var(--marca)' }}>{bs(total)}</div></div>
        <div className="row" style={{ justifyContent: 'center' }}>{['efectivo', 'tarjeta', 'qr', 'transferencia'].map((m) => <button key={m} className={`btn ${metodo === m ? '' : 'sec'}`} onClick={() => setMetodo(m)}>{METODO[m]}</button>)}</div>
        {metodo === 'efectivo' && <div className="form-grid"><Campo label="Efectivo recibido (Bs)"><input type="number" min={0} value={recibido} onChange={(e) => setRecibido(e.target.value)} autoFocus /></Campo><div><div className="small muted">Cambio</div><div style={{ font: '700 1.6rem var(--serif)', color: cambio < 0 ? 'var(--bad)' : 'var(--ok)' }}>{recibido ? bs(Math.max(cambio, 0)) : '—'}</div></div></div>}
        <Campo label="NIT / CI para el comprobante (opcional)"><input value={doc} onChange={(e) => setDoc(e.target.value)} /></Campo>{error && <Alerta>{error}</Alerta>}</div>
    </Modal>
  );
}

function CerrarCaja({ caja, onClose, onHecho }: { caja: any; onClose: () => void; onHecho: () => void }) {
  const [monto, setMonto] = useState(''); const [res, setRes] = useState<any>(null); const toast = useToast();
  async function cerrar() { try { setRes(await post('/pos/caja/cerrar', { montoCierre: Number(monto) })); } catch (e: any) { toast.error(e.message); } }
  return (
    <Modal titulo="Cerrar caja" onClose={res ? onHecho : onClose} pie={res ? <button className="btn" onClick={onHecho}>Listo</button> : <><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={monto === ''} onClick={cerrar}>Cerrar caja</button></>}>
      {res ? <div className="stack center"><h2>Caja cerrada</h2><div>Efectivo esperado: <b>{bs(res.montoEsperado)}</b><br />Efectivo contado: <b>{bs(res.montoCierre)}</b></div><Alerta tipo={res.diferencia === 0 ? 'ok' : 'warn'}>Diferencia: <b>{bs(res.diferencia)}</b> {res.diferencia === 0 ? '¡Cuadra perfecto!' : res.diferencia < 0 ? '(faltante)' : '(sobrante)'}</Alerta></div> : (
        <div className="stack"><div className="tabla-wrap"><table className="tabla"><thead><tr><th>Método</th><th>Ventas</th><th className="right">Total</th></tr></thead><tbody>{caja.porMetodo.map((m: any) => <tr key={m.metodo}><td>{METODO[m.metodo]}</td><td>{m.ventas}</td><td className="right">{bs(m.total)}</td></tr>)}</tbody></table></div>
          <div className="small muted">Apertura {bs(caja.montoApertura)} + efectivo {bs(caja.efectivoVentas)} − devoluciones {bs(caja.devolucionesEfectivo)} = <b>{bs(caja.montoEsperado)}</b> esperado</div>
          <Campo label="Efectivo contado en caja (Bs)"><input type="number" min={0} step="0.5" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus /></Campo></div>)}
    </Modal>
  );
}
