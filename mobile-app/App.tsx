import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORES as C } from './src/config';
import { Providers, useCarrito } from './src/context';
import { Icono } from './src/ui';
import { Login, Onboarding, Registro } from './src/screens/Auth';
import Inicio from './src/screens/Inicio';
import Catalogo from './src/screens/Catalogo';
import Producto from './src/screens/Producto';
import Reservar from './src/screens/Reservar';
import Carrito from './src/screens/Carrito';
import Checkout from './src/screens/Checkout';
import Pago from './src/screens/Pago';
import Reservas from './src/screens/Reservas';
import { Comprobante, Pedidos } from './src/screens/Pedidos';
import Asistente from './src/screens/Asistente';
import { Ayuda, Notificaciones, Perfil } from './src/screens/Cuenta';
import ProbadorAR from './src/screens/ProbadorAR';

const Stack = createNativeStackNavigator(); const Tab = createBottomTabNavigator();
const ICONOS: Record<string, [string, string]> = { Inicio: ['home', 'home-outline'], Catalogo: ['grid', 'grid-outline'], Asistente: ['sparkles', 'sparkles-outline'], Reservas: ['calendar', 'calendar-outline'], Perfil: ['person', 'person-outline'] };

function Tabs() {
  const { cantidad } = useCarrito();
  return (
    <Tab.Navigator screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: C.marca, tabBarInactiveTintColor: C.gris, tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 }, tabBarIcon: ({ focused, color, size }) => <Icono name={(ICONOS[route.name][focused ? 0 : 1]) as any} size={size} color={color} /> })}>
      <Tab.Screen name="Inicio" component={Inicio} options={{ tabBarBadge: cantidad > 0 ? cantidad : undefined, tabBarBadgeStyle: { backgroundColor: C.marca } }} />
      <Tab.Screen name="Catalogo" component={Catalogo} options={{ title: 'Catálogo' }} />
      <Tab.Screen name="Asistente" component={Asistente} options={{ title: 'Asistente' }} />
      <Tab.Screen name="Reservas" component={Reservas} />
      <Tab.Screen name="Perfil" component={Perfil} />
    </Tab.Navigator>
  );
}

function Raiz() {
  const [inicial, setInicial] = useState<string | null>(null);
  useEffect(() => { AsyncStorage.getItem('fs_onboarding').then((v) => setInicial(v ? 'Tabs' : 'Onboarding')); }, []);
  if (!inicial) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.marca} /></View>;
  const cab = { headerTintColor: C.marca, headerTitleStyle: { color: C.tinta, fontWeight: '700' as const }, headerStyle: { backgroundColor: '#fff' }, headerBackTitle: 'Atrás' };
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={inicial} screenOptions={cab}>
        <Stack.Screen name="Onboarding" component={Onboarding} options={{ headerShown: false }} />
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Producto" component={Producto} options={{ title: 'Detalle' }} />
        <Stack.Screen name="ProbadorAR" component={ProbadorAR} options={{ title: 'Vestidor virtual' }} />
        <Stack.Screen name="Reservar" component={Reservar} options={{ title: 'Reservar prendas' }} />
        <Stack.Screen name="Carrito" component={Carrito} options={{ title: 'Mi carrito' }} />
        <Stack.Screen name="Checkout" component={Checkout} options={{ title: 'Finalizar compra' }} />
        <Stack.Screen name="Pago" component={Pago} options={{ title: 'Pago', headerBackVisible: false }} />
        <Stack.Screen name="MisPedidos" component={Pedidos} options={{ title: 'Mis pedidos' }} />
        <Stack.Screen name="Comprobante" component={Comprobante} options={{ title: 'Comprobante' }} />
        <Stack.Screen name="Notificaciones" component={Notificaciones} options={{ title: 'Notificaciones' }} />
        <Stack.Screen name="Ayuda" component={Ayuda} options={{ title: 'Ayuda' }} />
        <Stack.Screen name="Login" component={Login} options={{ title: 'Ingresar', presentation: 'modal' }} />
        <Stack.Screen name="Registro" component={Registro} options={{ title: 'Crear cuenta' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (<SafeAreaProvider><Providers><StatusBar style="dark" /><Raiz /></Providers></SafeAreaProvider>);
}
