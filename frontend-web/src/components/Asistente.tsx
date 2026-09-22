import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MessageCircle, Send, X } from 'lucide-react';
import { post, img } from '../api/client';
import { bs } from '../lib/format';
import { useDatos } from '../context/App';

interface Msg { rol: 'user' | 'assistant'; texto: string; productos?: any[]; sugerencias?: string[] }

// Asistente virtual (Parte III): responde dudas de uso y recomienda prendas con datos reales del catalogo
export default function Asistente() {
  const { sucursalId } = useDatos();
  const [abierto, setAbierto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ rol: 'assistant', texto: '¡Hola! Soy el asistente de FashionStore 👗 Puedo ayudarte a encontrar prendas y a usar la plataforma. ¿Qué buscas hoy?', sugerencias: ['Vestidos para una fiesta de verano', '¿Cómo reservo una prenda?', '¿Qué hay en oferta?'] }]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, abierto]);

  async function enviar(t: string) {
    const m = t.trim(); if (!m || cargando) return;
    const historial = msgs.slice(-8).map((x) => ({ rol: x.rol, texto: x.texto }));
    setMsgs((x) => [...x, { rol: 'user', texto: m }]); setTexto(''); setCargando(true);
    try {
      const r = await post('/ia/chat', { mensaje: m, sucursalId: sucursalId ?? undefined, historial });
      setMsgs((x) => [...x, { rol: 'assistant', texto: r.respuesta, productos: r.productos, sugerencias: r.sugerencias }]);
    } catch (e: any) { setMsgs((x) => [...x, { rol: 'assistant', texto: `No pude responder ahora: ${e.message}` }]); }
    setCargando(false);
  }

  // Dictado por voz (Web Speech API; disponible en Chrome/Edge)
  function dictar() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMsgs((x) => [...x, { rol: 'assistant', texto: 'Tu navegador no permite dictado por voz. Usa Chrome o Edge, o escribe tu consulta.' }]); return; }
    const r = new SR(); r.lang = 'es-BO'; r.interimResults = false;
    r.onstart = () => setEscuchando(true); r.onend = () => setEscuchando(false); r.onerror = () => setEscuchando(false);
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setTexto(t); enviar(t); };
    r.start();
  }

  return (<>
    <button className="chat-fab" onClick={() => setAbierto((a) => !a)} aria-label="Abrir asistente virtual" title="Asistente virtual">{abierto ? <X /> : <MessageCircle />}</button>
    {abierto && (
      <div className="chat" role="dialog" aria-label="Asistente virtual">
        <header><div><b>Asistente FashionStore</b><div className="small" style={{ opacity: .85 }}>IA · datos reales del catálogo</div></div><button className="icon-btn" style={{ color: '#fff' }} onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={18} /></button></header>
        <div className="msgs">
          {msgs.map((m, i) => (
            <div key={i} className="col" style={{ alignItems: m.rol === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`msg ${m.rol === 'user' ? 'yo' : 'bot'}`}>{m.texto.replace(/\*\*/g, '')}</div>
              {m.productos?.slice(0, 4).map((p) => (
                <Link key={p.productoId} to={`/producto/${p.productoId}`} className="mini-prod" onClick={() => setAbierto(false)}>
                  <img src={img(p.imagen)} alt="" /><div><div style={{ fontWeight: 600, fontSize: '.85rem' }}>{p.nombre}</div><div className="precio" style={{ fontSize: '.85rem' }}>{bs(p.precioVigente)}</div></div>
                </Link>))}
              {i === msgs.length - 1 && m.sugerencias && <div className="chips">{m.sugerencias.map((s) => <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>)}</div>}
            </div>
          ))}
          {cargando && <div className="msg bot">Escribiendo…</div>}
          <div ref={fin} />
        </div>
        <form className="entrada" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={escuchando ? 'Escuchando…' : 'Escribe o dicta tu consulta'} aria-label="Mensaje" maxLength={500} />
          <button type="button" className="icon-btn" onClick={dictar} title="Dictar por voz" aria-label="Dictar por voz" style={escuchando ? { color: 'var(--bad)' } : {}}><Mic size={20} /></button>
          <button className="btn sm" disabled={cargando || !texto.trim()} aria-label="Enviar"><Send size={16} /></button>
        </form>
      </div>)}
  </>);
}
