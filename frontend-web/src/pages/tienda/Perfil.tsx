import { FormEvent, useState } from 'react';
import { get, patch, post } from '../../api/client';
import { useAuth, useCarga, useToast } from '../../context/App';
import { Alerta, Campo, Tip } from '../../components/ui';
import { ROL, TALLAS } from '../../lib/format';

export default function Perfil() {
  const { usuario, refrescar } = useAuth(); const toast = useToast();
  const colores = useCarga(() => get('/productos/filtros'), []);
  const [f, setF] = useState({ nombre: usuario?.nombre ?? '', telefono: usuario?.telefono ?? '', documento: usuario?.documento ?? '' });
  const pref = usuario?.preferencias ?? {};
  const [talla, setTalla] = useState<string>(pref.tallaHabitual ?? ''); const [favs, setFavs] = useState<string[]>(pref.coloresFavoritos ?? []); const [presu, setPresu] = useState<string>(pref.presupuestoMax ?? '');
  const [pw, setPw] = useState({ actual: '', nueva: '' }); const [errPw, setErrPw] = useState('');
  if (!usuario) return null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    try { await patch('/auth/me', { ...f, preferencias: { ...pref, tallaHabitual: talla || undefined, coloresFavoritos: favs, presupuestoMax: presu ? Number(presu) : undefined } }); await refrescar(); toast.ok('Perfil actualizado'); } catch (err: any) { toast.error(err.message); }
  }
  async function cambiarPw(e: FormEvent) {
    e.preventDefault(); setErrPw('');
    try { await post('/auth/me/password', pw); setPw({ actual: '', nueva: '' }); toast.ok('Contraseña actualizada'); } catch (err: any) { setErrPw(err.message); }
  }
  const nombres = (colores.data ?? []).filter((c: any) => c.tipo === 'color');
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <form className="card stack" onSubmit={guardar}>
        <h2>Mi perfil</h2><div className="small muted">{usuario.email} · {ROL[usuario.rol]}</div>
        <Campo label="Nombre completo"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Campo>
        <div className="form-grid"><Campo label="Teléfono"><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo><Campo label="NIT / CI (para comprobantes)"><input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></Campo></div>
        {usuario.rol === 'cliente' && <>
          <h3 className="mt">Preferencias <Tip texto="Mejoran las recomendaciones de la IA: solo se usan para sugerirte prendas.">ℹ️</Tip></h3>
          <div className="form-grid"><Campo label="Talla habitual"><select value={talla} onChange={(e) => setTalla(e.target.value)}><option value="">Sin preferencia</option>{TALLAS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
            <Campo label="Presupuesto máximo por prenda (Bs)"><input type="number" min={0} value={presu} onChange={(e) => setPresu(e.target.value)} /></Campo></div>
          <div><div className="small" style={{ fontWeight: 600, color: 'var(--gris)', marginBottom: 6 }}>Colores favoritos</div><div className="swatches">{nombres.map((c: any) => <button type="button" key={c.valor} className={`swatch ${favs.includes(c.valor) ? 'act' : ''}`} style={{ background: c.hex, width: 30, height: 30 }} title={c.valor} aria-label={c.valor} onClick={() => setFavs(favs.includes(c.valor) ? favs.filter((x) => x !== c.valor) : [...favs, c.valor])} />)}</div></div></>}
        <button className="btn">Guardar cambios</button>
      </form>
      <form className="card stack" onSubmit={cambiarPw}><h2>Cambiar contraseña</h2>
        <Campo label="Contraseña actual"><input type="password" value={pw.actual} onChange={(e) => setPw({ ...pw, actual: e.target.value })} required autoComplete="current-password" /></Campo>
        <Campo label="Nueva contraseña" ayuda="Mínimo 6 caracteres"><input type="password" value={pw.nueva} onChange={(e) => setPw({ ...pw, nueva: e.target.value })} required minLength={6} autoComplete="new-password" /></Campo>
        {errPw && <Alerta>{errPw}</Alerta>}<button className="btn sec">Actualizar contraseña</button></form>
    </div>
  );
}
