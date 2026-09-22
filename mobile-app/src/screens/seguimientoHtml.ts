// Visor de seguimiento corporal para el vestidor AR (Parte I, cap. 12.1): detecta los puntos de referencia del cuerpo con
// MediaPipe Pose (body tracking) y superpone la prenda ajustando escala, posicion y giro en tiempo real.
// Se ejecuta dentro de un WebView. Necesita internet la primera vez (descarga el modelo, ~5 MB); si algo falla la app
// avisa por postMessage y pasa al modo manual.
export function htmlSeguimiento(cfg: any): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:#111;overflow:hidden}canvas{width:100%;height:100%;display:block}
#msg{position:fixed;left:0;right:0;bottom:12px;text-align:center;color:#fff;font:600 14px sans-serif;text-shadow:0 1px 4px #000;padding:0 16px}</style></head>
<body><canvas id="c"></canvas><video id="v" playsinline muted autoplay style="position:absolute;width:2px;height:2px;opacity:0"></video><div id="msg"></div>
<script type="module">
const post = (o) => { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };
let cfg = ${JSON.stringify(cfg)};
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), v = document.getElementById('v'), msg = document.getElementById('msg');
let prenda = new Image(), prendaOk = false;
function cargarPrenda() { prendaOk = false; prenda = new Image(); prenda.crossOrigin = 'anonymous'; prenda.onload = () => { prendaOk = true; }; prenda.onerror = () => post({ t: 'error', m: 'imagen de la prenda' }); prenda.src = cfg.overlayUrl; }
window.setPrenda = (c) => { cfg = c; cargarPrenda(); };
cargarPrenda();
function tam() { const d = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); }
tam(); addEventListener('resize', tam);

try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  v.srcObject = stream; await v.play();
} catch (e) { post({ t: 'error', m: 'camara: ' + (e && e.message) }); throw e; }

let landmarker = null;
const BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
try {
  const { PoseLandmarker, FilesetResolver } = await import(BASE + '/vision_bundle.mjs');
  const fileset = await FilesetResolver.forVisionTasks(BASE + '/wasm');
  const crear = (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate },
    runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  try { landmarker = await crear('GPU'); } catch (e) { landmarker = await crear('CPU'); }
} catch (e) { post({ t: 'error', m: 'modelo: ' + (e && e.message) }); throw e; }
post({ t: 'listo' });

// puntos del cuerpo: 11/12 hombros, 23/24 caderas, 27/28 tobillos
const REF = { hombros: [11, 12], caderas: [23, 24], tobillos: [27, 28] };
let suave = null, detectado = false, ultimo = 0, ultimaDet = 0, avisoT = 0;
const lerp = (a, b, k) => a + (b - a) * k;

function frame(t) {
  requestAnimationFrame(frame);
  const W = cv.width, H = cv.height, vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return;
  const sc = Math.max(W / vw, H / vh), dx = (W - vw * sc) / 2, dy = (H - vh * sc) / 2;
  ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(v, dx, dy, vw * sc, vh * sc); ctx.restore();   // video en espejo (selfie)
  let objetivo = null;
  if (landmarker && t - ultimo > 40) {
    ultimo = t;
    try {
      const r = landmarker.detectForVideo(v, t);
      const lm = r.landmarks && r.landmarks[0];
      if (lm) {
        const ids = REF[(cfg.ajuste && cfg.ajuste.referencia) || 'hombros'];
        const P = ids.map((i) => ({ x: dx + (1 - lm[i].x) * vw * sc, y: dy + lm[i].y * vh * sc, vis: lm[i].visibility === undefined ? 1 : lm[i].visibility }));
        if (P[0].vis > 0.4 && P[1].vis > 0.4) {
          const [a, b] = P[0].x < P[1].x ? [P[0], P[1]] : [P[1], P[0]];
          const span = Math.hypot(b.x - a.x, b.y - a.y);
          if (span > 20) objetivo = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, span, ang: Math.atan2(b.y - a.y, b.x - a.x) };
        }
      }
    } catch (e) { /* frame descartado */ }
    const det = !!objetivo; if (det !== detectado) { detectado = det; post({ t: 'cuerpo', v: det }); }
    if (objetivo) { ultimaDet = t; suave = suave ? { cx: lerp(suave.cx, objetivo.cx, 0.4), cy: lerp(suave.cy, objetivo.cy, 0.4), span: lerp(suave.span, objetivo.span, 0.3), ang: lerp(suave.ang, objetivo.ang, 0.3) } : objetivo; }
  }
  const reciente = suave && t - ultimaDet < 700;
  if (suave && prendaOk) {
    const aj = cfg.ajuste || {}; const refF = aj.refFraccion || 0.5; const anc = aj.ancla || { x: 0.5, y: 0.1 };
    const w = suave.span / refF, h = w / (cfg.proporcion || 0.714);
    // la cintura queda por encima de las caderas; el accesorio se desplaza hacia un lado
    const offY = aj.referencia === 'caderas' ? -0.3 * suave.span : 0; const offX = (cfg.ajuste && cfg.ajuste.inicial && cfg.ajuste.inicial.cx > 0.6) ? 0.55 * suave.span : 0;
    ctx.save(); ctx.globalAlpha = reciente ? 1 : 0.35; ctx.translate(suave.cx + offX, suave.cy + offY); ctx.rotate(suave.ang);
    ctx.drawImage(prenda, -anc.x * w, -anc.y * h, w, h); ctx.restore();
  }
  const hint = !detectado ? (aj_ref() === 'caderas' ? 'Aléjate un poco para que se vean tus caderas' : aj_ref() === 'tobillos' ? 'Aléjate para que se vean tus pies' : 'Colócate de frente, con los hombros visibles') : '';
  if (msg.textContent !== hint) msg.textContent = hint;
}
function aj_ref() { return (cfg.ajuste && cfg.ajuste.referencia) || 'hombros'; }
requestAnimationFrame(frame);

window.capturar = () => { try { post({ t: 'foto', d: cv.toDataURL('image/jpeg', 0.92) }); } catch (e) { post({ t: 'error', m: 'captura: ' + (e && e.message) }); } };
</script></body></html>`;
}
