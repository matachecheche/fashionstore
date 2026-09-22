import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Modal, Spinner } from './ui';
import { get } from '../api/client';
import { bs, CANAL, fechaHora, METODO } from '../lib/format';

// Comprobante de venta imprimible (CU-07 paso 4, CU-09 paso 6)
export default function Comprobante({ ventaId, onClose }: { ventaId: number; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { get(`/ventas/${ventaId}/comprobante`).then(setD).catch(() => onClose()); /* eslint-disable-next-line */ }, [ventaId]);
  return (
    <Modal titulo="Comprobante de venta" onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cerrar</button><button className="btn" onClick={() => window.print()}><Printer size={16} />Imprimir</button></>}>
      {!d ? <Spinner /> : (() => { const v = d.venta; return (
        <div className="comprobante">
          <div className="center"><b style={{ fontSize: '1.1rem' }}>{d.empresa.nombre}</b><br />{d.empresa.razonSocial}<br />{d.sucursal.nombre} — {d.sucursal.ciudad}<br />{d.sucursal.direccion}</div><hr />
          <div className="l"><span>Comprobante</span><b>{v.comprobante}</b></div><div className="l"><span>Fecha</span><span>{fechaHora(v.creadaEn)}</span></div>
          <div className="l"><span>Cliente</span><span>{v.cliente ?? 'Mostrador'}</span></div>{v.documentoCliente && <div className="l"><span>NIT/CI</span><span>{v.documentoCliente}</span></div>}
          <div className="l"><span>Canal</span><span>{CANAL[v.canal]}</span></div><div className="l"><span>Pago</span><span>{METODO[v.metodoPago]}{v.pago ? ` · ${v.pago.estado}` : ''}</span></div><hr />
          {v.items.map((i: any) => <div key={i.varianteId} style={{ marginBottom: 6 }}><div>{i.producto}</div><div className="l"><span>{i.cantidad} × {bs(i.precioUnit)} ({i.talla}/{i.color})</span><span>{bs(i.cantidad * i.precioUnit)}</span></div></div>)}<hr />
          <div className="l"><span>Subtotal</span><span>{bs(v.subtotal)}</span></div>{v.descuento > 0 && <div className="l"><span>Descuento</span><span>-{bs(v.descuento)}</span></div>}
          <div className="l" style={{ fontSize: '1.1rem' }}><b>TOTAL</b><b>{bs(v.total)}</b></div><hr /><div className="center small">¡Gracias por tu compra!</div>
        </div>); })()}
    </Modal>
  );
}
