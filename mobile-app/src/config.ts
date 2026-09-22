import Constants from 'expo-constants';

// URL de la API comercial (NestJS). Prioridad: variable EXPO_PUBLIC_API_URL (.env) -> IP de la PC que sirve Metro + :3000.
function deducir(): string {
  const host = (Constants.expoConfig as any)?.hostUri?.split(':')[0] as string | undefined;
  return host ? `http://${host}:3000` : 'http://10.0.2.2:3000';   // 10.0.2.2 = PC vista desde el emulador de Android
}
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || deducir()).replace(/\/$/, '');

export const COLORES = { marca: '#7a2f45', marca2: '#a34862', suave: '#f6e9ee', tinta: '#23181c', gris: '#6b5f64', linea: '#e9dfe3', fondo: '#faf6f7', blanco: '#ffffff', ok: '#1e8e4f', okBg: '#e4f5ec', warn: '#b26a00', warnBg: '#fff1d9', bad: '#b3261e', badBg: '#fde8e6', info: '#1a5fa8', infoBg: '#e5f0fb' };
