import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bs, img, post } from '../api';
import { COLORES as C } from '../config';
import { useDatos } from '../context';
import { Icono, s } from '../ui';

interface Msg { rol: 'user' | 'assistant'; texto: string; productos?: any[]; sugerencias?: string[] }

// Asistente virtual con IA: consultas en lenguaje natural sobre prendas y sobre como usar la app (para dictar usa el microfono del teclado)
export default function Asistente({ navigation }: any) {
  const { sucursalId } = useDatos();
  const [msgs, setMsgs] = useState<Msg[]>([{ rol: 'assistant', texto: '¡Hola! Soy el asistente de FashionStore 👗\nPuedo ayudarte a encontrar prendas y a usar la app. También puedes dictar tu consulta con el micrófono del teclado 🎤', sugerencias: ['Vestidos para una fiesta de verano', '¿Cómo reservo una prenda?', '¿Qué hay en oferta?', 'Blusas rosadas hasta 150 Bs'] }]);
  const [t, setT] = useState(''); const [cargando, setCargando] = useState(false); const lista = useRef<FlatList>(null);
  useEffect(() => { setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 100); }, [msgs, cargando]);
  async function enviar(texto: string) {
    const m = texto.trim(); if (!m || cargando) return; const historial = msgs.slice(-8).map((x) => ({ rol: x.rol, texto: x.texto }));
    setMsgs((x) => [...x, { rol: 'user', texto: m }]); setT(''); setCargando(true);
    try { const r = await post('/ia/chat', { mensaje: m, sucursalId: sucursalId ?? undefined, historial }); setMsgs((x) => [...x, { rol: 'assistant', texto: r.respuesta.replace(/\*\*/g, ''), productos: r.productos, sugerencias: r.sugerencias }]); }
    catch (e: any) { setMsgs((x) => [...x, { rol: 'assistant', texto: `No pude responder ahora: ${e.message}` }]); }
    setCargando(false);
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.fondo }} edges={['top']}>
      <View style={{ backgroundColor: C.marca, padding: 14 }}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Asistente virtual ✨</Text><Text style={{ color: '#ffffffcc', fontSize: 12 }}>Inteligencia artificial con datos reales del catálogo</Text></View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <FlatList ref={lista} data={msgs} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled"
          renderItem={({ item: m, index }) => (
            <View style={{ alignItems: m.rol === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
              <View style={{ maxWidth: '88%', backgroundColor: m.rol === 'user' ? C.marca : '#fff', padding: 12, borderRadius: 16, borderWidth: m.rol === 'user' ? 0 : 1, borderColor: C.linea }}><Text style={{ color: m.rol === 'user' ? '#fff' : C.tinta, lineHeight: 20 }}>{m.texto}</Text></View>
              {m.productos?.slice(0, 4).map((p: any) => <Pressable key={p.productoId} onPress={() => navigation.navigate('Producto', { id: p.productoId })} style={{ flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: C.linea, alignItems: 'center', maxWidth: '88%' }}><Image source={{ uri: img(p.imagen) }} style={{ width: 46, height: 60, borderRadius: 8, backgroundColor: '#f3ecef' }} /><View style={{ flexShrink: 1 }}><Text style={{ fontWeight: '600' }} numberOfLines={2}>{p.nombre}</Text><Text style={{ color: C.marca, fontWeight: '700' }}>{bs(p.precioVigente)}</Text></View></Pressable>)}
              {index === msgs.length - 1 && m.sugerencias && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{m.sugerencias.map((x: string) => <Pressable key={x} onPress={() => enviar(x)} style={{ borderWidth: 1, borderColor: C.marca, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' }}><Text style={{ color: C.marca, fontSize: 12 }}>{x}</Text></Pressable>)}</ScrollView>}
            </View>)}
          ListFooterComponent={cargando ? <Text style={{ color: C.gris }}>Escribiendo…</Text> : null} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.linea, alignItems: 'center' }}>
          <TextInput value={t} onChangeText={setT} placeholder="Escribe o dicta tu consulta…" maxLength={500} onSubmitEditing={() => enviar(t)} returnKeyType="send" style={[s.input, { flex: 1, borderRadius: 99 }]} accessibilityLabel="Mensaje" />
          <Pressable onPress={() => enviar(t)} disabled={cargando || !t.trim()} accessibilityLabel="Enviar" style={{ backgroundColor: C.marca, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: !t.trim() ? 0.5 : 1 }}><Icono name="send" size={18} color="#fff" /></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
