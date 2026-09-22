import { FlatList, Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { bs, fechaHora, get, img } from '../api';
import { COLORES as C } from '../config';
import { useCarga } from '../context';
import { Badge, Boton, Cargando, ErrorBox, s, Tarjeta, Vacio } from '../ui';

const EST: Record<string, [string, string]> = { pendiente_pago: ['Pendiente de pago', 'warn'], pendiente: ['Pendiente de entrega', 'warn'], completada: ['Completada', 'ok'], entregada: ['Entregada', 'ok'], cancelada: ['Cancelada', 'bad'], devuelta_parcial: ['Devolución parcial', 'info'], devuelta: ['Devuelta', 'bad'] };
const METODO: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', qr: 'QR', transferencia: 'Transferencia', contra_entrega: 'Contra entrega', paypal: 'PayPal' };

export function Pedidos({ navigation }: any) {
  const { data, cargando, error, recargar } = useCarga(() => get('/ventas/mias'), [], 30000);
  if (cargando && !data) return <Cargando />;
  return (
    <FlatList style={s.pantalla} data={data ?? []} keyExtractor={(v: any) => String(v.id)} contentContainerStyle={{ padding: 14, gap: 12 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => recargar(true)} tintColor={C.marca} />}
      ListHeaderComponent={error ? <ErrorBox t={error} onRetry={() => recargar()} /> : null} ListEmptyComponent={<Vacio icono="receipt-outline" t="Todavía no tienes compras." />}
      renderItem={({ item: v }) => (
        <Tarjeta>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><View style={{ gap: 4 }}><Text style={{ fontWeight: '800' }}>{v.comprobante}</Text><Badge t={EST[v.estado]?.[0] ?? v.estado} tipo={EST[v.estado]?.[1]} /></View><Text style={{ fontWeight: '800', color: C.marca, fontSize: 16 }}>{bs(v.total)}</Text></View>
          <Text style={{ color: C.gris, fontSize: 12 }}>{fechaHora(v.creadaEn)} · {v.sucursal} · {METODO[v.metodoPago]}</Text>
          {v.items.map((i: any) => <View key={i.varianteId} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Image source={{ uri: img(i.imagen) }} style={{ width: 34, height: 46, borderRadius: 6, backgroundColor: '#f3ecef' }} /><Text style={{ flex: 1, fontSize: 13 }}>{i.producto} <Text style={{ color: C.gris }}>{i.color} · {i.talla} × {i.cantidad}</Text></Text></View>)}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['completada', 'entregada', 'devuelta_parcial', 'devuelta', 'pendiente'].includes(v.estado) && <Boton t="Comprobante" peque tipo="sec" icono="receipt-outline" onPress={() => navigation.navigate('Comprobante', { id: v.id })} />}
            {v.estado === 'pendiente_pago' && v.pago && <Boton t="Continuar el pago" peque onPress={() => navigation.navigate('Pago', { referencia: v.pago.referencia })} />}</View>
        </Tarjeta>)} />
  );
}

export function Comprobante({ route }: any) {
  const { data: d, cargando, error } = useCarga(() => get(`/ventas/${route.params.id}/comprobante`), [route.params.id]);
  if (cargando) return <Cargando />; if (!d) return <View style={{ padding: 16 }}><ErrorBox t={error} /></View>;
  const v = d.venta; const L = ({ a, b, bold }: any) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ fontFamily: 'monospace', fontWeight: bold ? '800' : '400', flex: 1 }}>{a}</Text><Text style={{ fontFamily: 'monospace', fontWeight: bold ? '800' : '400' }}>{b}</Text></View>;
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={{ padding: 16 }}>
      <Tarjeta style={{ gap: 6 }}>
        <Text style={{ textAlign: 'center', fontWeight: '800', fontSize: 18 }}>{d.empresa.nombre}</Text><Text style={{ textAlign: 'center', color: C.gris, fontSize: 12 }}>{d.empresa.razonSocial}{'\n'}{d.sucursal.nombre} — {d.sucursal.ciudad}{'\n'}{d.sucursal.direccion}</Text>
        <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#999', marginVertical: 6 }} />
        <L a="Comprobante" b={v.comprobante} bold /><L a="Fecha" b={fechaHora(v.creadaEn)} /><L a="Cliente" b={v.cliente ?? 'Mostrador'} />{v.documentoCliente && <L a="NIT/CI" b={v.documentoCliente} />}<L a="Pago" b={`${METODO[v.metodoPago]}${v.pago ? ' · ' + v.pago.estado : ''}`} />
        <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#999', marginVertical: 6 }} />
        {v.items.map((i: any) => <View key={i.varianteId}><Text style={{ fontWeight: '600' }}>{i.producto}</Text><L a={`${i.cantidad} × ${bs(i.precioUnit)} (${i.talla}/${i.color})`} b={bs(i.cantidad * i.precioUnit)} /></View>)}
        <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#999', marginVertical: 6 }} />
        <L a="Subtotal" b={bs(v.subtotal)} />{v.descuento > 0 && <L a="Descuento" b={`-${bs(v.descuento)}`} />}<L a="TOTAL" b={bs(v.total)} bold /><Text style={{ textAlign: 'center', color: C.gris, marginTop: 10 }}>¡Gracias por tu compra!</Text>
      </Tarjeta>
    </ScrollView>
  );
}
