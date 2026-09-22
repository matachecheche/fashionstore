import { useState } from 'react';
import { Plus } from 'lucide-react';
import { get, patch, post } from '../../api/client';
import { useCarga, useToast } from '../../context/App';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner, Tabs } from '../../components/ui';
import { fecha } from '../../lib/format';

interface CampoCfg { campo: string; label: string; tipo: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea'; req?: boolean; opciones?: string; etiqueta?: string; ayuda?: string; porDefecto?: any }
interface Cfg { titulo: string; path: string; todas?: boolean; columnas: { campo: string; titulo: string; render?: (v: any, f: any) => any }[]; campos: CampoCfg[]; flag: 'activa' | 'activo' }

const si = (v: any) => (v ? <Badge clase="ok">Sí</Badge> : <Badge clase="bad">No</Badge>);
const CONFIGS: Record<string, Cfg> = {
  categorias: { titulo: 'Categorías', path: 'categorias', todas: true, flag: 'activa', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'activa', titulo: 'Activa', render: si }], campos: [{ campo: 'nombre', label: 'Nombre', tipo: 'text', req: true }] },
  temporadas: { titulo: 'Temporadas', path: 'temporadas', todas: true, flag: 'activa', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'fechaInicio', titulo: 'Inicio', render: fecha }, { campo: 'fechaFin', titulo: 'Fin', render: fecha }, { campo: 'vigente', titulo: 'Vigente hoy', render: si }, { campo: 'activa', titulo: 'Activa', render: si }],
    campos: [{ campo: 'nombre', label: 'Nombre', tipo: 'text', req: true }, { campo: 'fechaInicio', label: 'Fecha de inicio', tipo: 'date', req: true }, { campo: 'fechaFin', label: 'Fecha de fin', tipo: 'date', req: true }] },
  colecciones: { titulo: 'Colecciones', path: 'colecciones', todas: true, flag: 'activa', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'temporada', titulo: 'Temporada' }, { campo: 'descripcion', titulo: 'Descripción' }, { campo: 'activa', titulo: 'Activa', render: si }],
    campos: [{ campo: 'temporadaId', label: 'Temporada', tipo: 'select', req: true, opciones: '/temporadas?todas=1' }, { campo: 'nombre', label: 'Nombre', tipo: 'text', req: true }, { campo: 'descripcion', label: 'Descripción', tipo: 'textarea' }] },
  promociones: { titulo: 'Promociones', path: 'promociones', todas: true, flag: 'activa', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'porcentaje', titulo: 'Descuento', render: (v) => `${v}%` }, { campo: 'alcance', titulo: 'Aplica a', render: (_, f) => f.producto ?? f.categoria ?? f.temporada ?? 'Toda la tienda' }, { campo: 'fechaInicio', titulo: 'Desde', render: fecha }, { campo: 'fechaFin', titulo: 'Hasta', render: fecha }, { campo: 'vigente', titulo: 'Vigente', render: si }],
    campos: [{ campo: 'nombre', label: 'Nombre', tipo: 'text', req: true }, { campo: 'porcentaje', label: 'Descuento (%)', tipo: 'number', req: true, ayuda: 'Entre 1 y 90' }, { campo: 'categoriaId', label: 'Categoría (opcional)', tipo: 'select', opciones: '/categorias' }, { campo: 'temporadaId', label: 'Temporada (opcional)', tipo: 'select', opciones: '/temporadas' }, { campo: 'productoId', label: 'Producto puntual (opcional)', tipo: 'select', opciones: '/productos?limite=200' }, { campo: 'fechaInicio', label: 'Desde', tipo: 'date' }, { campo: 'fechaFin', label: 'Hasta', tipo: 'date' }] },
  sucursales: { titulo: 'Sucursales', path: 'sucursales', todas: true, flag: 'activa', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'ciudad', titulo: 'Ciudad' }, { campo: 'direccion', titulo: 'Dirección' }, { campo: 'horario', titulo: 'Horario' }, { campo: 'activa', titulo: 'Activa', render: si }],
    campos: [{ campo: 'nombre', label: 'Nombre', tipo: 'text', req: true }, { campo: 'ciudad', label: 'Ciudad', tipo: 'text', req: true }, { campo: 'direccion', label: 'Dirección', tipo: 'text' }, { campo: 'telefono', label: 'Teléfono', tipo: 'text' }, { campo: 'horario', label: 'Horario', tipo: 'text' }, { campo: 'latitud', label: 'Latitud', tipo: 'number', ayuda: 'Sirve para sugerir la sucursal más cercana' }, { campo: 'longitud', label: 'Longitud', tipo: 'number' }] },
  almacenes: { titulo: 'Almacenes', path: 'almacenes', flag: 'activo', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'sucursal', titulo: 'Sucursal' }, { campo: 'esTienda', titulo: 'Es tienda', render: si }, { campo: 'activo', titulo: 'Activo', render: si }],
    campos: [{ campo: 'sucursalId', label: 'Sucursal', tipo: 'select', req: true, opciones: '/sucursales?todas=1' }, { campo: 'nombre', label: 'Nombre', tipo: 'text', req: true }, { campo: 'esTienda', label: 'Es el almacén de venta (tienda)', tipo: 'checkbox', ayuda: 'Cada sucursal ya tiene una tienda; normalmente aquí se crean bodegas' }] },
  proveedores: { titulo: 'Proveedores', path: 'proveedores', flag: 'activo', columnas: [{ campo: 'nombre', titulo: 'Nombre' }, { campo: 'contacto', titulo: 'Contacto' }, { campo: 'email', titulo: 'Correo' }, { campo: 'telefono', titulo: 'Teléfono' }, { campo: 'activo', titulo: 'Activo', render: si }],
    campos: [{ campo: 'nombre', label: 'Razón social / nombre', tipo: 'text', req: true }, { campo: 'contacto', label: 'Persona de contacto', tipo: 'text' }, { campo: 'email', label: 'Correo', tipo: 'text' }, { campo: 'telefono', label: 'Teléfono', tipo: 'text' }] },
};

