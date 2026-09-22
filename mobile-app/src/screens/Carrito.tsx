import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { bs, img } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarrito } from '../context';
import { Boton, Icono, s, Vacio } from '../ui';

export default function Carrito({ navigation }: any) {
  const { items, cambiar, quitar, total, vaciar } = useCarrito(); const { usuario } = useAuth();
  if (!items.length) return <View style={s.pantalla}><Vacio icono="bag-outline" t="Tu carrito está vacío"><Boton t="Explorar catálogo" onPress={() => navigation.navigate('Tabs', { screen: 'Catalogo' })} /></Vacio></View>;
  const exigir = (f: () => void) => (usuario ? f() : navigation.navigate('Login'));
  return (
    <View style={s.pantalla}>
      <FlatList data={items} keyExtractor={(i) => String(i.varianteId)} contentContainerStyle={{ padding: 14, gap: 12 }}
        renderItem={({ item: i }) => (
          <View style={{ flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: C.linea }}>
            <Image source={{ uri: img(i.imagen) }} style={{ width: 72, height: 96, borderRadius: 8, backgroundColor: '#f3ecef' }} />
            <View style={{ flex: 1, gap: 3 }}><Text style={{ fontWeight: '700' }} numberOfLines={2}>{i.nombre}</Text><Text style={{ color: C.gris, fontSize: 12 }}>{i.color} · Talla {i.talla}</Text><Text style={{ color: C.marca, fontWeight: '700' }}>{bs(i.precio)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d9ccd1', borderRadius: 99 }}><Pressable onPress={() => cambiar(i.varianteId, i.cantidad - 1)} style={{ padding: 6 }} accessibilityLabel="Menos"><Icono name="remove" size={18} /></Pressable><Text style={{ minWidth: 24, textAlign: 'center', fontWeight: '700' }}>{i.cantidad}</Text><Pressable onPress={() => cambiar(i.varianteId, i.cantidad + 1)} style={{ padding: 6 }} accessibilityLabel="Más"><Icono name="add" size={18} /></Pressable></View>
                <Pressable onPress={() => quitar(i.varianteId)} accessibilityLabel="Quitar"><Icono name="trash-outline" size={20} color={C.bad} /></Pressable></View></View>
          </View>)} />
      <View style={{ backgroundColor: '#fff', padding: 16, gap: 10, borderTopWidth: 1, borderColor: C.linea }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 16 }}>Total</Text><Text style={{ fontSize: 22, fontWeight: '800', color: C.marca }}>{bs(total)}</Text></View>
        <Boton t="Ir a pagar" onPress={() => exigir(() => navigation.navigate('Checkout'))} />
        <Boton t="Reservar para probar en tienda" tipo="sec" onPress={() => exigir(() => navigation.navigate('Reservar', { desdeCarrito: true, items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad, etiqueta: `${i.nombre} (${i.talla}/${i.color})` })) }))} />
        <Pressable onPress={vaciar}><Text style={{ textAlign: 'center', color: C.gris }}>Vaciar carrito</Text></Pressable>
      </View>
    </View>
  );
}
