import { useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { get, img, patch, post, subirImagen } from '../../api/client';
import { useCarga, useToast } from '../../context/App';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner, Tabs } from '../../components/ui';
import { AR_TIPOS, bs } from '../../lib/format';

// CU-11 Gestionar productos, categorias, tallas, colores y temporadas
export default function Productos() {
  const toast = useToast(); const [q, setQ] = useState(''); const [edit, setEdit] = useState<any>(null);
  const { data, cargando, error, recargar } = useCarga(() => get(`/productos?todos=1&limite=300${q ? `&q=${encodeURIComponent(q)}` : ''}`), [q]);
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Productos</h1><div className="row"><input placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} /><button className="btn" onClick={() => setEdit({})}><Plus size={16} />Nuevo producto</button></div></div>
      {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {cargando && !data ? <Spinner /> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th /><th>Producto</th><th>Categoría</th><th>Temporada / colección</th><th className="right">Precio</th><th className="right">Stock total</th><th>Variantes</th><th>AR</th><th>Estado</th><th /></tr></thead><tbody>
        {(data ?? []).map((p: any) => <tr key={p.id} style={p.activo ? {} : { opacity: .55 }}>
          <td><img src={img(p.imagenes.find((i: any) => !i.esOverlayAr)?.url)} alt="" style={{ width: 40, height: 54, objectFit: 'cover', borderRadius: 6, background: '#f3ecef' }} /></td>
          <td><b>{p.nombre}</b><div className="small muted">{p.material}</div></td><td>{p.categoria}</td><td>{p.temporada}<div className="small muted">{p.coleccion}</div></td>
          <td className="right">{bs(p.precioMenor)}{p.precioMayor && <div className="small muted">mayor {bs(p.precioMayor)}</div>}</td><td className="right">{p.stockTotal}</td><td>{p.variantes.length}</td><td>{p.imagenes.some((i: any) => i.esOverlayAr) ? <Badge clase="ok">{p.arTipo}</Badge> : <Badge clase="warn">sin overlay</Badge>}</td><td>{p.activo ? <Badge clase="ok">Activo</Badge> : <Badge clase="bad">Baja</Badge>}</td>
          <td className="nowrap"><button className="btn sm sec" onClick={() => setEdit(p)}>Editar</button> <button className="btn sm ghost" onClick={async () => { try { await patch(`/productos/${p.id}`, { activo: !p.activo }); toast.ok(p.activo ? 'Producto dado de baja' : 'Producto reactivado'); recargar(true); } catch (e: any) { toast.error(e.message); } }}>{p.activo ? 'Dar de baja' : 'Reactivar'}</button></td></tr>)}</tbody></table></div>}
      {edit && <Editor producto={edit} onClose={() => setEdit(null)} onListo={() => { setEdit(null); recargar(true); }} />}
    </div>
  );
}

const VACIO = { nombre: '', descripcion: '', material: '', textura: 'liso', arTipo: 'superior', precioMenor: '', precioMayor: '', categoriaId: '', temporadaId: '', coleccionId: '', proveedorId: '' };

