import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, CameraOff, Download, Smartphone } from 'lucide-react';
import { get, img, post } from '../../api/client';
import { useAuth, useCarga, useCarrito, useToast } from '../../context/App';
import { Alerta, Campo, Spinner } from '../../components/ui';
import ReservarDialog from '../../components/Reservar';

// CU-06 Vestidor virtual (vista previa web con camara). La experiencia completa con seguimiento corporal esta en la app movil.
const INICIAL: Record<string, { cx: number; cy: number; ancho: number }> = {
  superior: { cx: 0.5, cy: 0.38, ancho: 0.78 }, abrigo: { cx: 0.5, cy: 0.42, ancho: 0.86 }, vestido: { cx: 0.5, cy: 0.52, ancho: 0.72 },
  inferior: { cx: 0.5, cy: 0.66, ancho: 0.58 }, calzado: { cx: 0.5, cy: 0.86, ancho: 0.62 }, accesorio: { cx: 0.72, cy: 0.58, ancho: 0.36 },
};

export default function Vestidor() {
  const [sp, setSp] = useSearchParams(); const toast = useToast(); const { usuario } = useAuth(); const { agregar } = useCarrito(); const nav = useNavigate();
  const lista = useCarga(() => get('/productos?limite=100'), []);
  const productoId = Number(sp.get('producto')) || 0; const colorParam = sp.get('color') || '';
  const [ar, setAr] = useState<any>(null); const [cargandoAr, setCargandoAr] = useState(false);
  const [camara, setCamara] = useState<'apagada' | 'activa' | 'error'>('apagada'); const [errCam, setErrCam] = useState('');
  const [pos, setPos] = useState({ cx: 0.5, cy: 0.5, ancho: 0.7 }); const [rot, setRot] = useState(0);
  const [talla, setTalla] = useState(''); const [reservar, setReservar] = useState(false);
  const video = useRef<HTMLVideoElement>(null); const caja = useRef<HTMLDivElement>(null); const arrastre = useRef<{ dx: number; dy: number } | null>(null);
  const compatibles = (lista.data ?? []).filter((p: any) => p.imagenes.some((i: any) => i.esOverlayAr));
  const prod = compatibles.find((p: any) => p.id === productoId);

  // el microservicio de IA/AR entrega caracteristicas visuales y parametros de ajuste; si no responde se usan los datos del catalogo
  useEffect(() => {
    if (!productoId) { setAr(null); return; }
    setCargandoAr(true);
    get(`/ia/ar/${productoId}${colorParam ? `?color=${encodeURIComponent(colorParam)}` : ''}`).then((r) => { setAr(r); setPos(r.ajuste?.inicial ?? INICIAL.superior); setRot(0); }).catch(() => {
      if (!prod) return;
      const ov = prod.imagenes.find((i: any) => i.esOverlayAr && (!colorParam || (i.color ?? '').toLowerCase() === colorParam.toLowerCase())) ?? prod.imagenes.find((i: any) => i.esOverlayAr);
      setAr({ overlayUrl: ov.url, proporcion: 0.714, colores: [...new Map(prod.variantes.map((v: any) => [v.color, { nombre: v.color, hex: v.colorHex }])).values()], caracteristicas: { tipo: prod.arTipo, color: colorParam || ov.color }, guia: 'Colócate de frente a la cámara.', galeria: prod.imagenes.filter((i: any) => !i.esOverlayAr).map((i: any) => i.url) });
      setPos(INICIAL[prod.arTipo] ?? INICIAL.superior);
    }).finally(() => setCargandoAr(false));
    post('/ia/interacciones', { productoId, tipo: 'probador' }).catch(() => {});
    // eslint-disable-next-line
  }, [productoId, colorParam, lista.data]);

  const iniciar = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
      if (video.current) { video.current.srcObject = s; await video.current.play(); } setCamara('activa');
    } catch (e: any) { setCamara('error'); setErrCam(window.isSecureContext ? 'No se pudo acceder a la cámara. Concede el permiso en tu navegador.' : 'El navegador exige HTTPS (o localhost) para usar la cámara.'); }
  }, []);
  useEffect(() => () => { (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); }, []);

  function down(e: React.PointerEvent) {
    const r = caja.current!.getBoundingClientRect(); arrastre.current = { dx: e.clientX - (r.left + pos.cx * r.width), dy: e.clientY - (r.top + pos.cy * r.height) }; (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!arrastre.current) return; const r = caja.current!.getBoundingClientRect();
    setPos((p) => ({ ...p, cx: Math.min(1.1, Math.max(-0.1, (e.clientX - arrastre.current!.dx - r.left) / r.width)), cy: Math.min(1.1, Math.max(-0.1, (e.clientY - arrastre.current!.dy - r.top) / r.height)) }));
  }

  async function capturar() {
    const c = caja.current!; const W = c.clientWidth, H = c.clientHeight; const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; const g = cv.getContext('2d')!; g.scale(2, 2);
    g.fillStyle = '#222'; g.fillRect(0, 0, W, H);
    if (video.current && camara === 'activa') { const v = video.current; const rv = v.videoWidth / v.videoHeight, rc = W / H; let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0; if (rv > rc) { sw = v.videoHeight * rc; sx = (v.videoWidth - sw) / 2; } else { sh = v.videoWidth / rc; sy = (v.videoHeight - sh) / 2; } g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(v, sx, sy, sw, sh, 0, 0, W, H); g.restore(); }
    const im = new Image(); im.crossOrigin = 'anonymous';
    await new Promise<void>((ok, fail) => { im.onload = () => ok(); im.onerror = () => fail(); im.src = img(ar.overlayUrl); }).catch(() => {});
    const w = pos.ancho * W, h = w / (ar.proporcion || 0.714); g.save(); g.translate(pos.cx * W, pos.cy * H); g.rotate((rot * Math.PI) / 180); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
    const a = document.createElement('a'); a.download = 'mi-prueba-fashionstore.png'; a.href = cv.toDataURL('image/png'); a.click(); toast.ok('Imagen guardada');
  }

  const prodActual = (lista.data ?? []).find((p: any) => p.id === productoId);
  const variante = prodActual?.variantes.find((v: any) => v.color.toLowerCase() === (ar?.caracteristicas?.color ?? colorParam).toLowerCase() && v.talla === talla);
  const w = pos.ancho * 100;
  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><h1>Vestidor virtual</h1><p className="muted">Superpone la prenda sobre tu imagen con la cámara. Arrastra para moverla y usa los controles para ajustar tamaño y giro.</p></div>
      <Alerta tipo="info"><Smartphone size={16} style={{ verticalAlign: -3 }} /> <b>Vista previa web.</b> La app móvil FashionStore incluye el vestidor con <b>seguimiento automático del cuerpo</b> (la prenda se ajusta a tus hombros y caderas) y captura de fotos.</Alerta>
      <div className="detalle" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="probador" ref={caja} onPointerMove={move} onPointerUp={() => (arrastre.current = null)}>
            <video ref={video} playsInline muted style={{ display: camara === 'activa' ? 'block' : 'none' }} />
            {camara !== 'activa' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', textAlign: 'center', padding: 20 }}>{camara === 'error' ? <div><CameraOff size={40} /><p>{errCam}</p></div> : <div><Camera size={40} /><p>Activa la cámara para probarte la prenda</p></div>}</div>}
            {ar?.overlayUrl && <img className="prenda-ar" src={img(ar.overlayUrl)} alt="Prenda" draggable={false} onPointerDown={down} style={{ width: `${w}%`, left: `${pos.cx * 100}%`, top: `${pos.cy * 100}%`, transform: `translate(-50%,-50%) rotate(${rot}deg)`, filter: 'drop-shadow(0 6px 10px #0006)' }} />}
          </div>
          <div className="row mt" style={{ justifyContent: 'center' }}>{camara !== 'activa' ? <button className="btn" onClick={iniciar}><Camera size={18} />Activar cámara</button> : <button className="btn sec" onClick={() => { (video.current?.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop()); setCamara('apagada'); }}>Apagar cámara</button>}<button className="btn" disabled={!ar?.overlayUrl} onClick={capturar}><Download size={18} />Capturar</button></div>
          {ar?.guia && <div className="small muted center mt">{ar.guia}</div>}
        </div>
        <div className="card stack">
          <Campo label="Prenda"><select value={productoId || ''} onChange={(e) => setSp(e.target.value ? { producto: e.target.value } : {})}><option value="">Elige una prenda…</option>{compatibles.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
          {cargandoAr && <Spinner />}
          {ar && <>
            <div><div className="small" style={{ fontWeight: 600, color: 'var(--gris)', marginBottom: 6 }}>Color</div><div className="swatches">{ar.colores.filter((c: any) => c.overlayUrl !== null || !c.overlayUrl).map((c: any) => <button key={c.nombre} className={`swatch ${(ar.caracteristicas.color ?? '').toLowerCase() === c.nombre.toLowerCase() ? 'act' : ''}`} style={{ background: c.hex, width: 30, height: 30 }} title={c.nombre} aria-label={c.nombre} onClick={() => setSp({ producto: String(productoId), color: c.nombre })} />)}</div></div>
            <Campo label={`Tamaño (${Math.round(pos.ancho * 100)}%)`}><input type="range" min={20} max={130} value={pos.ancho * 100} onChange={(e) => setPos({ ...pos, ancho: Number(e.target.value) / 100 })} /></Campo>
            <Campo label={`Giro (${rot}°)`}><input type="range" min={-40} max={40} value={rot} onChange={(e) => setRot(Number(e.target.value))} /></Campo>
            <button className="btn sm ghost" onClick={() => { setPos(ar.ajuste?.inicial ?? INICIAL[ar.caracteristicas.tipo] ?? INICIAL.superior); setRot(0); }}>Restablecer posición</button>
            <div className="card flat small"><b>Características de la prenda</b><br />Tipo: {ar.caracteristicas.tipo} · Color: {ar.caracteristicas.color} · Textura: {ar.caracteristicas.textura ?? '—'}{ar.caracteristicas.material ? ` · ${ar.caracteristicas.material}` : ''}</div>
            {prodActual && <><Campo label="Talla"><select value={talla} onChange={(e) => setTalla(e.target.value)}><option value="">Elige…</option>{prodActual.variantes.filter((v: any) => v.color.toLowerCase() === (ar.caracteristicas.color ?? '').toLowerCase()).map((v: any) => <option key={v.id} value={v.talla} disabled={v.disponible === 0}>{v.talla}{v.disponible === 0 ? ' (agotada)' : ''}</option>)}</select></Campo>
              <div className="row"><button className="btn" disabled={!variante} onClick={() => { agregar({ varianteId: variante.id, productoId, nombre: prodActual.nombre, talla: variante.talla, color: variante.color, colorHex: variante.colorHex, precio: prodActual.precioVigente, imagen: prodActual.imagenes.find((i: any) => !i.esOverlayAr)?.url }); toast.ok('Agregado al carrito'); }}>Agregar al carrito</button>
                <button className="btn sec" disabled={!variante} onClick={() => (usuario ? setReservar(true) : nav('/login', { state: { desde: '/vestidor' } }))}>Agregar a reserva</button><Link to={`/producto/${productoId}`} className="btn ghost">Ver detalle</Link></div></>}
            {ar.galeria?.length > 1 && <div><div className="small muted mb">Vista alternativa (fotos de la prenda):</div><div className="row">{ar.galeria.map((g: string) => <img key={g} src={img(g)} alt="" style={{ width: 64, borderRadius: 8 }} />)}</div></div>}</>}
          {!ar && !cargandoAr && <div className="muted small">Elige una prenda para empezar. Solo aparecen las prendas que tienen imagen para realidad aumentada.</div>}
        </div>
      </div>
      {reservar && variante && <ReservarDialog items={[{ varianteId: variante.id, cantidad: 1, etiqueta: `${prodActual.nombre} (${variante.talla}/${variante.color})` }]} onClose={() => setReservar(false)} />}
    </div>
  );
}
