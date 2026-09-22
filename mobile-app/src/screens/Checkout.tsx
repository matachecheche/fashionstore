import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ApiError, bs, get, post } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarga, useCarrito, useDatos, useToast } from '../context';
import { encolar, nuevoId } from '../offline';
import { Alerta, Boton, Campo, Chip, Icono, s, Tarjeta } from '../ui';

// CU-07 Comprar desde la app: metodo de pago (Libelula tarjeta/QR, Stripe, PayPal o contra entrega)
const METODOS = [
  { id: 'tarjeta:libelula', metodo: 'tarjeta', pasarela: 'libelula', ic: 'card-outline', t: 'Tarjeta de crédito/débito', d: 'Pago en bolivianos con Libélula' },
  { id: 'qr:libelula', metodo: 'qr', pasarela: 'libelula', ic: 'qr-code-outline', t: 'QR interoperable', d: 'Escanea el QR desde la app de tu banco' },
  { id: 'tarjeta:stripe', metodo: 'tarjeta', pasarela: 'stripe', ic: 'globe-outline', t: 'Tarjeta internacional (Stripe)', d: 'Pagos desde el extranjero (USD)' },
  { id: 'paypal:paypal', metodo: 'paypal', pasarela: 'paypal', ic: 'logo-paypal', t: 'PayPal', d: 'Paga con tu cuenta PayPal (USD)' },
  { id: 'contra_entrega:', metodo: 'contra_entrega', pasarela: undefined, ic: 'cash-outline', t: 'Pagar al retirar', d: 'Reservamos las prendas y pagas en la sucursal' },
] as const;

