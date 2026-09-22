import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { img } from '../../api/client';
import { useAuth, useCarrito } from '../../context/App';
import { Vacio } from '../../components/ui';
import ReservarDialog from '../../components/Reservar';
import { bs } from '../../lib/format';

export default function Carrito() {
  const { items, cambiar, quitar, total, vaciar } = useCarrito(); const { usuario } = useAuth(); const nav = useNavigate();
  const [reservar, setReservar] = useState(false);
  if (!items.length) return <Vacio icono="🛍️"><h2>Tu carrito está vacío</h2><Link to="/catalogo" className="btn mt">Explorar el catálogo</Link></Vacio>;
  const ir = (destino: () => void) => (usuario ? destino() : nav('/login', { state: { desde: '/carrito' } }));
  return (
    <div className="detalle" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
      <div className="card"><div className="row between"><h2>Carrito ({items.length})</h2><button className="btn sm ghost" onClick={vaciar}>Vaciar</button></div>
        {items.map((i) => (
          <div className="linea-carrito" key={i.varianteId}>
            <img src={img(i.imagen)} alt="" />
            <div><Link to={`/producto/${i.productoId}`} style={{ fontWeight: 600 }}>{i.nombre}</Link><div className="small muted row" style={{ gap: 6 }}><span className="swatch mini" style={{ background: i.colorHex }} />{i.color} · Talla {i.talla}</div><div className="precio">{bs(i.precio)}</div>
              <div className="qty mt"><button onClick={() => cambiar(i.varianteId, i.cantidad - 1)} aria-label="Menos">−</button><span>{i.cantidad}</span><button onClick={() => cambiar(i.varianteId, i.cantidad + 1)} aria-label="Más">+</button></div></div>
            <div className="right"><b>{bs(i.precio * i.cantidad)}</b><br /><button className="icon-btn" onClick={() => quitar(i.varianteId)} aria-label="Quitar"><Trash2 size={18} /></button></div>
          </div>))}
      </div>
      <div className="card stack" style={{ position: 'sticky', top: 90 }}>
        <h3>Resumen</h3><div className="row between"><span>Subtotal</span><b>{bs(total)}</b></div><div className="row between muted small"><span>Los descuentos vigentes se calculan al pagar</span></div>
        <button className="btn lg block" onClick={() => ir(() => nav('/checkout'))}>Ir a pagar</button>
        <button className="btn lg sec block" onClick={() => ir(() => setReservar(true))}>Reservar para probar en tienda</button>
        <div className="small muted">Con la reserva te guardamos las prendas en la sucursal y decides si comprar después de probártelas.</div>
      </div>
      {reservar && <ReservarDialog items={items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad, etiqueta: `${i.nombre} (${i.talla}/${i.color})` }))} onClose={() => setReservar(false)} onHecha={vaciar} />}
    </div>
  );
}
