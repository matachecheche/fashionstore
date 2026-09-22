import { useState } from 'react';
import { Mic } from 'lucide-react';
import { post } from '../../api/client';
import { useToast } from '../../context/App';
import { Alerta, Badge, Spinner } from '../../components/ui';

const SUG = ['Ventas por sucursal', 'Prendas más vendidas', 'Prendas más reservadas', 'Inventario crítico', 'Ventas por método de pago', 'Ventas por mes', 'Mejores clientes', 'Reservas por estado'];
const fmt = (v: any) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v ?? '—');

// Reportes bajo demanda con lenguaje natural (Text-to-SQL) por texto o por voz (opcional, Cap. 8.2 del documento)
export default function Reportes() {
  const toast = useToast(); const [q, setQ] = useState(''); const [res, setRes] = useState<any>(null); const [cargando, setCargando] = useState(false); const [error, setError] = useState(''); const [escuchando, setEscuchando] = useState(false);
  async function preguntar(texto = q) {
    if (texto.trim().length < 3) return; setCargando(true); setError(''); setRes(null);
    try { setRes(await post('/ia/reportes', { pregunta: texto })); } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }
  function voz() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast.error('Tu navegador no permite dictado por voz. Usa Chrome o Edge.');
    const r = new SR(); r.lang = 'es-BO'; r.onstart = () => setEscuchando(true); r.onend = () => setEscuchando(false); r.onerror = () => setEscuchando(false);
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setQ(t); preguntar(t); }; r.start();
  }
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><h1>Reportes con inteligencia artificial</h1><p className="muted">Pregunta en lenguaje natural o dicta con tu voz. La consulta se ejecuta en modo <b>solo lectura</b>.</p></div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); preguntar(); }}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={escuchando ? 'Escuchando…' : 'Ej.: ¿cuáles son las prendas más reservadas? · ventas por sucursal'} aria-label="Pregunta" style={{ minWidth: 260 }} />
        <button type="button" className="btn sec" onClick={voz} style={escuchando ? { borderColor: 'var(--bad)', color: 'var(--bad)' } : {}}><Mic size={18} />{escuchando ? 'Escuchando' : 'Voz'}</button><button className="btn" disabled={cargando}>Consultar</button></form>
      <div className="chips">{SUG.map((s) => <button key={s} className="chip" onClick={() => { setQ(s); preguntar(s); }}>{s}</button>)}</div>
      {cargando && <Spinner />}{error && <Alerta>{error}</Alerta>}
      {res && <div className="card stack"><div className="row between"><h3 style={{ margin: 0 }}>{res.titulo}</h3><Badge clase={res.modo === 'gemini' ? 'ok' : 'info'}>{res.modo === 'gemini' ? 'Generado con IA' : 'Plantilla'}</Badge></div><p style={{ margin: 0 }}>{res.resumen}</p>
        {res.filas.length ? <div className="tabla-wrap"><table className="tabla"><thead><tr>{res.columnas.map((c: string) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead><tbody>{res.filas.map((f: any, i: number) => <tr key={i}>{res.columnas.map((c: string) => <td key={c}>{fmt(f[c])}</td>)}</tr>)}</tbody></table></div> : <div className="muted">La consulta no devolvió filas.</div>}
        <details><summary className="small muted">Ver SQL ejecutado</summary><pre style={{ background: '#f6f0f2', padding: 12, borderRadius: 10, overflow: 'auto', fontSize: '.8rem' }}>{res.sql}</pre></details></div>}
    </div>
  );
}
