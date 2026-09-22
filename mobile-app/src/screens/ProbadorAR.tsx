import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { get, img, post } from '../api';
import { API_URL, COLORES as C } from '../config';
import { useAuth, useCarrito, useToast } from '../context';
import { Alerta, Badge, Boton, Cargando, Chip, Icono, s, Tarjeta } from '../ui';
import { htmlSeguimiento } from './seguimientoHtml';

// Parametros de ajuste por tipo de prenda (si el microservicio de IA/AR no responde se usan estos)
const AJUSTES: Record<string, any> = {
  superior: { referencia: 'hombros', ancla: { x: 0.5, y: 0.13 }, refFraccion: 0.52, inicial: { cx: 0.5, cy: 0.36, ancho: 0.78 } }, abrigo: { referencia: 'hombros', ancla: { x: 0.5, y: 0.1 }, refFraccion: 0.5, inicial: { cx: 0.5, cy: 0.42, ancho: 0.86 } },
  vestido: { referencia: 'hombros', ancla: { x: 0.5, y: 0.06 }, refFraccion: 0.4, inicial: { cx: 0.5, cy: 0.52, ancho: 0.72 } }, inferior: { referencia: 'caderas', ancla: { x: 0.5, y: 0.05 }, refFraccion: 0.46, inicial: { cx: 0.5, cy: 0.66, ancho: 0.58 } },
  calzado: { referencia: 'tobillos', ancla: { x: 0.5, y: 0.45 }, refFraccion: 0.65, inicial: { cx: 0.5, cy: 0.86, ancho: 0.62 } }, accesorio: { referencia: 'caderas', ancla: { x: 0.5, y: 0.25 }, refFraccion: 0.9, inicial: { cx: 0.72, cy: 0.58, ancho: 0.36 } },
};

// ---------------------------------------------------------------------------------------------------- modo automatico (seguimiento del cuerpo)
const CamaraAuto = forwardRef<{ capturar(): void }, { cfg: any; onListo(): void; onError(m: string): void; onCuerpo(v: boolean): void; onFoto(uri: string): void }>(function CamaraAuto({ cfg, onListo, onError, onCuerpo, onFoto }, ref) {
  const web = useRef<WebView>(null); const html = useMemo(() => htmlSeguimiento(cfg), []);   // eslint-disable-line
  useImperativeHandle(ref, () => ({ capturar: () => web.current?.injectJavaScript('window.capturar && window.capturar(); true;') }));
  useEffect(() => { web.current?.injectJavaScript(`window.setPrenda && window.setPrenda(${JSON.stringify(cfg)}); true;`); }, [cfg.overlayUrl, cfg.proporcion]);   // eslint-disable-line
  return (
    <WebView ref={web} source={{ html, baseUrl: 'http://localhost' }} style={StyleSheet.absoluteFill} originWhitelist={['*']} javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant" mixedContentMode="always" allowFileAccess androidLayerType="hardware" bounces={false} scrollEnabled={false} setSupportMultipleWindows={false}
      onMessage={(e) => { try { const m = JSON.parse(e.nativeEvent.data); if (m.t === 'listo') onListo(); else if (m.t === 'error') onError(m.m); else if (m.t === 'cuerpo') onCuerpo(!!m.v); else if (m.t === 'foto') onFoto(m.d); } catch { /* ignorar */ } }}
      onError={() => onError('No se pudo cargar el visor de seguimiento')} />
  );
});

