import { useState } from 'react';
import { Plus } from 'lucide-react';
import { get, patch, post } from '../../api/client';
import { useAuth, useCarga, useDatos, useToast } from '../../context/App';
import { Alerta, Badge, Campo, ErrorCarga, Modal, Spinner } from '../../components/ui';
import { fechaHora, ROL } from '../../lib/format';

// CU-12 (parte administrador): gestionar usuarios y roles
export default function Usuarios() {
  const { usuario } = useAuth(); const toast = useToast(); const [q, setQ] = useState(''); const [rol, setRol] = useState(''); const [edit, setEdit] = useState<any>(null);
  const { data, cargando, error, recargar } = useCarga(() => get(`/usuarios?${rol ? `rol=${rol}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`), [q, rol]);
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Usuarios</h1><div className="row"><input placeholder="Buscar nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 230 }} /><select value={rol} onChange={(e) => setRol(e.target.value)} style={{ width: 'auto' }}><option value="">Todos los roles</option>{Object.entries(ROL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn" onClick={() => setEdit({})}><Plus size={16} />Nuevo usuario</button></div></div>
      {error && <ErrorCarga mensaje={error} reintentar={() => recargar()} />}
      {cargando && !data ? <Spinner /> : <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal / proveedor</th><th>Último acceso</th><th>Estado</th><th /></tr></thead><tbody>
        {(data ?? []).map((u: any) => <tr key={u.id} style={u.activo ? {} : { opacity: .55 }}><td><b>{u.nombre}</b><div className="small muted">{u.telefono}</div></td><td>{u.email}</td><td><Badge clase="marca">{ROL[u.rol]}</Badge></td><td>{u.sucursal ?? u.proveedor ?? '—'}</td><td className="small">{fechaHora(u.ultimoAcceso)}</td><td>{u.activo ? <Badge clase="ok">Activo</Badge> : <Badge clase="bad">Desactivado</Badge>}</td>
          <td className="nowrap"><button className="btn sm sec" onClick={() => setEdit(u)}>Editar</button> {u.id !== usuario?.id && <button className="btn sm ghost" onClick={async () => { try { await patch(`/usuarios/${u.id}`, { activo: !u.activo }); toast.ok(u.activo ? 'Cuenta desactivada' : 'Cuenta activada'); recargar(true); } catch (e: any) { toast.error(e.message); } }}>{u.activo ? 'Desactivar' : 'Activar'}</button>}</td></tr>)}</tbody></table></div>}
      {edit && <Formulario u={edit} onClose={() => setEdit(null)} onListo={() => { setEdit(null); recargar(true); }} />}
    </div>
  );
}

function Formulario({ u, onClose, onListo }: { u: any; onClose: () => void; onListo: () => void }) {
  const toast = useToast(); const { sucursales } = useDatos(); const provs = useCarga(() => get('/proveedores'), []); const nuevo = !u.id;
  const [f, setF] = useState({ nombre: u.nombre ?? '', email: u.email ?? '', rol: u.rol ?? 'cajero', telefono: u.telefono ?? '', sucursalId: u.sucursalId ?? '', proveedorId: u.proveedorId ?? '', password: '' }); const [error, setError] = useState('');
  async function guardar() {
    setError('');
    const cuerpo: any = { nombre: f.nombre, rol: f.rol, telefono: f.telefono || undefined, sucursalId: ['encargado', 'cajero'].includes(f.rol) && f.sucursalId ? Number(f.sucursalId) : undefined, proveedorId: f.rol === 'proveedor' && f.proveedorId ? Number(f.proveedorId) : undefined };
    if (f.password) cuerpo.password = f.password;
    try { nuevo ? await post('/usuarios', { ...cuerpo, email: f.email }) : await patch(`/usuarios/${u.id}`, cuerpo); toast.ok('Usuario guardado'); onListo(); } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo={nuevo ? 'Nuevo usuario' : `Editar · ${u.nombre}`} onClose={onClose} pie={<><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
      <div className="form-grid">
        <Campo label="Nombre completo *"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo label="Correo *"><input type="email" value={f.email} disabled={!nuevo} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo label="Rol *"><select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>{Object.entries(ROL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="Teléfono"><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        {['encargado', 'cajero'].includes(f.rol) && <Campo label="Sucursal asignada *"><select value={f.sucursalId} onChange={(e) => setF({ ...f, sucursalId: e.target.value })}><option value="">Elige…</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>}
        {f.rol === 'proveedor' && <Campo label="Proveedor vinculado *"><select value={f.proveedorId} onChange={(e) => setF({ ...f, proveedorId: e.target.value })}><option value="">Elige…</option>{(provs.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>}
        <Campo label={nuevo ? 'Contraseña *' : 'Nueva contraseña (opcional)'} ayuda="Mínimo 6 caracteres"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Campo></div>
      {error && <div className="mt"><Alerta>{error}</Alerta></div>}
    </Modal>
  );
}
