import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { get } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarrito, useCarga, useDatos } from '../context';
import { cacheGet, cacheSet } from '../offline';
import { Alerta, Chip, Icono, ProductoCard, Titulo } from '../ui';

export default function Inicio({ navigation }: any) {
  const { usuario } = useAuth(); const { sucursales, sucursalId, setSucursalId, online, pendientes } = useDatos(); const { cantidad } = useCarrito();
  const [q, setQ] = useState(''); const [noLeidas, setNoLeidas] = useState(0); const [refrescando, setRefrescando] = useState(false);
  const suc = sucursalId ? `&sucursalId=${sucursalId}` : '';
  const reco = useCarga(async () => { try { const r = await get(`/ia/recomendaciones?limite=8${suc}`); cacheSet('reco', r); return r; } catch (e) { const c = await cacheGet('reco'); if (c) return c; throw e; } }, [usuario?.id, sucursalId]);
  const nuevos = useCarga(async () => { try { const r = await get(`/productos?temporadaActual=1&limite=10${suc}`); cacheSet('nuevos', r); return r; } catch (e) { const c = await cacheGet('nuevos'); if (c) return c; throw e; } }, [sucursalId]);
  const ofertas = useCarga(() => get('/promociones?vigentes=1'), []);
  const cats = useCarga(async () => { try { const r = await get('/categorias'); cacheSet('cats', r); return r; } catch (e) { const c = await cacheGet('cats'); if (c) return c; throw e; } }, []);
  const contar = useCallback(() => { if (usuario) get('/notificaciones/contador').then((r) => setNoLeidas(r.noLeidas)).catch(() => {}); else setNoLeidas(0); }, [usuario]);
  useEffect(() => { contar(); const t = setInterval(contar, 20000); const u = navigation.addListener('focus', contar); return () => { clearInterval(t); u(); }; }, [contar, navigation]);
  const refrescar = async () => { setRefrescando(true); await Promise.all([reco.recargar(true), nuevos.recargar(true), ofertas.recargar(true)]); contar(); setRefrescando(false); };
  const ir = (p: any) => navigation.navigate('Producto', { id: p.id ?? p.productoId });
  const lista = reco.data?.recomendaciones ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.fondo }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={C.marca} />} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Text style={{ color: C.gris, fontSize: 12 }}>{usuario ? `Hola, ${usuario.nombre.split(' ')[0]} 👋` : 'Bienvenida 👋'}</Text><Text style={{ fontSize: 22, fontWeight: '700', color: C.marca }}>FashionStore</Text></View>
          <Pressable onPress={() => (usuario ? navigation.navigate('Notificaciones') : navigation.navigate('Login'))} accessibilityLabel="Notificaciones" style={{ padding: 6 }}><Icono name="notifications-outline" size={26} color={C.tinta} />{noLeidas > 0 && <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: C.marca, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{noLeidas}</Text></View>}</Pressable>
          <Pressable onPress={() => navigation.navigate('Carrito')} accessibilityLabel="Carrito" style={{ padding: 6 }}><Icono name="cart-outline" size={26} color={C.tinta} />{cantidad > 0 && <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: C.marca, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{cantidad}</Text></View>}</Pressable>
        </View>
        {!online && <Alerta tipo="warn" t="Sin conexión: te mostramos lo último que cargaste. Tus reservas se enviarán solas al volver internet." />}
        {pendientes > 0 && <Alerta t={`${pendientes} operación(es) pendiente(s) de enviar`} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, borderWidth: 1, borderColor: C.linea, gap: 8 }}>
          <Icono name="search" size={18} color={C.gris} /><TextInput value={q} onChangeText={setQ} placeholder="Buscar vestidos, blusas, zapatos…" returnKeyType="search" onSubmitEditing={() => navigation.navigate('Catalogo', { q })} style={{ flex: 1, paddingVertical: 11 }} accessibilityLabel="Buscar" />
        </View>
        <View><Text style={{ fontSize: 12, color: C.gris, fontWeight: '700', marginBottom: 6 }}>TU SUCURSAL</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Chip t="Todas" act={!sucursalId} onPress={() => setSucursalId(null)} />{sucursales.map((x) => <Chip key={x.id} t={x.nombre.replace('Sucursal ', '')} act={sucursalId === x.id} onPress={() => setSucursalId(x.id)} />)}</ScrollView></View>
        <View style={{ backgroundColor: C.marca, borderRadius: 20, padding: 20, gap: 8 }}>
          <Text style={{ color: '#fff', fontSize: 21, fontWeight: '700' }}>Pruébate la ropa con realidad aumentada</Text>
          <Text style={{ color: '#ffffffd9' }}>Mira cómo te queda una prenda con la cámara antes de ir a la tienda.</Text>
          <Pressable onPress={() => navigation.navigate('Catalogo')} style={{ backgroundColor: '#fff', alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, marginTop: 4 }}><Text style={{ color: C.marca, fontWeight: '700' }}>Explorar catálogo</Text></Pressable>
        </View>
        {ofertas.data?.length > 0 && <View style={{ backgroundColor: C.suave, borderRadius: 14, padding: 12, gap: 4 }}><Text style={{ fontWeight: '700', color: C.marca }}>🏷️ Promociones vigentes</Text>{ofertas.data.map((o: any) => <Text key={o.id} style={{ color: C.tinta, fontSize: 13 }}>• {o.nombre}: -{o.porcentaje}%{o.categoria ? ` en ${o.categoria}` : o.temporada ? ` en ${o.temporada}` : ''}</Text>)}</View>}
        <View><Text style={{ fontSize: 12, color: C.gris, fontWeight: '700', marginBottom: 6 }}>CATEGORÍAS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{(cats.data ?? []).map((c: any) => <Chip key={c.id} t={c.nombre} onPress={() => navigation.navigate('Catalogo', { categoriaId: c.id })} />)}</ScrollView></View>
        <Titulo t={usuario ? '✨ Recomendadas para ti' : 'Lo más popular'} sub={usuario ? 'Según tu historial, preferencias y la temporada' : 'Inicia sesión para recomendaciones personalizadas'} />
        {lista.length ? <FlatList horizontal data={lista} keyExtractor={(p: any) => String(p.productoId)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <ProductoCard p={item} ancho={158} onPress={() => ir(item)} />} /> : <Text style={{ color: C.gris }}>{reco.cargando ? 'Cargando…' : 'Sin recomendaciones por ahora.'}</Text>}
        <Titulo t="Novedades de la temporada" accion="Ver todo" onAccion={() => navigation.navigate('Catalogo', { temporadaActual: '1' })} />
        <FlatList horizontal data={nuevos.data ?? []} keyExtractor={(p: any) => String(p.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <ProductoCard p={item} ancho={158} onPress={() => ir(item)} />} />
      </ScrollView>
    </SafeAreaView>
  );
}