// ---------------------------------------------------------------------------------------------------- modo manual (camara nativa + gestos)
interface Pos { cx: number; cy: number; ancho: number; rot: number }
const Manual = forwardRef<{ capturar(): Promise<{ uri: string; W: number; H: number; pos: Pos } | null> }, { cfg: any; pos: Pos; setPos(p: Pos): void }>(function Manual({ cfg, pos, setPos }, ref) {
  const cam = useRef<CameraView>(null); const [dim, setDim] = useState({ W: 1, H: 1 }); const posRef = useRef(pos); posRef.current = pos; const dimRef = useRef(dim); dimRef.current = dim;
  const g = useRef<any>({});
  useImperativeHandle(ref, () => ({ capturar: async () => { const f = await cam.current?.takePictureAsync({ quality: 0.85 }); return f ? { uri: f.uri, W: dimRef.current.W, H: dimRef.current.H, pos: posRef.current } : null; } }));
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { g.current = { base: { ...posRef.current }, d0: 0, a0: 0 }; const t = e.nativeEvent.touches; if (t.length >= 2) { g.current.d0 = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY); g.current.a0 = Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX); } },
    onPanResponderMove: (e, st) => {
      const t = e.nativeEvent.touches; const { W, H } = dimRef.current; const b = g.current.base;
      if (t.length >= 2) {   // pellizco: tamano y giro
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY); const a = Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX);
        if (!g.current.d0) { g.current.d0 = d; g.current.a0 = a; }
        setPos({ ...b, cx: posRef.current.cx, cy: posRef.current.cy, ancho: Math.min(1.6, Math.max(0.15, b.ancho * (d / g.current.d0))), rot: b.rot + ((a - g.current.a0) * 180) / Math.PI });
      } else setPos({ ...posRef.current, cx: Math.min(1.1, Math.max(-0.1, b.cx + st.dx / W)), cy: Math.min(1.1, Math.max(-0.1, b.cy + st.dy / H)) });
    },
    onPanResponderRelease: () => { g.current.base = { ...posRef.current }; },
  })).current;
  const w = pos.ancho * dim.W; const h = w / (cfg.proporcion || 0.714);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setDim({ W: e.nativeEvent.layout.width, H: e.nativeEvent.layout.height })} {...pan.panHandlers}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" mirror />
      {cfg.overlayUrl && <Image source={{ uri: img(cfg.overlayUrl) }} resizeMode="contain" style={{ position: 'absolute', width: w, height: h, left: pos.cx * dim.W - w / 2, top: pos.cy * dim.H - h / 2, transform: [{ rotate: `${pos.rot}deg` }] }} />}
    </View>
  );
});

