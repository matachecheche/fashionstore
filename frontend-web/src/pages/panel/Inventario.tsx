import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { get, patch, post } from '../../api/client';
import { useAuth, useCarga, useToast } from '../../context/App';
import { SelectorVariante, useAlmacenes, useSucursalPanel } from '../../components/panel';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner, Tabs, Vacio } from '../../components/ui';
import { fecha, fechaHora, TIPO_MOV } from '../../lib/format';

const ESTADO: Record<string, string> = { ok: 'ok', critico: 'warn', agotado: 'bad' };

// CU-10 Actualizar inventario automaticamente + movimientos manuales (recepcion, devolucion, ajuste, merma, transferencias)
export default function Inventario() {
  const { usuario } = useAuth(); const { sucursalId, selector } = useSucursalPanel();
  const edita = !!usuario && ['admin', 'encargado'].includes(usuario.rol);
  const [tab, setTab] = useState('existencias');
  const tabs = [{ id: 'existencias', titulo: 'Existencias' }, { id: 'alertas', titulo: '⚠️ Alertas' }, ...(edita ? [{ id: 'movimientos', titulo: 'Historial de movimientos' }, { id: 'recepcion', titulo: 'Recepción de mercadería' }, { id: 'transferencia', titulo: 'Transferencias' }] : [])];
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Inventario</h1><div className="row">{selector}</div></div>
      <Tabs tabs={tabs} actual={tab} onChange={setTab} />
      {tab === 'existencias' && <Existencias sucursalId={sucursalId} edita={edita} />}
      {tab === 'alertas' && <Alertas sucursalId={sucursalId} />}
      {tab === 'movimientos' && <Movimientos sucursalId={sucursalId} />}
      {tab === 'recepcion' && <Recepcion sucursalId={sucursalId} />}
      {tab === 'transferencia' && <Transferencia sucursalId={sucursalId} />}
    </div>
  );
}