function Maestro({ cfg }: { cfg: Cfg }) {
  const toast = useToast();
  const { data, cargando, error, recargar } = useCarga(() => get(`/${cfg.path}${cfg.todas ? '?todas=1' : ''}`), [cfg.path]);
  const [edit, setEdit] = useState<any>(null);   // null = cerrado, {} = nuevo
  return (<>
    <div className="row between mb"><h2 style={{ margin: 0 }}>{cfg.titulo}</h2><button className="btn" onClick={() => setEdit({})}><Plus size={16} />Nuevo</button></div>
    {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
    {cargando ? <Spinner /> : <div className="tabla-wrap"><table className="tabla"><thead><tr>{cfg.columnas.map((c) => <th key={c.campo}>{c.titulo}</th>)}<th /></tr></thead><tbody>
      {(data ?? []).map((f: any) => <tr key={f.id} style={f[cfg.flag] === false ? { opacity: .55 } : {}}>{cfg.columnas.map((c) => <td key={c.campo}>{c.render ? c.render(f[c.campo], f) : (f[c.campo] ?? '—')}</td>)}
        <td className="nowrap right"><button className="btn sm sec" onClick={() => setEdit(f)}>Editar</button> <button className="btn sm ghost" onClick={async () => { try { await patch(`/${cfg.path}/${f.id}`, { [cfg.flag]: !f[cfg.flag] }); toast.ok(f[cfg.flag] ? 'Desactivado' : 'Activado'); recargar(true); } catch (e: any) { toast.error(e.message); } }}>{f[cfg.flag] ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div>}
    {edit && <Formulario cfg={cfg} fila={edit} onClose={() => setEdit(null)} onListo={() => { setEdit(null); recargar(true); }} />}
  </>);
}

function Opciones({ ruta }: { ruta: string }) {
  const { data } = useCarga(() => get(ruta), [ruta]);
  return <>{(data ?? []).map((o: any) => <option key={o.id} value={o.id}>{o.nombre}{o.ciudad ? ` (${o.ciudad})` : ''}</option>)}</>;
}

function Formulario({ cfg, fila, onClose, onListo }: { cfg: Cfg; fila: any; onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const nuevo = !fila.id;
  const [v, setV] = useState<any>(() => Object.fromEntries(cfg.campos.map((c) => [c.campo, fila[c.campo] ?? c.porDefecto ?? (c.tipo === 'checkbox' ? false : '')]))); const [error, setError] = useState('');
  async function guardar() {
    setError('');
    const cuerpo: any = {}; for (const c of cfg.campos) { const x = v[c.campo]; if (c.tipo === 'checkbox') cuerpo[c.campo] = !!x; else if (x !== '' && x !== null) cuerpo[c.campo] = c.tipo === 'number' || c.tipo === 'select' ? Number(x) : x; else if (!nuevo) cuerpo[c.campo] = null; }
    try { nuevo ? await post(`/${cfg.path}`, cuerpo) : await patch(`/${cfg.path}/${fila.id}`, cuerpo); toast.ok('Guardado'); onListo(); } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo={`${nuevo ? 'Nuevo' : 'Editar'} · ${cfg.titulo}`} onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
      <div className="form-grid">{cfg.campos.map((c) => (
        <Campo key={c.campo} label={c.label + (c.req ? ' *' : '')} ayuda={c.ayuda}>
          {c.tipo === 'select' ? <select value={v[c.campo] ?? ''} onChange={(e) => setV({ ...v, [c.campo]: e.target.value })}><option value="">{c.req ? 'Elige…' : '— ninguno —'}</option><Opciones ruta={c.opciones!} /></select>
            : c.tipo === 'checkbox' ? <label className="check"><input type="checkbox" checked={!!v[c.campo]} onChange={(e) => setV({ ...v, [c.campo]: e.target.checked })} />Sí</label>
            : c.tipo === 'textarea' ? <textarea value={v[c.campo] ?? ''} onChange={(e) => setV({ ...v, [c.campo]: e.target.value })} />
            : <input type={c.tipo} step={c.tipo === 'number' ? 'any' : undefined} value={v[c.campo] ?? ''} onChange={(e) => setV({ ...v, [c.campo]: e.target.value })} />}</Campo>))}</div>
      {error && <div className="mt"><Alerta>{error}</Alerta></div>}
    </Modal>
  );
}

const grupo = (ids: string[]) => function Grupo() { const [t, setT] = useState(ids[0]); return (<div><h1>{ids === GRUPO_CAT ? 'Catálogo y promociones' : 'Sucursales, almacenes y proveedores'}</h1><Tabs tabs={ids.map((i) => ({ id: i, titulo: CONFIGS[i].titulo }))} actual={t} onChange={setT} /><Maestro key={t} cfg={CONFIGS[t]} /></div>); };
const GRUPO_CAT = ['categorias', 'temporadas', 'colecciones', 'promociones']; const GRUPO_ORG = ['sucursales', 'almacenes', 'proveedores'];
export const Catalogos = grupo(GRUPO_CAT); export const Organizacion = grupo(GRUPO_ORG);
