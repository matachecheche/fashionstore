import { useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { get, img, post, bs } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarga, useCarrito, useDatos, useToast } from '../context';
import { Alerta, Badge, Boton, Cargando, Chip, ErrorBox, Icono, ProductoCard, Tarjeta, Titulo } from '../ui';

const { width } = Dimensions.get('window');

export default function Producto({ navigation, route }: any) {
  const id = route.params.id; const toast = useToast(); const { usuario } = useAuth(); const { agregar } = useCarrito(); const { sucursales, sucursalId, setSucursalId } = useDatos();
  const prod = useCarga(() => get(`/productos/${id}`), [id]); const disp = useCarga(() => get(`/productos/${id}/disponibilidad`), [id]); const combina = useCarga(() => get(`/ia/recomendaciones?productoId=${id}&limite=4`), [id, usuario?.id]);
  const [color, setColor] = useState(''); const [talla, setTalla] = useState(''); const [foto, setFoto] = useState('');
  const p = prod.data;
  useEffect(() => { if (p) { setColor(p.variantes[0]?.color ?? ''); post('/ia/interacciones', { productoId: p.id, tipo: 'vista' }).catch(() => {}); } }, [p?.id]);   // eslint-disable-line
  const fotos = useMemo(() => (p ? p.imagenes.filter((i: any) => !i.esOverlayAr) : []), [p]);
  useEffect(() => { if (p) { setTalla(''); setFoto((fotos.find((i: any) => (i.color ?? '').toLowerCase() === color.toLowerCase()) ?? fotos[0])?.url ?? ''); } }, [color, p?.id]);   // eslint-disable-line
  if (prod.cargando) return <Cargando />;
  if (!p) return <View style={{ padding: 16 }}><ErrorBox t={prod.error || 'Producto no encontrado'} onRetry={() => prod.recargar()} /></View>;
  const colores = [...new Map<string, any>(p.variantes.map((v: any) => [v.color, v])).values()];
  const tallas = p.variantes.filter((v: any) => v.color === color);
  const dispVar = (vid: number, sid: number) => disp.data?.find((d: any) => d.varianteId === vid && d.sucursalId === sid)?.disponible ?? 0;
  const variante = tallas.find((v: any) => v.talla === talla);
  const enSuc = (v: any) => (sucursalId ? dispVar(v.id, sucursalId) : v.disponible);

  const exigirTalla = () => { if (!variante) { toast.error('Elige una talla primero.'); return true; } return false; };
  const alCarrito = () => { if (exigirTalla()) return; if (sucursalId && dispVar(variante.id, sucursalId) === 0) return toast.error('Agotada en la sucursal elegida.'); agregar({ varianteId: variante.id, productoId: p.id, nombre: p.nombre, talla: variante.talla, color: variante.color, colorHex: variante.colorHex, precio: p.precioVigente, imagen: foto }); post('/ia/interacciones', { productoId: p.id, tipo: 'carrito' }).catch(() => {}); toast.ok('Agregado al carrito'); };
  const reservar = (suc?: number | null) => { if (!usuario) return navigation.navigate('Login'); if (exigirTalla()) return; navigation.navigate('Reservar', { items: [{ varianteId: variante.id, cantidad: 1, etiqueta: `${p.nombre} (${variante.talla}/${variante.color})` }], sucursalId: suc ?? sucursalId }); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.fondo }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: '#f3ecef' }}><Image source={{ uri: img(foto) }} style={{ width, height: width * 1.15 }} resizeMode="cover" />
        <View style={{ position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', gap: 8 }}>{fotos.map((f: any) => <Pressable key={f.id} onPress={() => { setFoto(f.url); if (f.color) setColor(f.color); }}><Image source={{ uri: img(f.url) }} style={{ width: 46, height: 62, borderRadius: 8, borderWidth: 2, borderColor: f.url === foto ? C.marca : '#fff' }} /></Pressable>)}</View></View>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><Badge t={p.categoria} tipo="marca" />{p.temporada && <Badge t={p.temporada} tipo="info" />}{p.coleccion && <Badge t={p.coleccion} />}</View>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>{p.nombre}</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.marca }}>{bs(p.precioVigente)} {p.promocion > 0 && <Text style={{ fontSize: 15, color: C.gris, fontWeight: '400', textDecorationLine: 'line-through' }}>{bs(p.precioMenor)} </Text>}{p.promocion > 0 && <Text style={{ fontSize: 14, color: C.ok }}>-{Math.round(p.promocion)}%</Text>}</Text>
        <Text style={{ color: C.gris, lineHeight: 20 }}>{p.descripcion}</Text>{p.material && <Text style={{ color: C.gris, fontSize: 12 }}>Material: {p.material} · Textura: {p.textura}</Text>}
        <View style={{ gap: 8 }}><Text style={{ fontWeight: '700' }}>Color: <Text style={{ fontWeight: '400', color: C.gris }}>{color}</Text></Text><View style={{ flexDirection: 'row', gap: 10 }}>{colores.map((c: any) => <Pressable key={c.color} onPress={() => setColor(c.color)} accessibilityLabel={c.color} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.colorHex, borderWidth: 3, borderColor: c.color === color ? C.marca : '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3 }} />)}</View></View>
        <View style={{ gap: 8 }}><Text style={{ fontWeight: '700' }}>Talla</Text><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{tallas.map((v: any) => { const d = enSuc(v); return <Pressable key={v.id} disabled={d === 0} onPress={() => setTalla(v.talla)} style={{ minWidth: 48, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: talla === v.talla ? C.marca : '#d9ccd1', backgroundColor: talla === v.talla ? C.marca : '#fff', opacity: d === 0 ? 0.4 : 1 }}><Text style={{ fontWeight: '700', color: talla === v.talla ? '#fff' : C.tinta, textDecorationLine: d === 0 ? 'line-through' : 'none' }}>{v.talla}</Text></Pressable>; })}</View>
          {variante && <Badge t={enSuc(variante) > 0 ? `${enSuc(variante)} disponibles${sucursalId ? '' : ' en total'}` : 'Agotado'} tipo={enSuc(variante) > 0 ? 'ok' : 'bad'} />}</View>
        <View style={{ gap: 10 }}>
          <Boton t="Probar en vestidor virtual (AR)" icono="camera-outline" onPress={() => navigation.navigate('ProbadorAR', { productoId: p.id, color, talla })} />
          <View style={{ flexDirection: 'row', gap: 10 }}><Boton t="Agregar al carrito" tipo="sec" icono="cart-outline" style={{ flex: 1 }} onPress={alCarrito} /><Boton t="Reservar" tipo="sec" icono="calendar-outline" style={{ flex: 1 }} onPress={() => reservar()} /></View>
        </View>
        <Tarjeta><Text style={{ fontWeight: '700', fontSize: 16 }}>📍 Disponibilidad por sucursal</Text>
          {!variante ? <Text style={{ color: C.gris }}>Elige color y talla para ver el stock en cada sucursal.</Text> : disp.cargando ? <Cargando /> : sucursales.map((s) => { const n = dispVar(variante.id, s.id); return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderColor: C.linea, gap: 8 }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{s.nombre}</Text><Text style={{ color: C.gris, fontSize: 12 }}>{s.ciudad}</Text></View>
              <Badge t={n > 0 ? (n <= 3 ? `¡Últimas ${n}!` : `${n} disp.`) : 'Agotado'} tipo={n > 3 ? 'ok' : n > 0 ? 'warn' : 'bad'} />{n > 0 && <Boton t="Reservar" peque tipo="sec" onPress={() => reservar(s.id)} />}</View>); })}</Tarjeta>
        {combina.data?.recomendaciones?.length > 0 && <><Titulo t="✨ Combina con esta prenda" /><FlatList horizontal data={combina.data.recomendaciones} keyExtractor={(x: any) => String(x.productoId)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <ProductoCard p={item} ancho={150} onPress={() => navigation.push('Producto', { id: item.productoId })} />} /></>}
      </View>
    </ScrollView>
  );
}
