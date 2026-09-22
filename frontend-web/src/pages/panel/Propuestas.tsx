import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { get, post, subirImagen, img } from '../../api/client';
import { useAuth, useCarga, useToast } from '../../context/App';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner, Vacio } from '../../components/ui';
import { AR_TIPOS, bs, fechaHora, TALLAS } from '../../lib/format';

const EST: Record<string, string> = { PENDIENTE: 'warn', APROBADA: 'ok', RECHAZADA: 'bad' };

// Actor Proveedor: registra/envia productos y disponibilidad por temporada o coleccion. El administrador aprueba (y entra al catalogo con stock).
export default function Propuestas() {
  const { usuario } = useAuth(); const toast = useToast(); const admin = usuario?.rol === 'admin';
  const { data, cargando, error, recargar } = useCarga(() => get('/propuestas'), [], { cada: 30000 });
  const [nueva, setNueva] = useState(false); const [aprobar, setAprobar] = useState<any>(null); const [rechazar, setRechazar] = useState<any>(null); const [motivo, setMotivo] = useState('');
  async function rech() { try { await post(`/propuestas/${rechazar.id}/rechazar`, { motivo }); toast.ok('Propuesta rechazada'); setRechazar(null); setMotivo(''); recargar(true); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>{admin ? 'Propuestas de proveedores' : 'Mis propuestas'}</h1>{!admin && <button className="btn" onClick={() => setNueva(true)}><Plus size={16} />Nueva propuesta</button>}</div>
      {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {cargando && !data ? <Spinner /> : !data?.length ? <Vacio icono="📦">{admin ? 'No hay propuestas.' : 'Aún no enviaste propuestas.'}</Vacio> : (
        <div className="grid2">{data.map((p: any) => (
          <div key={p.id} className="card stack"><div className="row between"><b>{p.nombre}</b><Badge clase={EST[p.estado]}>{p.estado}</Badge></div>
            <div className="small muted">{admin && <>{p.proveedor} · </>}{p.categoria ?? 'Sin categoría'} · {p.temporada ?? 'Sin temporada'}{p.coleccion ? ` / ${p.coleccion}` : ''} · {fechaHora(p.creadaEn)}</div>
            <div>{p.descripcion}</div><div className="small">Precio sugerido: <b>{bs(p.precioSugerido)}</b> · Tipo AR: {p.arTipo}</div>
            <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Talla</th><th>Color</th><th className="right">Disponible</th></tr></thead><tbody>{p.variantes.map((v: any, i: number) => <tr key={i}><td>{v.talla}</td><td><span className="swatch mini" style={{ background: v.colorHex, display: 'inline-block', marginRight: 6 }} />{v.color}</td><td className="right">{v.cantidad}</td></tr>)}</tbody></table></div>
            {p.motivoRechazo && <Alerta>Motivo del rechazo: {p.motivoRechazo}</Alerta>}
            {p.estado === 'APROBADA' && <Alerta tipo="ok">Aprobada: ya está en el catálogo (producto #{p.productoId}).</Alerta>}
            {admin && p.estado === 'PENDIENTE' && <div className="row"><button className="btn verde" onClick={() => setAprobar(p)}>Aprobar</button><button className="btn peligro" onClick={() => setRechazar(p)}>Rechazar</button></div>}</div>))}</div>)}
      {nueva && <Nueva onClose={() => setNueva(false)} onListo={() => { setNueva(false); recargar(true); }} />}
      {aprobar && <Aprobar p={aprobar} onClose={() => setAprobar(null)} onListo={() => { setAprobar(null); recargar(true); }} />}
      {rechazar && <Modal titulo="Rechazar propuesta" onClose={() => setRechazar(null)} pie={<><button className="btn sec" onClick={() => setRechazar(null)}>Volver</button><button className="btn peligro" disabled={!motivo.trim()} onClick={rech}>Rechazar</button></>}><Campo label="Motivo (el proveedor lo verá)"><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></Campo></Modal>}
    </div>
  );
}

function Aprobar({ p, onClose, onListo }: { p: any; onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const alm = useCarga(() => get('/almacenes'), []); const cats = useCarga(() => get('/categorias'), []);
  const [almacenId, setAlmacenId] = useState(''); const [categoriaId, setCategoriaId] = useState(p.categoriaId ? String(p.categoriaId) : ''); const [precio, setPrecio] = useState(String(p.precioSugerido)); const [error, setError] = useState('');
  async function ok() { try { await post(`/propuestas/${p.id}/aprobar`, { almacenId: almacenId ? Number(almacenId) : undefined, categoriaId: categoriaId ? Number(categoriaId) : undefined, precioMenor: Number(precio) }); toast.ok('Propuesta aprobada: el producto entró al catálogo'); onListo(); } catch (e: any) { setError(e.message); } }
  return (
    <Modal titulo={`Aprobar · ${p.nombre}`} onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn verde" onClick={ok}>Aprobar y crear producto</button></>}>
      <div className="stack"><p className="muted small">Se creará el producto con sus variantes y se recibirá el stock ofrecido en el almacén elegido (se suele recibir en la bodega y luego transferir a tiendas).</p>
        <Campo label="Recibir el stock en"><select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}><option value="">Primera bodega disponible</option>{(alm.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.sucursal} — {a.nombre}</option>)}</select></Campo>
        <Campo label="Categoría"><select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}><option value="">—</option>{(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Precio al detalle (Bs)"><input type="number" min={1} value={precio} onChange={(e) => setPrecio(e.target.value)} /></Campo>{error && <Alerta>{error}</Alerta>}</div>
    </Modal>
  );
}

function Nueva({ onClose, onListo }: { onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const temps = useCarga(() => get('/temporadas'), []); const cols = useCarga(() => get('/colecciones'), []); const cats = useCarga(() => get('/categorias'), []);
  const [f, setF] = useState({ nombre: '', descripcion: '', arTipo: 'superior', precioSugerido: '', temporadaId: '', coleccionId: '', categoriaId: '', imagenUrl: '' });
  const [vars, setVars] = useState<{ talla: string; color: string; colorHex: string; cantidad: number }[]>([]); const [v, setV] = useState({ talla: 'M', color: '', colorHex: '#7a2f45', cantidad: '10' }); const [error, setError] = useState('');
  async function subir(e: React.ChangeEvent<HTMLInputElement>) { const a = e.target.files?.[0]; if (!a) return; try { setF({ ...f, imagenUrl: await subirImagen(a) }); } catch (err: any) { toast.error(err.message); } }
  async function enviar() {
    setError('');
    try { await post('/propuestas', { nombre: f.nombre, descripcion: f.descripcion || undefined, arTipo: f.arTipo, precioSugerido: Number(f.precioSugerido), temporadaId: f.temporadaId ? Number(f.temporadaId) : undefined, coleccionId: f.coleccionId ? Number(f.coleccionId) : undefined, categoriaId: f.categoriaId ? Number(f.categoriaId) : undefined, imagenUrl: f.imagenUrl || undefined, variantes: vars }); toast.ok('Propuesta enviada al administrador'); onListo(); } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal ancho titulo="Nueva propuesta de producto" onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={!f.nombre || !f.precioSugerido || !vars.length} onClick={enviar}>Enviar propuesta</button></>}>
      <div className="stack"><div className="form-grid">
        <Campo label="Nombre *"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo label="Precio sugerido (Bs) *"><input type="number" min={1} value={f.precioSugerido} onChange={(e) => setF({ ...f, precioSugerido: e.target.value })} /></Campo>
        <Campo label="Tipo de prenda"><select value={f.arTipo} onChange={(e) => setF({ ...f, arTipo: e.target.value })}>{AR_TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo label="Categoría"><select value={f.categoriaId} onChange={(e) => setF({ ...f, categoriaId: e.target.value })}><option value="">—</option>{(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Temporada"><select value={f.temporadaId} onChange={(e) => setF({ ...f, temporadaId: e.target.value, coleccionId: '' })}><option value="">—</option>{(temps.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Colección"><select value={f.coleccionId} onChange={(e) => setF({ ...f, coleccionId: e.target.value })}><option value="">—</option>{(cols.data ?? []).filter((c: any) => !f.temporadaId || c.temporadaId === Number(f.temporadaId)).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo></div>
        <Campo label="Descripción"><textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo>
        <div className="row"><label className="btn sec sm">Subir foto<input type="file" accept="image/*" hidden onChange={subir} /></label>{f.imagenUrl && <img src={img(f.imagenUrl)} alt="" style={{ height: 60, borderRadius: 8 }} />}</div>
        <div className="card flat"><b>Disponibilidad por variante</b>
          {vars.map((x, i) => <div key={i} className="row between small" style={{ padding: '4px 0' }}><span><span className="swatch mini" style={{ background: x.colorHex, display: 'inline-block' }} /> {x.talla} / {x.color}</span><span>{x.cantidad} u. <button className="icon-btn" onClick={() => setVars(vars.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 size={14} /></button></span></div>)}
          <div className="form-grid mt"><Campo label="Talla"><select value={v.talla} onChange={(e) => setV({ ...v, talla: e.target.value })}>{TALLAS.map((t) => <option key={t}>{t}</option>)}</select></Campo><Campo label="Color"><input value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} /></Campo><Campo label="Tono"><input type="color" value={v.colorHex} onChange={(e) => setV({ ...v, colorHex: e.target.value })} style={{ height: 42, padding: 3 }} /></Campo><Campo label="Cantidad"><input type="number" min={0} value={v.cantidad} onChange={(e) => setV({ ...v, cantidad: e.target.value })} /></Campo></div>
          <button className="btn sec sm mt" disabled={!v.color.trim()} onClick={() => { setVars([...vars, { talla: v.talla, color: v.color.trim(), colorHex: v.colorHex, cantidad: Number(v.cantidad) }]); setV({ ...v, color: '' }); }}>Agregar variante</button></div>
        {error && <Alerta>{error}</Alerta>}</div>
    </Modal>
  );
}