function Existencias({ sucursalId, edita }: { sucursalId: number | null; edita: boolean }) {
  const toast = useToast(); const [q, setQ] = useState(''); const [estado, setEstado] = useState('');
  const { data, cargando, error, recargar } = useCarga(() => get(`/inventario?${sucursalId ? `sucursalId=${sucursalId}&` : ''}${estado ? `estado=${estado}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`), [sucursalId, estado, q], { cada: 20000 });
  const [aj, setAj] = useState<any>(null); const [cfg, setCfg] = useState<any>(null);
  return (<>
    <div className="row"><input placeholder="Buscar producto, SKU o color" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /><select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 'auto' }}><option value="">Todos</option><option value="ok">Normal</option><option value="critico">Crítico</option><option value="agotado">Agotado</option></select><span className="small muted">Disponible = existencias − reservado</span></div>
    {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
    {cargando && !data ? <Spinner /> : !data?.length ? <Vacio>Sin resultados.</Vacio> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Producto</th><th>Variante</th><th>Sucursal / almacén</th><th className="right">Existencias</th><th className="right">Reservado</th><th className="right">Disponible</th><th className="right">Mínimo</th><th>Estado</th>{edita && <th />}</tr></thead><tbody>
      {data.map((r: any) => <tr key={`${r.varianteId}-${r.almacenId}`}><td>{r.producto}<div className="small muted">{r.sku}</div></td><td>{r.talla} / {r.color}</td><td>{r.sucursal}<div className="small muted">{r.almacen}{r.reposicionEstimada ? ` · reposición ${fecha(r.reposicionEstimada)}` : ''}</div></td><td className="right">{r.cantidad}</td><td className="right">{r.reservado}</td><td className="right"><b>{r.disponible}</b></td><td className="right">{r.stockMinimo}</td><td><Badge clase={ESTADO[r.estado]}>{r.estado}</Badge></td>
        {edita && <td className="nowrap"><button className="btn sm sec" onClick={() => setAj(r)}>Ajustar</button> <button className="btn sm ghost" onClick={() => setCfg(r)}>Mínimo</button></td>}</tr>)}</tbody></table></div>}
    {aj && <Ajuste fila={aj} onClose={() => setAj(null)} onListo={() => { setAj(null); recargar(true); }} />}
    {cfg && <ConfigStock fila={cfg} onClose={() => setCfg(null)} onListo={() => { setCfg(null); recargar(true); toast.ok('Configuración guardada'); }} />}
  </>);
}

function Ajuste({ fila, onClose, onListo }: { fila: any; onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const [tipo, setTipo] = useState('ajuste'); const [cantidad, setCantidad] = useState(''); const [nota, setNota] = useState(''); const [error, setError] = useState('');
  async function guardar() {
    setError('');
    try { await post('/inventario/movimientos', { tipo, varianteId: fila.varianteId, almacenId: fila.almacenId, cantidad: Number(cantidad), nota: nota || undefined }); toast.ok('Movimiento registrado'); onListo(); } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo="Movimiento de inventario" onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={!cantidad || Number(cantidad) === 0} onClick={guardar}>Guardar</button></>}>
      <div className="stack"><div><b>{fila.producto}</b> · {fila.talla}/{fila.color}<div className="small muted">{fila.sucursal} — {fila.almacen} · existencias {fila.cantidad}, reservado {fila.reservado}</div></div>
        <Campo label="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="ajuste">Ajuste (+/−) por conteo físico</option><option value="recepcion">Recepción (ingreso)</option><option value="devolucion">Devolución de cliente (ingreso)</option><option value="merma">Merma / pérdida (salida)</option></select></Campo>
        <Campo label="Cantidad" ayuda={tipo === 'ajuste' ? 'Usa un número negativo para restar' : 'Número positivo'}><input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus /></Campo>
        <Campo label="Nota"><input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} /></Campo>{error && <Alerta>{error}</Alerta>}</div>
    </Modal>
  );
}

function ConfigStock({ fila, onClose, onListo }: { fila: any; onClose: () => void; onListo: () => void }) {
  const [min, setMin] = useState(String(fila.stockMinimo)); const [rep, setRep] = useState(fila.reposicionEstimada ?? ''); const [error, setError] = useState('');
  async function guardar() { try { await patch('/inventario/stock', { varianteId: fila.varianteId, almacenId: fila.almacenId, stockMinimo: Number(min), reposicionEstimada: rep || null }); onListo(); } catch (e: any) { setError(e.message); } }
  return (
    <Modal titulo="Stock mínimo y reposición" onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
      <div className="stack"><b>{fila.producto} · {fila.talla}/{fila.color}</b><Campo label="Stock mínimo" ayuda="Por debajo de este disponible se marca como crítico"><input type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} /></Campo>
        <Campo label="Fecha estimada de reposición" ayuda="Se muestra al cliente cuando no hay stock"><input type="date" value={rep} onChange={(e) => setRep(e.target.value)} /></Campo>{error && <Alerta>{error}</Alerta>}</div>
    </Modal>
  );
}

function Alertas({ sucursalId }: { sucursalId: number | null }) {
  const { data, cargando } = useCarga(() => get(`/inventario/alertas${sucursalId ? `?sucursalId=${sucursalId}` : ''}`), [sucursalId], { cada: 30000 });
  if (cargando) return <Spinner />;
  return !data?.length ? <Alerta tipo="ok">Sin alertas: todo el inventario está sobre el mínimo 🎉</Alerta> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Producto</th><th>Variante</th><th>Sucursal</th><th className="right">Disponible</th><th className="right">Mínimo</th><th>Estado</th></tr></thead><tbody>{data.map((r: any) => <tr key={`${r.varianteId}-${r.almacenId}`}><td>{r.producto}</td><td>{r.talla}/{r.color}</td><td>{r.sucursal} <span className="small muted">({r.almacen})</span></td><td className="right"><b>{r.disponible}</b></td><td className="right">{r.stockMinimo}</td><td><Badge clase={ESTADO[r.estado]}>{r.estado}</Badge></td></tr>)}</tbody></table></div>;
}

function Movimientos({ sucursalId }: { sucursalId: number | null }) {
  const [tipo, setTipo] = useState(''); const [desde, setDesde] = useState('');
  const { data, cargando } = useCarga(() => get(`/inventario/movimientos?limite=300${sucursalId ? `&sucursalId=${sucursalId}` : ''}${tipo ? `&tipo=${tipo}` : ''}${desde ? `&desde=${desde}` : ''}`), [sucursalId, tipo, desde]);
  return (<>
    <div className="row"><select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ width: 'auto' }}><option value="">Todos los tipos</option>{Object.entries(TIPO_MOV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} aria-label="Desde" /><span className="small muted">Trazabilidad completa: cada venta, reserva, devolución y recepción deja su movimiento.</span></div>
    {cargando ? <Spinner /> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Prenda</th><th>Almacén</th><th className="right">Δ Exist.</th><th className="right">Δ Reserv.</th><th className="right">Saldo</th><th>Usuario / nota</th></tr></thead><tbody>
      {(data ?? []).map((m: any) => <tr key={m.id}><td className="nowrap">{fechaHora(m.fecha)}</td><td><Badge clase="marca">{TIPO_MOV[m.tipo] ?? m.tipo}</Badge></td><td>{m.producto} <span className="small muted">{m.talla}/{m.color}</span></td><td>{m.sucursal}<div className="small muted">{m.almacen}</div></td><td className="right" style={{ color: m.deltaCantidad < 0 ? 'var(--bad)' : m.deltaCantidad > 0 ? 'var(--ok)' : undefined }}>{m.deltaCantidad > 0 ? '+' : ''}{m.deltaCantidad || '—'}</td><td className="right">{m.deltaReservado > 0 ? '+' : ''}{m.deltaReservado || '—'}</td><td className="right">{m.saldoCantidad} / {m.saldoReservado}</td><td className="small">{m.usuario ?? 'Sistema'}<div className="muted">{m.nota}</div></td></tr>)}</tbody></table></div>}
  </>);
}

function Recepcion({ sucursalId }: { sucursalId: number | null }) {
  const toast = useToast(); const alm = useAlmacenes(sucursalId); const prov = useCarga(() => get('/proveedores'), []);
  const [almacenId, setAlmacenId] = useState(''); const [proveedorId, setProveedorId] = useState(''); const [nota, setNota] = useState('');
  const [items, setItems] = useState<{ variante: any; cantidad: number }[]>([]); const [sel, setSel] = useState<any>(null); const [cant, setCant] = useState('1'); const [k, setK] = useState(0); const [error, setError] = useState('');
  async function guardar() {
    setError('');
    try { await post('/inventario/recepciones', { almacenId: Number(almacenId), proveedorId: proveedorId ? Number(proveedorId) : undefined, nota: nota || undefined, items: items.map((i) => ({ varianteId: i.variante.id, cantidad: i.cantidad })) }); toast.ok('Recepción registrada: inventario actualizado'); setItems([]); setNota(''); } catch (e: any) { setError(e.message); }
  }
  return (
    <div className="card stack" style={{ maxWidth: 760 }}><h3>Recepción de mercadería</h3>
      <div className="form-grid"><Campo label="Almacén de destino"><select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}><option value="">Elige…</option>{(alm.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.sucursal} — {a.nombre}</option>)}</select></Campo>
        <Campo label="Proveedor"><select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}><option value="">(opcional)</option>{(prov.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo></div>
      <div className="card flat"><SelectorVariante key={k} onChange={setSel} /><div className="row mt"><Campo label="Cantidad"><input type="number" min={1} value={cant} onChange={(e) => setCant(e.target.value)} style={{ width: 100 }} /></Campo>
        <button className="btn sec" disabled={!sel || Number(cant) < 1} onClick={() => { setItems((x) => [...x, { variante: sel, cantidad: Number(cant) }]); setSel(null); setK(k + 1); setCant('1'); }}><Plus size={16} />Agregar a la recepción</button></div></div>
      {items.length > 0 && <div className="tabla-wrap"><table className="tabla"><tbody>{items.map((i, n) => <tr key={n}><td>{i.variante.producto} <span className="small muted">{i.variante.talla}/{i.variante.color}</span></td><td className="right">× {i.cantidad}</td><td className="right"><button className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== n))} aria-label="Quitar"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}
      <Campo label="Nota / documento del proveedor"><input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} /></Campo>{error && <Alerta>{error}</Alerta>}
      <button className="btn" disabled={!almacenId || !items.length} onClick={guardar}>Registrar recepción</button></div>
  );
}

function Transferencia({ sucursalId }: { sucursalId: number | null }) {
  const toast = useToast(); const origenes = useAlmacenes(sucursalId); const destinos = useAlmacenes(null);
  const [o, setO] = useState(''); const [d, setD] = useState(''); const [cant, setCant] = useState('1'); const [sel, setSel] = useState<any>(null); const [nota, setNota] = useState(''); const [error, setError] = useState(''); const [k, setK] = useState(0);
  async function ir() { setError(''); try { await post('/inventario/transferencias', { varianteId: sel.id, origenAlmacenId: Number(o), destinoAlmacenId: Number(d), cantidad: Number(cant), nota: nota || undefined }); toast.ok('Transferencia realizada'); setSel(null); setK(k + 1); } catch (e: any) { setError(e.message); } }
  return (
    <div className="card stack" style={{ maxWidth: 640 }}><h3>Transferir stock entre almacenes</h3><p className="muted small">Ej.: subir mercadería de la Bodega Central a la tienda para que esté disponible para reservas y ventas.</p>
      <div className="form-grid"><Campo label="Almacén de origen"><select value={o} onChange={(e) => setO(e.target.value)}><option value="">Elige…</option>{(origenes.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.sucursal} — {a.nombre}</option>)}</select></Campo>
        <Campo label="Almacén de destino"><select value={d} onChange={(e) => setD(e.target.value)}><option value="">Elige…</option>{(destinos.data ?? []).filter((a: any) => String(a.id) !== o).map((a: any) => <option key={a.id} value={a.id}>{a.sucursal} — {a.nombre}</option>)}</select></Campo></div>
      <SelectorVariante key={k} onChange={setSel} /><div className="form-grid"><Campo label="Cantidad"><input type="number" min={1} value={cant} onChange={(e) => setCant(e.target.value)} /></Campo><Campo label="Nota"><input value={nota} onChange={(e) => setNota(e.target.value)} /></Campo></div>
      {error && <Alerta>{error}</Alerta>}<button className="btn" disabled={!o || !d || !sel || Number(cant) < 1} onClick={ir}>Transferir</button></div>
  );
}