// ---------------------------------------------------------------------------------------------------- pantalla
export default function ProbadorAR({ navigation, route }: any) {
  const { productoId, color: colorIni, talla: tallaIni } = route.params; const toast = useToast(); const { usuario } = useAuth(); const { agregar } = useCarrito();
  const [permiso, pedir] = useCameraPermissions();
  const [prod, setProd] = useState<any>(null); const [ar, setAr] = useState<any>(null); const [color, setColor] = useState<string>(colorIni ?? ''); const [talla, setTalla] = useState<string>(tallaIni ?? ''); const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<'auto' | 'manual'>('auto'); const [estadoAuto, setEstadoAuto] = useState<'iniciando' | 'listo' | 'error'>('iniciando'); const [motivo, setMotivo] = useState(''); const [cuerpo, setCuerpo] = useState(false);
  const [pos, setPos] = useState<Pos>({ cx: 0.5, cy: 0.5, ancho: 0.7, rot: 0 }); const [foto, setFoto] = useState<{ uri: string; W: number; H: number; pos?: Pos; manual: boolean } | null>(null); const [guardando, setGuardando] = useState(false);
  const refAuto = useRef<any>(null); const refManual = useRef<any>(null); const collage = useRef<View>(null); const fotoRef = useRef<View>(null);

  useEffect(() => { get(`/productos/${productoId}`).then(setProd).catch(() => {}); post('/ia/interacciones', { productoId, tipo: 'probador' }).catch(() => {}); }, [productoId]);
  // CU-06 paso 3: la app pide al microservicio de IA/AR las caracteristicas visuales de la prenda
  useEffect(() => {
    let vivo = true; setCargando(true);
    get(`/ia/ar/${productoId}${color ? `?color=${encodeURIComponent(color)}` : ''}`).then((r) => { if (vivo) { setAr(r); if (!color) setColor(r.caracteristicas?.color ?? ''); } }).catch(async () => {
      try { const p = prod ?? (await get(`/productos/${productoId}`)); const ov = p.imagenes.find((i: any) => i.esOverlayAr && (!color || (i.color ?? '').toLowerCase() === color.toLowerCase())) ?? p.imagenes.find((i: any) => i.esOverlayAr);
        if (vivo) setAr({ compatibleAR: !!ov, overlayUrl: ov?.url, proporcion: 0.714, ajuste: AJUSTES[p.arTipo] ?? AJUSTES.superior, guia: 'Colócate de frente a la cámara.', caracteristicas: { tipo: p.arTipo, color: color || ov?.color, textura: p.textura, material: p.material }, colores: [...new Map(p.variantes.map((v: any) => [v.color, { nombre: v.color, hex: v.colorHex }])).values()], galeria: p.imagenes.filter((i: any) => !i.esOverlayAr).map((i: any) => i.url) }); } catch { /* sin datos */ }
    }).finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [productoId, color]);   // eslint-disable-line
  useEffect(() => { if (ar?.ajuste?.inicial) setPos((p) => ({ ...p, ...ar.ajuste.inicial, rot: 0 })); }, [ar?.caracteristicas?.tipo]);   // eslint-disable-line
  // si el visor de seguimiento no arranca en 25 s se pasa al modo manual (funciona siempre)
  useEffect(() => { if (modo !== 'auto' || estadoAuto !== 'iniciando' || !permiso?.granted || !ar?.overlayUrl) return; const t = setTimeout(() => { setMotivo('El seguimiento automático tardó demasiado en iniciar (¿sin internet?).'); setEstadoAuto('error'); setModo('manual'); }, 25000); return () => clearTimeout(t); }, [modo, estadoAuto, permiso?.granted, ar?.overlayUrl]);

  const cfgAuto = useMemo(() => ({ overlayUrl: img(ar?.overlayUrl), proporcion: ar?.proporcion || 0.714, ajuste: ar?.ajuste ?? AJUSTES.superior }), [ar?.overlayUrl, ar?.proporcion, ar?.ajuste]);
  const cfgManual = { overlayUrl: ar?.overlayUrl, proporcion: ar?.proporcion };

  async function capturar() {
    if (modo === 'auto') refAuto.current?.capturar();
    else { try { const r = await refManual.current?.capturar(); if (r) setFoto({ uri: r.uri, W: r.W, H: r.H, pos: r.pos, manual: true }); } catch (e: any) { toast.error('No se pudo capturar: ' + e.message); } }
  }
  async function archivo(): Promise<string> { return captureRef(foto!.manual ? collage : fotoRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' }); }
  async function guardar() {
    setGuardando(true);
    try { const uri = await archivo(); const p = await MediaLibrary.requestPermissionsAsync(true); if (p.granted) { await MediaLibrary.saveToLibraryAsync(uri); toast.ok('Foto guardada en tu galería'); } else toast.error('Sin permiso para guardar en la galería'); }
    catch { toast.error('No se pudo guardar en la galería. Prueba con «Compartir».'); } finally { setGuardando(false); }
  }
  async function compartir() { try { const uri = await archivo(); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Mi prueba en FashionStore' }); else toast.error('Compartir no está disponible en este dispositivo'); } catch (e: any) { toast.error(e.message); } }

  const tallas = prod ? prod.variantes.filter((v: any) => v.color.toLowerCase() === (ar?.caracteristicas?.color ?? color).toLowerCase()) : []; const variante = tallas.find((v: any) => v.talla === talla);
  const etiqueta = variante ? `${prod.nombre} (${variante.talla}/${variante.color})` : '';
  const irReserva = () => { if (!usuario) return navigation.navigate('Login'); if (!variante) return toast.error('Elige tu talla.'); navigation.navigate('Reservar', { items: [{ varianteId: variante.id, cantidad: 1, etiqueta }] }); };
  const alCarrito = () => { if (!variante) return toast.error('Elige tu talla.'); agregar({ varianteId: variante.id, productoId, nombre: prod.nombre, talla: variante.talla, color: variante.color, colorHex: variante.colorHex, precio: prod.precioVigente, imagen: prod.imagenes.find((i: any) => !i.esOverlayAr)?.url }); toast.ok('Agregado al carrito'); };

  if (cargando && !ar) return <Cargando />;
  const sinAR = !ar?.overlayUrl;

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ aspectRatio: 3 / 4, backgroundColor: '#111', overflow: 'hidden' }}>
        {sinAR ? <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Text style={{ color: '#fff', textAlign: 'center' }}>Esta prenda todavía no tiene imagen para realidad aumentada. Mira su galería de fotos abajo.</Text></View>
          : !permiso ? <Cargando /> : !permiso.granted ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}><Icono name="camera-outline" size={54} color="#fff" /><Text style={{ color: '#fff', textAlign: 'center' }}>Necesitamos usar la cámara para que puedas probarte la prenda.</Text><Boton t="Permitir cámara" tipo="sec" onPress={pedir} />{permiso.canAskAgain === false && <Text style={{ color: '#fffa', fontSize: 12, textAlign: 'center' }}>Activa el permiso de cámara en los ajustes del teléfono. Mientras tanto verás la vista alternativa con fotos.</Text>}</View>
          ) : modo === 'auto' ? (
            <>
              <CamaraAuto ref={refAuto} cfg={cfgAuto} onListo={() => setEstadoAuto('listo')} onCuerpo={setCuerpo} onError={(m) => { setMotivo(m.startsWith('camara') ? 'El visor no pudo acceder a la cámara.' : 'No se pudo iniciar el seguimiento automático.'); setEstadoAuto('error'); setModo('manual'); }} onFoto={(uri) => setFoto({ uri, W: 0, H: 0, manual: false })} />
              {estadoAuto === 'iniciando' && <View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'flex-end', padding: 14 }}><Text style={{ color: '#fff', backgroundColor: '#0009', padding: 8, borderRadius: 8 }}>Cargando seguimiento del cuerpo (IA)… la primera vez puede tardar unos segundos</Text></View>}
              {estadoAuto === 'listo' && <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 10 }}><Badge t={cuerpo ? '● Cuerpo detectado' : 'Buscando tu cuerpo…'} tipo={cuerpo ? 'ok' : 'warn'} /></View>}
            </>
          ) : <Manual ref={refManual} cfg={cfgManual} pos={pos} setPos={setPos} />}
        {!sinAR && permiso?.granted && modo === 'manual' && <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 10 }}><Badge t="Modo manual: arrastra y pellizca" tipo="info" /></View>}
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        {motivo ? <Alerta tipo="warn" t={`${motivo} Usa el modo manual: arrastra la prenda con un dedo y pellizca para ajustar su tamaño y giro.`} /> : null}
        {!sinAR && permiso?.granted && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Chip t="Seguimiento automático" act={modo === 'auto'} onPress={() => { setMotivo(''); setEstadoAuto('iniciando'); setModo('auto'); }} /><Chip t="Manual" act={modo === 'manual'} onPress={() => setModo('manual')} />
            <View style={{ flex: 1 }} /><Pressable onPress={capturar} accessibilityLabel="Capturar foto" style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: C.marca, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}><Icono name="camera" size={28} color={C.marca} /></Pressable>
          </View>)}
        {modo === 'manual' && !sinAR && permiso?.granted && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Boton peque tipo="sec" t="Más grande" icono="add" onPress={() => setPos({ ...pos, ancho: Math.min(1.6, pos.ancho * 1.1) })} /><Boton peque tipo="sec" t="Más chica" icono="remove" onPress={() => setPos({ ...pos, ancho: Math.max(0.15, pos.ancho / 1.1) })} />
            <Boton peque tipo="sec" t="Girar" icono="refresh" onPress={() => setPos({ ...pos, rot: pos.rot + 8 })} /><Boton peque tipo="ghost" t="Restablecer" onPress={() => setPos({ ...pos, ...(ar?.ajuste?.inicial ?? {}), rot: 0 })} /></View>)}
        {ar?.guia && !sinAR && <Text style={{ color: C.gris, fontSize: 13 }}>💡 {ar.guia}</Text>}
        {ar?.colores?.length > 1 && <View style={{ gap: 6 }}><Text style={s.label}>COLOR</Text><View style={{ flexDirection: 'row', gap: 10 }}>{ar.colores.map((c: any) => <Pressable key={c.nombre} onPress={() => { setColor(c.nombre); setTalla(''); }} accessibilityLabel={c.nombre} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.hex, borderWidth: 3, borderColor: (ar.caracteristicas.color ?? '').toLowerCase() === c.nombre.toLowerCase() ? C.marca : '#fff', elevation: 2 }} />)}</View></View>}
        {prod && <View style={{ gap: 6 }}><Text style={s.label}>TALLA</Text><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{tallas.map((v: any) => <Chip key={v.id} t={v.talla} act={talla === v.talla} onPress={() => v.disponible > 0 && setTalla(v.talla)} />)}</View></View>}
        <View style={{ flexDirection: 'row', gap: 10 }}><Boton t="Agregar a reserva" icono="calendar-outline" style={{ flex: 1 }} onPress={irReserva} /><Boton t="Al carrito" tipo="sec" icono="cart-outline" style={{ flex: 1 }} onPress={alCarrito} /></View>
        {ar?.caracteristicas && <Tarjeta><Text style={{ fontWeight: '700' }}>Características de la prenda</Text><Text style={{ color: C.gris }}>Tipo: {ar.caracteristicas.tipo} · Color: {ar.caracteristicas.color} · Textura: {ar.caracteristicas.textura ?? '—'}{ar.caracteristicas.material ? ` · ${ar.caracteristicas.material}` : ''}</Text></Tarjeta>}
        {(sinAR || !permiso?.granted) && ar?.galeria?.length > 0 && <View style={{ gap: 8 }}><Text style={{ fontWeight: '700' }}>Vista alternativa: fotos de la prenda</Text><ScrollView horizontal contentContainerStyle={{ gap: 10 }}>{ar.galeria.map((u: string) => <Image key={u} source={{ uri: img(u) }} style={{ width: 150, height: 210, borderRadius: 12, backgroundColor: '#f3ecef' }} />)}</ScrollView></View>}
      </View>

      <Modal visible={!!foto} animationType="slide" onRequestClose={() => setFoto(null)}>
        <View style={{ flex: 1, backgroundColor: '#111', padding: 14, gap: 12 }}>
          {foto && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {foto.manual ? (
              <View ref={collage} collapsable={false} style={{ width: foto.W, height: foto.H, maxWidth: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
                <Image source={{ uri: foto.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                {cfgManual.overlayUrl && foto.pos && (() => { const w = foto.pos.ancho * foto.W; const h = w / (cfgManual.proporcion || 0.714); return <Image source={{ uri: img(cfgManual.overlayUrl) }} resizeMode="contain" style={{ position: 'absolute', width: w, height: h, left: foto.pos.cx * foto.W - w / 2, top: foto.pos.cy * foto.H - h / 2, transform: [{ rotate: `${foto.pos.rot}deg` }] }} />; })()}
              </View>
            ) : <View ref={fotoRef} collapsable={false} style={{ width: '100%', aspectRatio: 3 / 4 }}><Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /></View>}
          </View>}
          <View style={{ gap: 10 }}><View style={{ flexDirection: 'row', gap: 10 }}><Boton t="Guardar" icono="download-outline" style={{ flex: 1 }} onPress={guardar} cargando={guardando} /><Boton t="Compartir" tipo="sec" icono="share-outline" style={{ flex: 1 }} onPress={compartir} /></View>
            <View style={{ flexDirection: 'row', gap: 10 }}><Boton t="Repetir" tipo="sec" style={{ flex: 1 }} onPress={() => setFoto(null)} /><Boton t="Agregar a reserva" tipo="verde" style={{ flex: 1 }} onPress={() => { setFoto(null); irReserva(); }} /></View></View>
        </View>
      </Modal>
    </ScrollView>
  );
}
