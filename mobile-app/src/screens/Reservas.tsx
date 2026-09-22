import { Alert, FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bs, fechaHora, get, img, post } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarga, useToast } from '../context';
import { Alerta, Badge, Boton, Cargando, ErrorBox, s, Tarjeta, Vacio } from '../ui';

const ESTADO: Record<string, [string, string]> = { PENDIENTE: ['Pendiente', 'warn'], EN_ATENCION: ['En atención', 'info'], COMPLETADA: ['Completada', 'ok'], CANCELADA: ['Cancelada', 'bad'] };

function Pasos({ r }: { r: any }) {
  if (r.estado === 'CANCELADA') return <Text style={{ color: C.bad, fontWeight: '600' }}>✗ Reserva cancelada</Text>;
  const p = [['Reservada', true], ['Lista en tienda', !!r.preparadaEn], ['En atención', ['EN_ATENCION', 'COMPLETADA'].includes(r.estado)], ['Completada', r.estado === 'COMPLETADA']] as const;
  return <View style={{ flexDirection: 'row', gap: 4 }}>{p.map(([t, h]) => <View key={t} style={{ flex: 1, gap: 4 }}><View style={{ height: 5, borderRadius: 3, backgroundColor: h ? C.ok : '#ddd' }} /><Text style={{ fontSize: 10, color: h ? C.ok : C.gris, textAlign: 'center' }}>{t}</Text></View>)}</View>;
}

export default function Reservas({ navigation }: any) {
  const { usuario } = useAuth(); const toast = useToast(); const { data, cargando, error, recargar } = useCarga(() => (usuario ? get('/reservas/mias') : Promise.resolve([])), [usuario?.id], 20000);
  if (!usuario) return <SafeAreaView style={s.pantalla}><Vacio icono="calendar-outline" t="Inicia sesión para ver tus reservas"><Boton t="Iniciar sesión" onPress={() => navigation.navigate('Login')} /></Vacio></SafeAreaView>;
  const cancelar = (r: any) => Alert.alert('Cancelar reserva', `¿Cancelar ${r.codigo}? Las prendas volverán a estar disponibles.`, [{ text: 'Volver' }, { text: 'Sí, cancelar', style: 'destructive', onPress: async () => { try { await post(`/reservas/${r.id}/cancelar`, {}); toast.ok('Reserva cancelada'); recargar(true); } catch (e: any) { toast.error(e.message); } } }]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.fondo }} edges={['top']}>
      <Text style={[s.h1, { padding: 16, paddingBottom: 4 }]}>Mis reservas</Text>
      {cargando && !data ? <Cargando /> : error && !data ? <View style={{ padding: 16 }}><ErrorBox t={error} onRetry={() => recargar()} /></View> : (
        <FlatList data={data ?? []} keyExtractor={(r: any) => String(r.id)} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => recargar(true)} tintColor={C.marca} />}
          ListEmptyComponent={<Vacio icono="calendar-outline" t="Aún no tienes reservas."><Boton t="Explorar catálogo" onPress={() => navigation.navigate('Catalogo')} /></Vacio>}
          renderItem={({ item: r }) => { const activa = ['PENDIENTE', 'EN_ATENCION'].includes(r.estado); return (
            <Tarjeta>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ gap: 4 }}><Text style={{ fontSize: 20, fontWeight: '800', color: C.marca, letterSpacing: 2 }}>{r.codigo}</Text><Badge t={ESTADO[r.estado][0]} tipo={ESTADO[r.estado][1]} /></View><Text style={{ fontWeight: '700' }}>{bs(r.total)}</Text></View>
              <Text style={{ color: C.gris, fontSize: 12 }}>{r.sucursal} · {r.sucursalDireccion}{'\n'}Atención: <Text style={{ fontWeight: '700' }}>{fechaHora(r.fechaHoraEstimada)}</Text></Text>
              <Pasos r={r} />
              {r.preparadaEn && r.estado === 'PENDIENTE' && <Alerta tipo="ok" t="¡Tus prendas ya están preparadas en la tienda!" />}
              {r.items.map((i: any) => <View key={i.varianteId} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Image source={{ uri: img(i.imagen) }} style={{ width: 38, height: 50, borderRadius: 6, backgroundColor: '#f3ecef' }} /><Text style={{ flex: 1, fontSize: 13 }}>{i.producto}{'\n'}<Text style={{ color: C.gris }}>{i.color} · {i.talla} × {i.cantidad}</Text></Text></View>)}
              {r.estado === 'PENDIENTE' && <Text style={{ color: C.gris, fontSize: 11 }}>Prendas bloqueadas hasta {fechaHora(r.venceEn)}</Text>}
              {r.motivoCancelacion && r.estado === 'CANCELADA' && <Text style={{ color: C.gris, fontSize: 12 }}>Motivo: {r.motivoCancelacion}</Text>}
              {activa && <View style={{ flexDirection: 'row', gap: 8 }}><Boton t="Pagar reserva" peque style={{ flex: 1 }} onPress={() => navigation.navigate('Checkout', { reservaId: r.id })} />{r.estado === 'PENDIENTE' && <Boton t="Cancelar" peque tipo="peligro" onPress={() => cancelar(r)} />}</View>}
            </Tarjeta>); }} />)}
    </SafeAreaView>
  );
}
