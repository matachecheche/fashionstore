import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, Camera, MapPin, ShoppingCart } from 'lucide-react';
import { get, img, post } from '../../api/client';
import { useAuth, useCarga, useCarrito, useDatos, useToast } from '../../context/App';
import { Alerta, Badge, ErrorCarga, ProductoCard, Spinner } from '../../components/ui';
import ReservarDialog from '../../components/Reservar';
import { bs } from '../../lib/format';

export default function Producto() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const { usuario } = useAuth(); const { agregar } = useCarrito(); const { sucursalId, setSucursalId, sucursales } = useDatos();
  const prod = useCarga(() => get(`/productos/${id}`), [id]);
  const disp = useCarga(() => get(`/productos/${id}/disponibilidad`), [id]);
  const combina = useCarga(() => get(`/ia/recomendaciones?productoId=${id}&limite=4`), [id, usuario?.id]);
  const [color, setColor] = useState(''); const [talla, setTalla] = useState(''); const [reservar, setReservar] = useState<{ sucursalId: number | null } | null>(null);
  const p = prod.data;

  useEffect(() => { if (p) { setColor(p.variantes[0]?.color ?? ''); setTalla(''); post('/ia/interacciones', { productoId: p.id, tipo: 'vista' }).catch(() => {}); } }, [p?.id]);   // eslint-disable-line
  const colores = useMemo(() => (p ? [...new Map<string, any>(p.variantes.map((v: any) => [v.color, v])).values()] : []), [p]);
  const tallas = useMemo(() => (p ? p.variantes.filter((v: any) => v.color === color) : []), [p, color]);
  const variante = p?.variantes.find((v: any) => v.color === color && v.talla === talla);
  const fotos = p ? p.imagenes.filter((i: any) => !i.esOverlayAr) : [];
  const [foto, setFoto] = useState('');
  useEffect(() => { if (p) setFoto((fotos.find((i: any) => (i.color ?? '').toLowerCase() === color.toLowerCase()) ?? fotos[0])?.url ?? ''); }, [color, p?.id]);   // eslint-disable-line

  if (prod.cargando) return <Spinner />;
  if (prod.error || !p) return <ErrorCarga mensaje={prod.error || 'Producto no encontrado'} />;
  const dispVar = (varianteId: number, sucId: number) => disp.data?.find((d: any) => d.varianteId === varianteId && d.sucursalId === sucId)?.disponible ?? 0;
  const enSucursal = sucursalId && variante ? dispVar(variante.id, sucursalId) : null;
  const etiqueta = variante ? `${p.nombre} (${variante.talla}/${variante.color})` : '';
  const necesitaTalla = () => { if (!variante) { toast.error('Elige una talla primero.'); return true; } return false; };

  function alCarrito() {
    if (necesitaTalla()) return;
    if (sucursalId && enSucursal === 0) return toast.error('Esa variante está agotada en la sucursal elegida. Prueba con otra.');
    agregar({ varianteId: variante.id, productoId: p.id, nombre: p.nombre, talla: variante.talla, color: variante.color, colorHex: variante.colorHex, precio: p.precioVigente, imagen: foto }); post('/ia/interacciones', { productoId: p.id, tipo: 'carrito' }).catch(() => {});
    toast.ok('Agregado al carrito');
  }
  function abrirReserva(suc: number | null) {
    if (!usuario) return nav('/login', { state: { desde: `/producto/${p.id}` } });
    if (necesitaTalla()) return; setReservar({ sucursalId: suc });
  }

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div className="small muted"><Link to="/catalogo">Catálogo</Link> / <Link to={`/catalogo?categoriaId=${p.categoriaId}`}>{p.categoria}</Link> / {p.nombre}</div>
      <div className="detalle">
        <div className="galeria"><div className="principal"><img src={img(foto)} alt={p.nombre} /></div>
          <div className="mini">{fotos.map((f: any) => <img key={f.id} src={img(f.url)} alt="" className={f.url === foto ? 'act' : ''} onClick={() => { setFoto(f.url); if (f.color) setColor(f.color); }} />)}</div></div>
        <div className="stack">
          <div className="row"><Badge clase="marca">{p.categoria}</Badge>{p.temporada && <Badge clase="info">{p.temporada}</Badge>}{p.coleccion && <Badge>{p.coleccion}</Badge>}</div>
          <h1 style={{ margin: 0 }}>{p.nombre}</h1>
          <div className="precio" style={{ fontSize: '1.7rem' }}>{bs(p.precioVigente)}{p.promocion > 0 && <><s>{bs(p.precioMenor)}</s> <Badge clase="ok">-{Math.round(p.promocion)}%</Badge></>}</div>
          <p className="muted">{p.descripcion}</p>{p.material && <div className="small muted">Material: {p.material} · Textura: {p.textura}</div>}
          <div><div style={{ fontWeight: 600, marginBottom: 6 }}>Color: <span className="muted">{color}</span></div>
            <div className="swatches">{colores.map((c: any) => <button key={c.color} className={`swatch ${c.color === color ? 'act' : ''}`} style={{ background: c.colorHex, width: 30, height: 30 }} title={c.color} aria-label={c.color} onClick={() => { setColor(c.color); setTalla(''); }} />)}</div></div>
          <div><div style={{ fontWeight: 600, marginBottom: 6 }}>Talla</div>
            <div className="row" style={{ gap: 8 }}>{tallas.map((v: any) => { const d = sucursalId ? dispVar(v.id, sucursalId) : v.disponible; return <button key={v.id} className={`talla ${talla === v.talla ? 'act' : ''}`} disabled={d === 0} onClick={() => setTalla(v.talla)} title={d === 0 ? 'Agotada' : `${d} disponibles`}>{v.talla}</button>; })}</div>
            {sucursalId && <div className="small muted mt">Disponibilidad para <b>{sucursales.find((s) => s.id === sucursalId)?.nombre}</b>. <button className="btn sm ghost" onClick={() => setSucursalId(null)}>Ver todas</button></div>}
            {variante && <div className="small mt">{(sucursalId ? enSucursal : variante.disponible)! > 0 ? <Badge clase="ok">{sucursalId ? enSucursal : variante.disponible} disponibles{sucursalId ? '' : ' en total'}</Badge> : <Badge clase="bad">Agotado</Badge>}</div>}</div>
          <div className="row mt"><button className="btn lg" onClick={alCarrito}><ShoppingCart size={18} />Agregar al carrito</button><button className="btn lg sec" onClick={() => abrirReserva(sucursalId)}><CalendarPlus size={18} />Reservar para probar</button></div>
          <Link to={`/vestidor?producto=${p.id}&color=${encodeURIComponent(color)}`} className="btn ghost"><Camera size={18} />Probar en el vestidor virtual (AR)</Link>
          <div className="card flat"><h3><MapPin size={16} /> Disponibilidad por sucursal {variante && <span className="muted small">— {variante.talla} / {variante.color}</span>}</h3>
            {!variante ? <div className="muted small">Elige color y talla para ver el stock en cada sucursal.</div> : disp.cargando ? <Spinner /> : (
              <div className="disp-suc">{sucursales.map((s) => { const n = dispVar(variante.id, s.id); const rep = disp.data?.find((d: any) => d.varianteId === variante.id && d.sucursalId === s.id)?.reposicionEstimada; return (
                <div className="s" key={s.id}><div><b>{s.nombre}</b><div className="small muted">{s.ciudad}{n === 0 && rep ? ` · reposición: ${rep}` : ''}</div></div>
                  <div className="row">{n > 0 ? <Badge clase={n <= 3 ? 'warn' : 'ok'}>{n <= 3 ? `¡Últimas ${n}!` : `${n} disponibles`}</Badge> : <Badge clase="bad">Agotado</Badge>}{n > 0 && <button className="btn sm sec" onClick={() => abrirReserva(s.id)}>Reservar aquí</button>}</div></div>); })}</div>)}</div>
        </div>
      </div>
      {combina.data?.recomendaciones?.length > 0 && <section><h2>✨ Combina con esta prenda</h2><div className="grid-prod">{combina.data.recomendaciones.map((x: any) => <ProductoCard key={x.productoId} p={x} />)}</div></section>}
      {!usuario && <Alerta tipo="info">Para reservar necesitas <Link to="/login" state={{ desde: `/producto/${p.id}` }}>iniciar sesión</Link>.</Alerta>}
      {reservar && variante && <ReservarDialog items={[{ varianteId: variante.id, cantidad: 1, etiqueta }]} sucursalInicial={reservar.sucursalId} onClose={() => setReservar(null)} onHecha={() => disp.recargar(true)} />}
    </div>
  );
}