function Editor({ producto, onClose, onListo }: { producto: any; onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const nuevo = !producto.id; const [tab, setTab] = useState('datos');
  const cats = useCarga(() => get('/categorias'), []); const temps = useCarga(() => get('/temporadas'), []); const cols = useCarga(() => get('/colecciones'), []); const provs = useCarga(() => get('/proveedores'), []); const alm = useCarga(() => get('/almacenes'), []);
  const [f, setF] = useState<any>(nuevo ? VACIO : Object.fromEntries(Object.keys(VACIO).map((k) => [k, producto[k] ?? ''])));
  const [imagenes, setImagenes] = useState<any[]>(producto.imagenes ?? []); const [variantes, setVariantes] = useState<any[]>(producto.variantes ?? []);
  const [nv, setNv] = useState({ talla: 'M', color: '', colorHex: '#7a2f45', almacenId: '', cantidad: '0' }); const [error, setError] = useState(''); const [guardando, setGuardando] = useState(false);
  const tiendas = (alm.data ?? []).filter((a: any) => a.activo);
  const num = (x: any) => (x === '' || x === null ? null : Number(x));

  async function subir(e: React.ChangeEvent<HTMLInputElement>, overlay: boolean) {
    const a = e.target.files?.[0]; if (!a) return;
    try { const url = await subirImagen(a); setImagenes([...imagenes, { url, esOverlayAr: overlay, color: null }]); toast.ok(overlay ? 'Imagen AR subida' : 'Foto subida'); } catch (err: any) { toast.error(err.message); } e.target.value = '';
  }
  async function agregarVariante() {
    setError('');
    if (!nv.color.trim()) return setError('Indica el color de la variante.');
    const stock = nv.almacenId && Number(nv.cantidad) > 0 ? [{ almacenId: Number(nv.almacenId), cantidad: Number(nv.cantidad) }] : undefined;
    if (nuevo) { setVariantes([...variantes, { id: `n${variantes.length}`, talla: nv.talla, color: nv.color, colorHex: nv.colorHex, stock, nuevo: true }]); setNv({ ...nv, color: '', cantidad: '0' }); return; }
    try { const r = await post(`/productos/${producto.id}/variantes`, { talla: nv.talla, color: nv.color, colorHex: nv.colorHex, stock }); setVariantes(r.variantes); toast.ok('Variante agregada'); setNv({ ...nv, color: '', cantidad: '0' }); } catch (e: any) { setError(e.message); }
  }
  async function guardar() {
    setError(''); setGuardando(true);
    const cuerpo: any = { nombre: f.nombre, descripcion: f.descripcion || undefined, material: f.material || undefined, textura: f.textura || 'liso', arTipo: f.arTipo, precioMenor: Number(f.precioMenor), precioMayor: num(f.precioMayor), categoriaId: num(f.categoriaId), temporadaId: num(f.temporadaId), coleccionId: num(f.coleccionId), proveedorId: num(f.proveedorId),
      imagenes: imagenes.map((i) => ({ url: i.url, esOverlayAr: !!i.esOverlayAr, color: i.color || undefined })) };
    if (nuevo) { cuerpo.variantes = variantes.map((v) => ({ talla: v.talla, color: v.color, colorHex: v.colorHex, stock: v.stock })); if (cuerpo.precioMayor === null) delete cuerpo.precioMayor; }
    try { nuevo ? await post('/productos', cuerpo) : await patch(`/productos/${producto.id}`, cuerpo); toast.ok('Producto guardado'); onListo(); } catch (e: any) { setError(e.message); } finally { setGuardando(false); }
  }
  const colores = [...new Set(variantes.map((v) => v.color))];
  return (
    <Modal ancho titulo={nuevo ? 'Nuevo producto' : `Editar · ${producto.nombre}`} onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={guardando || !f.nombre || !f.precioMenor} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar producto'}</button></>}>
      <Tabs tabs={[{ id: 'datos', titulo: 'Datos' }, { id: 'variantes', titulo: `Variantes (${variantes.length})` }, { id: 'imagenes', titulo: `Imágenes y AR (${imagenes.length})` }]} actual={tab} onChange={setTab} />
      {tab === 'datos' && <div className="form-grid">
        <Campo label="Nombre *"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo label="Categoría"><select value={f.categoriaId ?? ''} onChange={(e) => setF({ ...f, categoriaId: e.target.value })}><option value="">—</option>{(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Temporada"><select value={f.temporadaId ?? ''} onChange={(e) => setF({ ...f, temporadaId: e.target.value, coleccionId: '' })}><option value="">—</option>{(temps.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Colección"><select value={f.coleccionId ?? ''} onChange={(e) => setF({ ...f, coleccionId: e.target.value })}><option value="">—</option>{(cols.data ?? []).filter((c: any) => !f.temporadaId || c.temporadaId === Number(f.temporadaId)).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Proveedor"><select value={f.proveedorId ?? ''} onChange={(e) => setF({ ...f, proveedorId: e.target.value })}><option value="">—</option>{(provs.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo label="Precio al detalle (Bs) *"><input type="number" min={0} step="0.01" value={f.precioMenor} onChange={(e) => setF({ ...f, precioMenor: e.target.value })} /></Campo>
        <Campo label="Precio por mayor (Bs)" ayuda="No puede superar al precio al detalle"><input type="number" min={0} step="0.01" value={f.precioMayor ?? ''} onChange={(e) => setF({ ...f, precioMayor: e.target.value })} /></Campo>
        <Campo label="Tipo de prenda para el vestidor AR" ayuda="Define cómo se ubica sobre el cuerpo"><select value={f.arTipo} onChange={(e) => setF({ ...f, arTipo: e.target.value })}>{AR_TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo label="Material"><input value={f.material ?? ''} onChange={(e) => setF({ ...f, material: e.target.value })} /></Campo>
        <Campo label="Textura"><select value={f.textura ?? 'liso'} onChange={(e) => setF({ ...f, textura: e.target.value })}>{['liso', 'estampado', 'satinado', 'denim', 'plisado', 'tejido'].map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <div style={{ gridColumn: '1/-1' }}><Campo label="Descripción"><textarea value={f.descripcion ?? ''} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo></div></div>}
      {tab === 'variantes' && <div className="stack">
        <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Talla</th><th>Color</th><th>SKU</th><th /></tr></thead><tbody>{variantes.map((v) => <tr key={v.id}><td>{v.talla}</td><td><span className="swatch mini" style={{ background: v.colorHex, display: 'inline-block', marginRight: 6 }} />{v.color}</td><td className="small muted">{v.sku ?? '(se genera al guardar)'}</td><td className="right">{v.nuevo ? <button className="icon-btn" onClick={() => setVariantes(variantes.filter((x) => x !== v))} aria-label="Quitar"><Trash2 size={16} /></button> : <button className="btn sm ghost" onClick={async () => { try { const r = await patch(`/variantes/${v.id}`, { activo: !v.activo }); setVariantes(r.variantes); } catch (e: any) { toast.error(e.message); } }}>{v.activo ? 'Desactivar' : 'Activar'}</button>}</td></tr>)}</tbody></table></div>
        <div className="card flat"><b>Agregar variante</b><div className="form-grid mt">
          <Campo label="Talla"><select value={nv.talla} onChange={(e) => setNv({ ...nv, talla: e.target.value })}>{['XS', 'S', 'M', 'L', 'XL', '36', '37', '38', '39', '40', 'Único'].map((t) => <option key={t}>{t}</option>)}</select></Campo>
          <Campo label="Color"><input value={nv.color} onChange={(e) => setNv({ ...nv, color: e.target.value })} placeholder="Ej.: Rosado" list="colores-sug" /><datalist id="colores-sug">{['Negro', 'Blanco', 'Rojo', 'Azul', 'Rosado', 'Beige', 'Verde', 'Camel', 'Gris', 'Celeste', 'Mostaza', 'Vino'].map((c) => <option key={c} value={c} />)}</datalist></Campo>
          <Campo label="Color (tono)"><input type="color" value={nv.colorHex} onChange={(e) => setNv({ ...nv, colorHex: e.target.value })} style={{ height: 42, padding: 3 }} /></Campo>
          <Campo label="Stock inicial en…"><select value={nv.almacenId} onChange={(e) => setNv({ ...nv, almacenId: e.target.value })}><option value="">(sin stock)</option>{tiendas.map((a: any) => <option key={a.id} value={a.id}>{a.sucursal} — {a.nombre}</option>)}</select></Campo>
          <Campo label="Cantidad"><input type="number" min={0} value={nv.cantidad} onChange={(e) => setNv({ ...nv, cantidad: e.target.value })} /></Campo></div><button className="btn sec mt" onClick={agregarVariante}><Plus size={16} />Agregar variante</button></div>
        {error && <Alerta>{error}</Alerta>}</div>}
      {tab === 'imagenes' && <div className="stack">
        <Alerta tipo="info">Sube <b>fotos</b> del catálogo y, para el vestidor AR, un <b>PNG con fondo transparente</b> de la prenda (marcado como «Overlay AR»). Asigna a cada imagen el color al que corresponde.</Alerta>
        <div className="row"><label className="btn sec"><ImagePlus size={16} />Subir foto<input type="file" accept="image/*" hidden onChange={(e) => subir(e, false)} /></label><label className="btn sec"><ImagePlus size={16} />Subir overlay AR (PNG)<input type="file" accept="image/png,image/webp" hidden onChange={(e) => subir(e, true)} /></label></div>
        <div className="grid-prod" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>{imagenes.map((i, n) => <div key={n} className="card flat stack" style={{ padding: 10 }}>
          <div style={{ aspectRatio: '5/7', background: i.esOverlayAr ? 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 50%/16px 16px' : '#f3ecef', borderRadius: 8, overflow: 'hidden' }}><img src={img(i.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
          <Badge clase={i.esOverlayAr ? 'marca' : ''}>{i.esOverlayAr ? 'Overlay AR' : 'Foto'}</Badge>
          <select value={i.color ?? ''} onChange={(e) => setImagenes(imagenes.map((x, j) => (j === n ? { ...x, color: e.target.value || null } : x)))} aria-label="Color"><option value="">Cualquier color</option>{colores.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn sm peligro" onClick={() => setImagenes(imagenes.filter((_, j) => j !== n))}>Quitar</button></div>)}</div></div>}
      {error && tab !== 'variantes' && <div className="mt"><Alerta>{error}</Alerta></div>}
    </Modal>
  );
}
