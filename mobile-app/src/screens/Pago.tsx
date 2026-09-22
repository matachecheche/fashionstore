import { useEffect, useRef, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { bs, get, post } from '../api';
import { COLORES as C } from '../config';
import { useToast } from '../context';
import { Alerta, Boton, Cargando, Icono, s, Tarjeta } from '../ui';

// CU-08 Procesar pago electronico: QR / pasarela, seguimiento (polling) y reintento con otro metodo
export default function Pago({ navigation, route }: any) {
  const { referencia } = route.params; const toast = useToast(); const [pago, setPago] = useState<any>(null); const [error, setError] = useState(''); const ult = useRef<string>('');
  useEffect(() => {
    let vivo = true;
    const cargar = () => get(`/pagos/ref/${referencia}`).then((p) => { if (vivo) { setPago(p); ult.current = p.estado; } }).catch((e) => vivo && setError(e.message));
    cargar(); const t = setInterval(() => { if (ult.current === '' || ult.current === 'PENDIENTE') cargar(); }, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [referencia]);
  const simular = async (a: 'aprobar' | 'rechazar') => { try { await post(`/pagos/sandbox/${referencia}/${a}`); setPago(await get(`/pagos/ref/${referencia}`)); } catch (e: any) { toast.error(e.message); } };
  const reintentar = async (metodoPago: string, pasarela?: string) => { try { const r = await post(`/ventas/${pago.ventaId}/reintentar-pago`, { metodoPago, pasarela }); navigation.replace('Pago', { referencia: r.pago.referencia }); } catch (e: any) { toast.error(e.message); } };
  if (error) return <View style={s.pantalla}><Alerta tipo="bad" t={error} /></View>;
  if (!pago) return <Cargando />;
  const est = pago.estado;
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={{ padding: 20, gap: 14, alignItems: 'center' }}>
      {est === 'APROBADO' && <><Icono name="checkmark-circle" size={84} color={C.ok} /><Text style={s.h1}>¡Pago aprobado!</Text><Text style={{ textAlign: 'center', lineHeight: 21 }}>Tu compra <Text style={{ fontWeight: '700' }}>{pago.comprobante}</Text> por <Text style={{ fontWeight: '700' }}>{bs(pago.monto)}</Text> fue confirmada.</Text>
        <Boton t="Ver mis pedidos" style={{ width: '100%' }} onPress={() => navigation.replace('MisPedidos')} /><Boton t="Seguir comprando" tipo="sec" style={{ width: '100%' }} onPress={() => navigation.popToTop()} /></>}
      {(est === 'RECHAZADO' || est === 'EXPIRADO') && <><Icono name="close-circle" size={84} color={C.bad} /><Text style={s.h1}>Pago {est === 'RECHAZADO' ? 'rechazado' : 'no completado'}</Text><Alerta tipo="bad" t={pago.motivoRechazo || 'La pasarela no confirmó el pago.'} />
        {pago.estadoVenta === 'pendiente_pago' ? <><Text style={{ color: C.gris, textAlign: 'center' }}>Tus prendas siguen apartadas unos minutos. Reintenta con otro método:</Text>
          <View style={{ gap: 8, width: '100%' }}>{([['tarjeta', 'libelula', 'Tarjeta (Libélula)'], ['qr', 'libelula', 'QR (Libélula)'], ['tarjeta', 'stripe', 'Tarjeta internacional (Stripe)'], ['paypal', 'paypal', 'PayPal']] as const).map(([m, p, t]) => <Boton key={t} t={t} tipo="sec" onPress={() => reintentar(m, p)} />)}</View></> : <Text style={{ color: C.gris, textAlign: 'center' }}>La compra fue cancelada y las prendas se liberaron.</Text>}</>}
      {est === 'PENDIENTE' && <>
        <Text style={s.h1}>Completa tu pago</Text><Text style={{ fontSize: 36, fontWeight: '800', color: C.marca }}>{bs(pago.monto)}</Text><Text style={{ color: C.gris }}>Pedido {pago.comprobante} · {pago.pasarelaNombre}</Text>
        {pago.qrImagen && <Tarjeta style={{ alignItems: 'center' }}><Image source={{ uri: pago.qrImagen }} style={{ width: 230, height: 230 }} /><Text style={{ color: C.gris, fontSize: 12 }}>Escanea el QR con la app de tu banco</Text></Tarjeta>}
        {pago.checkoutUrl && !pago.sandbox && <Boton t={`Abrir ${pago.pasarelaNombre}`} icono="open-outline" style={{ width: '100%' }} onPress={() => Linking.openURL(pago.checkoutUrl)} />}
        {pago.sandbox && <Tarjeta style={{ backgroundColor: C.infoBg, width: '100%' }}><Text style={{ fontWeight: '700', color: C.info }}>Pasarela simulada (demostración)</Text><Text style={{ color: C.info, fontSize: 12 }}>Elige el resultado del pago:</Text><Boton t="Simular pago aprobado" tipo="verde" onPress={() => simular('aprobar')} /><Boton t="Simular rechazo" tipo="peligro" onPress={() => simular('rechazar')} /></Tarjeta>}
        <Text style={{ color: C.gris, fontSize: 12, textAlign: 'center' }}>Esperando confirmación del pago… Tus prendas quedan apartadas hasta que se agote el tiempo de pago.</Text></>}
    </ScrollView>
  );
}
