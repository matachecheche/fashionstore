import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRef, useState } from 'react';
import { Dimensions, FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context';
import { COLORES as C } from '../config';
import { ONBOARDING } from '../manual';
import { Alerta, Boton, Campo, s } from '../ui';

const { width } = Dimensions.get('window');

// Introduccion de 4 pantallas la primera vez (Parte III: onboarding guiado)
export function Onboarding({ navigation }: any) {
  const [i, setI] = useState(0); const ref = useRef<FlatList>(null);
  const fin = async () => { await AsyncStorage.setItem('fs_onboarding', '1'); navigation.replace('Tabs'); };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.marca }}>
      <FlatList ref={ref} data={ONBOARDING} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(x) => x.t} onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (<View style={{ width, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 18 }}><Text style={{ fontSize: 90 }}>{item.icono}</Text><Text style={{ color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'center' }}>{item.t}</Text><Text style={{ color: '#ffffffd9', fontSize: 16, textAlign: 'center', lineHeight: 23 }}>{item.d}</Text></View>)} />
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 14 }}>{ONBOARDING.map((_, k) => <View key={k} style={{ height: 8, width: k === i ? 24 : 8, borderRadius: 4, backgroundColor: k === i ? '#fff' : '#ffffff55' }} />)}</View>
      <View style={{ padding: 20, gap: 10 }}>
        <Boton t={i === ONBOARDING.length - 1 ? '¡Empezar!' : 'Siguiente'} tipo="sec" onPress={() => (i === ONBOARDING.length - 1 ? fin() : ref.current?.scrollToIndex({ index: i + 1 }))} />
        {i < ONBOARDING.length - 1 && <Boton t="Omitir" tipo="ghost" style={{ borderColor: 'transparent' }} onPress={fin} />}
      </View>
    </SafeAreaView>
  );
}

export function Login({ navigation, route }: any) {
  const { login } = useAuth(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [cargando, setCargando] = useState(false);
  async function enviar() {
    setError(''); setCargando(true);
    try { await login(email.trim(), password); navigation.canGoBack() ? navigation.goBack() : navigation.replace('Tabs'); route.params?.alVolver?.(); } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }
  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 40, textAlign: 'center' }}>👗</Text><Text style={[s.h1, { textAlign: 'center' }]}>Iniciar sesión</Text>
        <Campo label="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Campo label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        {error ? <Alerta tipo="bad" t={error} /> : null}
        <Boton t="Ingresar" onPress={enviar} cargando={cargando} disabled={!email || !password} />
        <Boton t="Crear cuenta nueva" tipo="sec" onPress={() => navigation.navigate('Registro')} />
        <Text style={{ color: C.gris, fontSize: 12, textAlign: 'center' }}>Demo: cliente@fashionstore.test / Cliente123!</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Registro({ navigation }: any) {
  const { registrar } = useAuth(); const [f, setF] = useState({ nombre: '', email: '', telefono: '', password: '', repetir: '' }); const [error, setError] = useState(''); const [cargando, setCargando] = useState(false);
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  async function enviar() {
    if (f.password !== f.repetir) return setError('Las contraseñas no coinciden.');
    setError(''); setCargando(true);
    try { await registrar({ nombre: f.nombre.trim(), email: f.email.trim(), password: f.password, telefono: f.telefono || undefined }); navigation.popToTop(); navigation.replace('Tabs'); } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }
  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Crear cuenta</Text>
        <Campo label="Nombre completo" value={f.nombre} onChangeText={set('nombre')} autoComplete="name" />
        <Campo label="Correo electrónico" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
        <Campo label="Teléfono (opcional)" value={f.telefono} onChangeText={set('telefono')} keyboardType="phone-pad" />
        <Campo label="Contraseña" ayuda="Mínimo 6 caracteres" value={f.password} onChangeText={set('password')} secureTextEntry />
        <Campo label="Repite la contraseña" value={f.repetir} onChangeText={set('repetir')} secureTextEntry />
        {error ? <Alerta tipo="bad" t={error} /> : null}
        <Boton t="Crear cuenta" onPress={enviar} cargando={cargando} disabled={f.nombre.trim().length < 2 || !f.email || f.password.length < 6} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
