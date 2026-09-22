import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, img } from '../../api/client';
import { useCarga } from '../../context/App';
import { Badge, ErrorCarga, Spinner, Vacio } from '../../components/ui';
import Comprobante from '../../components/Comprobante';
import { bs, CANAL, ESTADO_VENTA, fechaHora, METODO } from '../../lib/format';

export default function MisPedidos() {
  const { data, cargando, error, recargar } = useCarga(() => get('/ventas/mias'), [], { cada: 30000 });
  const [ver, setVer] = useState<number | null>(null);
  if (cargando) return <Spinner />;
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>Mis pedidos</h1>{error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {!data?.length ? <Vacio icono="🧾">Todavía no tienes compras.<br /><Link to="/catalogo" className="btn mt">Ir de compras</Link></Vacio> : data.map((v: any) => (
        <div className="card" key={v.id}>
          <div className="row between"><div><b>{v.comprobante}</b> <Badge clase={ESTADO_VENTA[v.estado]?.clase}>{ESTADO_VENTA[v.estado]?.texto}</Badge></div><b className="precio">{bs(v.total)}</b></div>
          <div className="small muted">{fechaHora(v.creadaEn)} · {v.sucursal} · {CANAL[v.canal]} · {METODO[v.metodoPago]}</div>
          <div className="reserva-items mt">{v.items.map((i: any) => <div className="r-item" key={i.varianteId}><img src={img(i.imagen)} alt="" /><div><b>{i.producto}</b><br />{i.color} · {i.talla} × {i.cantidad}</div></div>)}</div>
          <div className="row mt">{['completada', 'entregada', 'devuelta_parcial', 'devuelta', 'pendiente'].includes(v.estado) && <button className="btn sm sec" onClick={() => setVer(v.id)}>Ver comprobante</button>}
            {v.estado === 'pendiente_pago' && v.pago && <Link className="btn sm" to={`/pago/${v.pago.referencia}`}>Continuar el pago</Link>}</div>
        </div>))}
      {ver && <Comprobante ventaId={ver} onClose={() => setVer(null)} />}
    </div>
  );
}
