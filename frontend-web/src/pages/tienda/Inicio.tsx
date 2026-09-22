import { Link } from 'react-router-dom';
import { CalendarCheck, Smartphone, Sparkles, Store } from 'lucide-react';
import { get, img } from '../../api/client';
import { useAuth, useCarga, useDatos } from '../../context/App';
import { ProductoCard, Spinner } from '../../components/ui';

export default function Inicio() {
  const { usuario } = useAuth();
  const { sucursalId, sucursales } = useDatos();
  const reco = useCarga(() => get(`/ia/recomendaciones?limite=8${sucursalId ? `&sucursalId=${sucursalId}` : ''}`), [usuario?.id, sucursalId]);
  const nuevos = useCarga(() => get(`/productos?temporadaActual=1&limite=8${sucursalId ? `&sucursalId=${sucursalId}` : ''}`), [sucursalId]);
  const ofertas = useCarga(() => get('/promociones?vigentes=1'), []);
  const tit = usuario ? 'Recomendadas para ti' : 'Lo más popular de la temporada';
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <section className="hero">
        <div><span className="badge" style={{ background: '#fff3' , color: '#fff' }}>Temporada Primavera-Verano 2026</span>
          <h1>Reserva, pruébate y compra con realidad aumentada</h1>
          <p>Mira en tiempo real qué talla y color hay en cada sucursal, reserva tus prendas y pruébatelas virtualmente desde la app antes de ir a la tienda.</p>
          <div className="row mt"><Link to="/catalogo" className="btn lg">Ver catálogo</Link><Link to="/vestidor" className="btn lg sec">Probar vestidor virtual</Link></div></div>
        <div className="prendas">{['vestido-rosado', 'blusa-celeste', 'chaqueta-camel'].map((p) => <img key={p} src={img(`/assets/prendas/${p}-foto.jpg`)} alt="" />)}</div>
      </section>

      <section className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
        {[[<Store key="a" />, 'Disponibilidad real', 'Consulta el stock por talla y color en cada sucursal.'], [<CalendarCheck key="b" />, 'Reserva y pruébate', 'Te guardamos las prendas hasta que llegues.'], [<Smartphone key="c" />, 'Vestidor AR', 'Mira cómo te queda con la cámara de tu celular.'], [<Sparkles key="d" />, 'Recomendaciones con IA', 'Sugerencias según tu estilo y la temporada.']].map(([ic, t, d]: any) => (
          <div key={t} className="card row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span style={{ color: 'var(--marca)' }}>{ic}</span><div><b>{t}</b><div className="small muted">{d}</div></div></div>))}
      </section>

      {ofertas.data && ofertas.data.length > 0 && (
        <section className="card" style={{ background: 'var(--marca-suave)', borderColor: 'transparent' }}><h3>🏷️ Promociones vigentes</h3>
          <div className="row">{ofertas.data.map((o: any) => <span key={o.id} className="badge marca" style={{ fontSize: '.85rem' }}>{o.nombre}: -{o.porcentaje}%{o.categoria ? ` en ${o.categoria}` : o.temporada ? ` en ${o.temporada}` : ''}</span>)}</div></section>)}

      <section><div className="row between mb"><h2 style={{ margin: 0 }}>{usuario ? '✨ ' : ''}{tit}</h2><Link to="/catalogo">Ver todo →</Link></div>
        {reco.cargando ? <Spinner /> : reco.data?.recomendaciones?.length ? <div className="grid-prod">{reco.data.recomendaciones.map((p: any) => <ProductoCard key={p.productoId} p={p} />)}</div> : <div className="muted">Aún no hay recomendaciones disponibles.</div>}
        {!usuario && <p className="small muted mt"><Link to="/login">Inicia sesión</Link> para ver recomendaciones basadas en tu historial y preferencias.</p>}</section>

      <section><div className="row between mb"><h2 style={{ margin: 0 }}>Novedades de la temporada</h2><Link to="/catalogo?temporadaActual=1">Ver todo →</Link></div>
        {nuevos.cargando ? <Spinner /> : <div className="grid-prod">{(nuevos.data ?? []).slice(0, 8).map((p: any) => <ProductoCard key={p.id} p={p} />)}</div>}</section>

      <section className="card"><h2>Nuestras sucursales</h2><div className="grid2">{sucursales.map((s) => <div key={s.id} className="card flat"><b>{s.nombre}</b><div className="small muted">{s.ciudad}<br />{s.direccion}<br />{s.horario} · {s.telefono}</div></div>)}</div></section>
    </div>
  );
}