export default function Checkout({ navigation, route }: any) {
  const reservaId: number | null = route.params?.reservaId ?? null; const { items, total, vaciar } = useCarrito(); const { usuario } = useAuth(); const { sucursales, sucursalId, config, recargarPendientes } = useDatos(); const toast = useToast();
  const reserva = useCarga(() => (reservaId ? get(`/reservas/${reservaId}`) : Promise.resolve(null)), [reservaId]);
  const disp = useCarga(async () => { const ids = [...new Set(items.map((i) => i.productoId))]; return (await Promise.all(ids.map((id) => get(`/productos/${id}/disponibilidad`)))).flat(); }, [items.length]);
  const [suc, setSuc] = useState<number | null>(sucursalId); const [metodo, setMetodo] = useState<string>(METODOS[0].id); const [doc, setDoc] = useState(usuario?.documento ?? ''); const [enviando, setEnviando] = useState(false); const [error, setError] = useState('');
  const tieneTodo = (sid: number) => !!disp.data && items.every((i) => (disp.data!.find((d: any) => d.varianteId === i.varianteId && d.sucursalId === sid)?.disponible ?? 0) >= i.cantidad);
  useEffect(() => { if (reservaId || !disp.data || !sucursales.length) return; if (suc && tieneTodo(suc)) return; setSuc((sucursalId && tieneTodo(sucursalId) ? sucursalId : sucursales.find((x) => tieneTodo(x.id))?.id) ?? sucursalId ?? sucursales[0].id); /* eslint-disable-next-line */ }, [disp.data, sucursales]);
  const lineas = reservaId && reserva.data ? reserva.data.items.map((i: any) => ({ k: i.varianteId, n: i.producto, d: `${i.color} · ${i.talla}`, c: i.cantidad, p: i.precio })) : items.map((i) => ({ k: i.varianteId, n: i.nombre, d: `${i.color} · ${i.talla}`, c: i.cantidad, p: i.precio }));
  const suma = lineas.reduce((x: number, l: any) => x + l.p * l.c, 0); const m = METODOS.find((x) => x.id === metodo)!;

  async function pagar() {
    setError(''); setEnviando(true);
    const cuerpo: any = { canal: 'app', metodoPago: m.metodo, pasarela: m.pasarela, documentoCliente: doc || undefined, ...(reservaId ? { reservaId } : { sucursalId: suc, items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })) }) };
    try { const r = await post('/ventas', cuerpo); if (!reservaId) vaciar(); toast.ok(`Compra ${r.venta.comprobante} registrada`); navigation.replace('Pago', { referencia: r.pago.referencia }); }
    catch (e: any) {
      if (e instanceof ApiError && e.status === 0 && m.metodo === 'contra_entrega' && !reservaId) { await encolar({ id: nuevoId(), tipo: 'venta', cuerpo, etiqueta: 'Pedido contra entrega' }); recargarPendientes(); vaciar(); toast.info('Sin conexión: tu pedido se enviará solo al volver internet.'); navigation.popToTop(); }
      else setError(e.status === 0 ? 'Necesitas conexión para pagar con pasarela electrónica.' : e.message);
    } finally { setEnviando(false); }
  }
  if (!lineas.length) return <View style={s.pantalla}><Alerta t="No hay nada para pagar." /></View>;
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      {reservaId && <Alerta t={`Pagando la reserva ${reserva.data?.codigo ?? ''} en ${reserva.data?.sucursal ?? ''}`} />}
      {!reservaId && <><Text style={s.label}>1. SUCURSAL DE RETIRO</Text><View style={{ gap: 8 }}>{sucursales.map((x) => { const ok = disp.data ? tieneTodo(x.id) : null; return <Chip key={x.id} t={`${x.nombre.replace('Sucursal ', '')}${ok === null ? '' : ok ? '  ✓ tiene todo' : '  (sin stock completo)'}`} act={suc === x.id} onPress={() => setSuc(x.id)} />; })}</View>{suc && disp.data && !tieneTodo(suc) && <Alerta tipo="warn" t="Esa sucursal no tiene todas las prendas. Elige una con ✓ o ajusta tu carrito." />}</>}
      <Text style={s.label}>{reservaId ? '1' : '2'}. MÉTODO DE PAGO</Text>
      {config?.pagos.modo === 'sandbox' && <Alerta t="Modo demostración: las pasarelas están simuladas y no se cobra nada real." />}
      {METODOS.map((x) => <Tarjeta key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: metodo === x.id ? C.marca : C.linea, borderWidth: metodo === x.id ? 2 : 1, backgroundColor: metodo === x.id ? C.suave : '#fff' }}>
        <Icono name={x.ic as any} size={26} color={C.marca} /><View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }} onPress={() => setMetodo(x.id)}>{x.t}</Text><Text style={{ color: C.gris, fontSize: 12 }} onPress={() => setMetodo(x.id)}>{x.d}</Text></View><Icono name={metodo === x.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.marca} onPress={() => setMetodo(x.id)} /></Tarjeta>)}
      <Campo label="NIT / CI para el comprobante (opcional)" value={doc} onChangeText={setDoc} />
      <Tarjeta><Text style={{ fontWeight: '700', fontSize: 16 }}>Tu pedido</Text>{lineas.map((l: any) => <View key={l.k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ flex: 1, color: C.gris }}>{l.n} · {l.d} × {l.c}</Text><Text style={{ fontWeight: '600' }}>{bs(l.p * l.c)}</Text></View>)}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}><Text style={{ fontWeight: '700' }}>Total</Text><Text style={{ fontWeight: '800', fontSize: 20, color: C.marca }}>{bs(suma)}</Text></View>
        {(m.pasarela === 'stripe' || m.pasarela === 'paypal') && config && <Text style={{ color: C.gris, fontSize: 12 }}>≈ US$ {(suma / config.pagos.tipoCambioUsd).toFixed(2)}</Text>}</Tarjeta>
      {error ? <Alerta tipo="bad" t={error} /> : null}
      <Boton t={m.metodo === 'contra_entrega' ? 'Confirmar pedido' : 'Continuar al pago'} onPress={pagar} cargando={enviando} disabled={!reservaId && !suc} />
    </ScrollView>
  );
}
