import { useState } from 'react';
import { Download } from 'lucide-react';
import { descargar, get } from '../../api/client';
import { useCarga, useToast } from '../../context/App';
import { useSucursalPanel } from '../../components/panel';
import { Badge, Barras, ErrorCarga, Kpi, LineaSvg, Spinner } from '../../components/ui';
import { bs, CANAL, ESTADO_RESERVA, fechaHora, METODO } from '../../lib/format';

const iso = (d: Date) => d.toISOString().slice(0, 10);

// CU-14 Consultar reportes de ventas e inventario: indicadores por sucursal, prendas mas reservadas, inventario critico
export default function Dashboard() {
  const toast = useToast(); const { sucursalId, selector } = useSucursalPanel();
  const [hasta, setHasta] = useState(iso(new Date())); const [desde, setDesde] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const qs = `desde=${desde}&hasta=${hasta}${sucursalId ? `&sucursalId=${sucursalId}` : ''}`;
  const { data: d, cargando, error, recargar } = useCarga(() => get(`/reportes/dashboard?${qs}`), [qs], { cada: 60000 });
  const exportar = async (tipo: string) => { try { await descargar(`/reportes/export?tipo=${tipo}&${qs}`, `fashionstore-${tipo}.csv`); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Dashboard</h1>
        <div className="row">{selector}<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} aria-label="Desde" /><span>→</span><input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} aria-label="Hasta" /></div></div>
      {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {cargando && !d ? <Spinner /> : d && <>
        <div className="kpis">
          <Kpi valor={bs(d.kpis.ventasTotal)} titulo="Ventas del período" /><Kpi valor={d.kpis.nVentas} titulo="Nº de ventas" /><Kpi valor={bs(d.kpis.ticketPromedio)} titulo="Ticket promedio" />
          <Kpi valor={d.kpis.unidades} titulo="Prendas vendidas" /><Kpi valor={bs(d.kpis.ventasHoy)} titulo={`Ventas de hoy (${d.kpis.nVentasHoy})`} /><Kpi valor={d.kpis.reservasActivas} titulo="Reservas activas" />
          <Kpi valor={d.kpis.inventarioCritico} titulo="Inventario crítico" alerta={d.kpis.inventarioCritico > 0} /><Kpi valor={d.kpis.inventarioAgotado} titulo="Agotados" alerta={d.kpis.inventarioAgotado > 0} /><Kpi valor={d.kpis.clientesNuevos} titulo="Clientes nuevos" /></div>
        <div className="card"><div className="row between"><h3>Ventas por día (Bs)</h3><div className="row no-print"><span className="small muted">Exportar CSV:</span>{['ventas', 'inventario', 'reservas'].map((t) => <button key={t} className="btn sm sec" onClick={() => exportar(t)}><Download size={14} />{t}</button>)}</div></div><LineaSvg puntos={d.ventasPorDia} /></div>
        <div className="grid2">
          <div className="card"><h3>Ventas por sucursal</h3><Barras datos={d.ventasPorSucursal.map((s: any) => ({ etiqueta: s.sucursal, valor: s.total }))} /></div>
          <div className="card"><h3>Prendas más vendidas (unidades)</h3><Barras formato={(n) => `${n} u.`} datos={d.topVendidos.map((s: any) => ({ etiqueta: s.producto, valor: s.unidades }))} /></div>
          <div className="card"><h3>Prendas más reservadas (unidades)</h3><Barras formato={(n) => `${n} u.`} datos={d.topReservados.map((s: any) => ({ etiqueta: s.producto, valor: s.unidades }))} /></div>
          <div className="card"><h3>Ventas por método de pago</h3><Barras datos={d.ventasPorMetodo.map((s: any) => ({ etiqueta: METODO[s.metodo] ?? s.metodo, valor: s.total }))} /><h3 className="mt">Por canal</h3><Barras datos={d.ventasPorCanal.map((s: any) => ({ etiqueta: CANAL[s.canal] ?? s.canal, valor: s.total }))} /></div>
        </div>
        <div className="grid2">
          <div className="card"><h3>⚠️ Inventario crítico</h3>{d.inventarioCritico.length === 0 ? <div className="muted">Todo el inventario está sobre el mínimo 🎉</div> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Prenda</th><th>Variante</th><th>Sucursal</th><th>Disp.</th></tr></thead><tbody>{d.inventarioCritico.map((r: any, i: number) => <tr key={i}><td>{r.producto}</td><td>{r.talla}/{r.color}</td><td>{r.sucursal}</td><td><Badge clase={r.estado === 'agotado' ? 'bad' : 'warn'}>{r.disponible}</Badge></td></tr>)}</tbody></table></div>}</div>
          <div className="card"><h3>Reservas del período</h3><div className="row">{d.reservasPorEstado.map((r: any) => <span key={r.estado}><Badge clase={ESTADO_RESERVA[r.estado].clase}>{ESTADO_RESERVA[r.estado].texto}</Badge> <b>{r.n}</b></span>)}{!d.reservasPorEstado.length && <span className="muted">Sin reservas.</span>}</div>
            <h3 className="mt">Últimas ventas</h3>{d.ultimasVentas.map((v: any) => <div key={v.id} className="row between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--linea)' }}><span>{v.comprobante} · {v.sucursal}</span><span className="muted">{fechaHora(v.creadaEn)}</span><b>{bs(v.total)}</b></div>)}</div>
        </div></>}
    </div>
  );
}
