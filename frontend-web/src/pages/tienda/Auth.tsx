import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/App';
import { Alerta, Campo } from '../../components/ui';

export const destinoPorRol = (rol: string) => (rol === 'cajero' ? '/panel/pos' : rol === 'proveedor' ? '/panel/propuestas' : rol === 'cliente' ? '/' : '/panel');

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate(); const loc: any = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [cargando, setCargando] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault(); setError(''); setCargando(true);
    try { const u = await login(email, password); nav(loc.state?.desde || destinoPorRol(u.rol), { replace: true }); } catch (err: any) { setError(err.message); } finally { setCargando(false); }
  }
  return (
    <div className="card auth-caja"><h2>Iniciar sesión</h2><p className="muted small">Ingresa con tu correo y contraseña.</p>
      <form className="stack" onSubmit={enviar}>
        <Campo label="Correo electrónico"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" /></Campo>
        <Campo label="Contraseña"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Campo>
        {error && <Alerta>{error}</Alerta>}
        <button className="btn block lg" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p className="small center mt">¿No tienes cuenta? <Link to="/registro">Crear cuenta</Link></p>
      <details className="small muted"><summary>Cuentas de demostración</summary>
        <div>cliente@fashionstore.test / Cliente123!<br />admin@fashionstore.test / Admin123!<br />encargado@fashionstore.test / Encargado123!<br />cajero@fashionstore.test / Cajero123!<br />proveedor@fashionstore.test / Proveedor123!</div></details>
    </div>
  );
}

export function Registro() {
  const { registrar } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ nombre: '', email: '', telefono: '', password: '', repetir: '' }); const [error, setError] = useState(''); const [cargando, setCargando] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function enviar(e: FormEvent) {
    e.preventDefault(); setError('');
    if (f.password !== f.repetir) return setError('Las contraseñas no coinciden.');
    setCargando(true);
    try { await registrar({ nombre: f.nombre, email: f.email, password: f.password, telefono: f.telefono || undefined }); nav('/'); } catch (err: any) { setError(err.message); } finally { setCargando(false); }
  }
  return (
    <div className="card auth-caja"><h2>Crear cuenta</h2><p className="muted small">Regístrate para reservar, comprar y recibir recomendaciones.</p>
      <form className="stack" onSubmit={enviar}>
        <Campo label="Nombre completo"><input value={f.nombre} onChange={set('nombre')} required minLength={2} autoFocus /></Campo>
        <Campo label="Correo electrónico"><input type="email" value={f.email} onChange={set('email')} required /></Campo>
        <Campo label="Teléfono (opcional)"><input value={f.telefono} onChange={set('telefono')} inputMode="tel" /></Campo>
        <Campo label="Contraseña" ayuda="Mínimo 6 caracteres"><input type="password" value={f.password} onChange={set('password')} required minLength={6} autoComplete="new-password" /></Campo>
        <Campo label="Repite la contraseña"><input type="password" value={f.repetir} onChange={set('repetir')} required autoComplete="new-password" /></Campo>
        {error && <Alerta>{error}</Alerta>}
        <button className="btn block lg" disabled={cargando}>{cargando ? 'Creando…' : 'Crear cuenta'}</button>
      </form>
      <p className="small center mt">¿Ya tienes cuenta? <Link to="/login">Ingresar</Link></p>
    </div>
  );
}
