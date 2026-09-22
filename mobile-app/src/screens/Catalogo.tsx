import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { get } from '../api';
import { COLORES as C } from '../config';
import { useCarga, useDatos } from '../context';
import { cacheGet, cacheSet } from '../offline';
import { Alerta, Boton, Cargando, Chip, ErrorBox, Icono, ProductoCard, Vacio } from '../ui';

// CU-03 Consultar catalogo y disponibilidad por sucursal (con filtros y cache sin conexion)
export default function Catalogo({ navigation, route }: any) {
  const p0 = route.params ?? {}; const { sucursales, sucursalId, setSucursalId, online } = useDatos();
  const [f, setF] = useState<Record<string, string>>({ q: p0.q ?? '', categoriaId: p0.categoriaId ? String(p0.categoriaId) : '', temporadaId: '', talla: '', color: '', min: '', max: '', orden: '', soloDisponibles: '', temporadaActual: p0.temporadaActual ?? '' });
  const [q, setQ] = useState(f.q); const [filtros, setFiltros] = useState(false);
  const cats = useCarga(async () => (await cacheGet('cats')) ?? (await get('/categorias')), []); const temps = useCarga(() => get('/temporadas'), []); const facets = useCarga(() => get('/productos/filtros'), []);
  const qs = new URLSearchParams({ limite: '120', ...(sucursalId ? { sucursalId: String(sucursalId) } : {}), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const lista = useCarga(async () => { try { const r = await get(`/productos?${qs}`); if (qs.length < 20) cacheSet('catalogo', r); return r; } catch (e) { const c = await cacheGet('catalogo'); if (c) return c.filter((x: any) => !f.q || x.nombre.toLowerCase().includes(f.q.toLowerCase())); throw e; } }, [qs]);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: x[k] === v ? '' : v }));
  const nFiltros = ['categoriaId', 'temporadaId', 'talla', 'color', 'min', 'max', 'soloDisponibles', 'temporadaActual'].filter((k) => f[k]).length;
  const tallas = (facets.data ?? []).filter((x: any) => x.tipo === 'talla'); const colores = (facets.data ?? []).filter((x: any) => x.tipo === 'color');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.fondo }} edges={['top']}>
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, borderWidth: 1, borderColor: C.linea, gap: 8 }}><Icono name="search" size={18} color={C.gris} />
            <TextInput value={q} onChangeText={setQ} placeholder="Buscar en el catálogo" returnKeyType="search" onSubmitEditing={() => setF({ ...f, q })} style={{ flex: 1, paddingVertical: 10 }} accessibilityLabel="Buscar" />{!!q && <Pressable onPress={() => { setQ(''); setF({ ...f, q: '' }); }}><Icono name="close-circle" size={18} color={C.gris} /></Pressable>}</View>
          <Pressable onPress={() => setFiltros(true)} accessibilityLabel="Filtros" style={{ backgroundColor: nFiltros ? C.marca : '#fff', borderRadius: 99, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: nFiltros ? C.marca : C.linea, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icono name="options-outline" size={18} color={nFiltros ? '#fff' : C.tinta} />{nFiltros > 0 && <Text style={{ color: '#fff', fontWeight: '700' }}>{nFiltros}</Text>}</Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip t="Todas" act={!f.categoriaId} onPress={() => setF({ ...f, categoriaId: '' })} />{(cats.data ?? []).map((c: any) => <Chip key={c.id} t={c.nombre} act={f.categoriaId === String(c.id)} onPress={() => set('categoriaId', String(c.id))} />)}</ScrollView>
        {sucursalId && <Text style={{ color: C.gris, fontSize: 12 }}>Mostrando disponibilidad en <Text style={{ fontWeight: '700' }}>{sucursales.find((s) => s.id === sucursalId)?.nombre}</Text></Text>}
        {!online && <Alerta tipo="warn" t="Sin conexión: mostrando el catálogo guardado." />}
      </View>
      {lista.cargando && !lista.data ? <Cargando /> : lista.error && !lista.data ? <View style={{ padding: 16 }}><ErrorBox t={lista.error} onRetry={() => lista.recargar()} /></View> : (
        <FlatList data={lista.data ?? []} numColumns={2} keyExtractor={(p: any) => String(p.id)} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 }} columnWrapperStyle={{ gap: 12 }}
          onRefresh={() => lista.recargar(true)} refreshing={false}
          ListEmptyComponent={<Vacio icono="search-outline" t="No encontramos prendas con esos filtros."><Boton t="Quitar filtros" tipo="sec" onPress={() => { setQ(''); setF({ q: '', categoriaId: '', temporadaId: '', talla: '', color: '', min: '', max: '', orden: '', soloDisponibles: '', temporadaActual: '' }); }} /></Vacio>}
          renderItem={({ item }) => <ProductoCard p={item} onPress={() => navigation.navigate('Producto', { id: item.id })} />} />)}
      <Modal visible={filtros} animationType="slide" onRequestClose={() => setFiltros(false)} transparent>
        <View style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}><View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}><Text style={{ fontSize: 20, fontWeight: '700' }}>Filtros</Text><Pressable onPress={() => setFiltros(false)}><Icono name="close" size={26} /></Pressable></View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 10 }}>
            <Sec t="Sucursal (disponibilidad)"><Chip t="Todas" act={!sucursalId} onPress={() => setSucursalId(null)} />{sucursales.map((s) => <Chip key={s.id} t={s.nombre.replace('Sucursal ', '')} act={sucursalId === s.id} onPress={() => setSucursalId(s.id)} />)}</Sec>
            {sucursalId && <Chip t="Solo con stock en esta sucursal" act={!!f.soloDisponibles} onPress={() => set('soloDisponibles', '1')} />}
            <Sec t="Temporada">{(temps.data ?? []).map((t: any) => <Chip key={t.id} t={t.nombre} act={f.temporadaId === String(t.id)} onPress={() => set('temporadaId', String(t.id))} />)}</Sec>
            <Sec t="Talla">{tallas.map((t: any) => <Chip key={t.valor} t={t.valor} act={f.talla === t.valor} onPress={() => set('talla', t.valor)} />)}</Sec>
            <Sec t="Color">{colores.map((c: any) => <Chip key={c.valor} t={c.valor} color={c.hex} act={f.color === c.valor} onPress={() => set('color', c.valor)} />)}</Sec>
            <Sec t="Precio (Bs)"><TextInput value={f.min} onChangeText={(v) => setF({ ...f, min: v.replace(/\D/g, '') })} placeholder="Mín." keyboardType="numeric" style={{ borderWidth: 1, borderColor: '#d9ccd1', borderRadius: 10, padding: 9, width: 90 }} /><TextInput value={f.max} onChangeText={(v) => setF({ ...f, max: v.replace(/\D/g, '') })} placeholder="Máx." keyboardType="numeric" style={{ borderWidth: 1, borderColor: '#d9ccd1', borderRadius: 10, padding: 9, width: 90 }} /></Sec>
            <Sec t="Ordenar por">{[['', 'Recientes'], ['precio_asc', 'Menor precio'], ['precio_desc', 'Mayor precio'], ['nombre', 'A-Z']].map(([v, t]) => <Chip key={v} t={t} act={f.orden === v} onPress={() => setF({ ...f, orden: v })} />)}</Sec>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10 }}><Boton t="Limpiar" tipo="sec" style={{ flex: 1 }} onPress={() => setF({ ...f, categoriaId: '', temporadaId: '', talla: '', color: '', min: '', max: '', soloDisponibles: '', temporadaActual: '' })} /><Boton t="Ver resultados" style={{ flex: 2 }} onPress={() => setFiltros(false)} /></View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}
const Sec = ({ t, children }: { t: string; children: any }) => <View style={{ gap: 8 }}><Text style={{ fontWeight: '700', color: C.gris, fontSize: 12 }}>{t.toUpperCase()}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</View></View>;
