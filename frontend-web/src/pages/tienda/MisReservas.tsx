import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, img, post } from '../../api/client';
import { useCarga, useToast } from '../../context/App';
import { Alerta, Badge, ErrorCarga, Modal, Spinner, Vacio } from '../../components/ui';
import { bs, ESTADO_RESERVA, fechaHora } from '../../lib/format';

export function PasosReserva({ r }: { r: any }) {
  const cancel = r.estado === 'CANCELADA';
  const pasos = [['Reservada', true], ['Lista en tienda', !!r.preparadaEn], ['En atención', ['EN_ATENCION', 'COMPLETADA'].includes(r.estado)], ['Completada', r.estado === 'COMPLETADA']] as const;
  const act = pasos.findIndex((p) => !p[1]);
  if (cancel) return <div className="pasos"><div className="paso hecho">Reservada</div><div className="paso mal">Cancelada</div></div>;
  return <div className="pasos">{pasos.map(([t, hecho], i) => <div key={t} className={`paso ${hecho ? 'hecho' : i === act ? 'actual' : ''}`}>{t}</div>)}</div>;
}

// Seguimiento de reservas del cliente (CU-04)
export default function MisReservas() {
  const toast = useToast();
  const { data, cargando, error, recargar } = useCarga(() => get('/reservas/mias'), [], { cada: 20000 });
  const [cancelando, setCancelando] = useState<any>(null);
  async function cancelar() { try { await post(`/reservas/${cancelando.id}/cancelar`, {}); toast.ok('Reserva cancelada'); setCancelando(null); recargar(true); } catch (e: any) { toast.error(e.message); } }
  if (cargando) return <Spinner />;
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>Mis reservas</h1>{error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {!data?.length ? <Vacio icono="📅">Aún no tienes reservas.<br /><Link to="/catalogo" className="btn mt">Explorar el catálogo</Link></Vacio> : data.map((r: any) => {
        const activa = ['PENDIENTE', 'EN_ATENCION'].includes(r.estado);
        return (
          <div className="card" key={r.id}>
            <div className="row between"><div><span style={{ font: '700 1.3rem var(--serif)', letterSpacing: '.06em', color: 'var(--marca)' }}>{r.codigo}</span> <Badge clase={ESTADO_RESERVA[r.estado].clase}>{ESTADO_RESERVA[r.estado].texto}</Badge></div><b>{bs(r.total)}</b></div>
            <div className="small muted">{r.sucursal} · {r.sucursalDireccion} · Atención: <b>{fechaHora(r.fechaHoraEstimada)}</b></div>
            <PasosReserva r={r} />
            <div className="reserva-items">{r.items.map((i: any) => <div className="r-item" key={i.varianteId}><img src={img(i.imagen)} alt="" /><div><b>{i.producto}</b><br />{i.color} · {i.talla} × {i.cantidad}</div></div>)}</div>
            {r.estado === 'PENDIENTE' && <div className="small muted mt">Tus prendas están bloqueadas hasta {fechaHora(r.venceEn)}.</div>}
            {r.preparadaEn && r.estado === 'PENDIENTE' && <Alerta tipo="ok">¡Tus prendas ya están preparadas en la tienda!</Alerta>}
            {r.motivoCancelacion && r.estado === 'CANCELADA' && <div className="small muted mt">Motivo: {r.motivoCancelacion}</div>}
            {activa && <div className="row mt"><Link to={`/checkout?reserva=${r.id}`} className="btn sm">Pagar esta reserva</Link>{r.estado === 'PENDIENTE' && <button className="btn sm peligro" onClick={() => setCancelando(r)}>Cancelar reserva</button>}</div>}
          </div>);
      })}
      {cancelando && <Modal titulo="Cancelar reserva" onClose={() => setCancelando(null)} pie={<><button className="btn sec" onClick={() => setCancelando(null)}>Volver</button><button className="btn peligro" onClick={cancelar}>Sí, cancelar</button></>}>¿Cancelar la reserva <b>{cancelando.codigo}</b>? Las prendas volverán a estar disponibles para otros clientes.</Modal>}
    </div>
  );
}
