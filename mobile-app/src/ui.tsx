import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from 'react-native';
import { bs, img } from './api';
import { COLORES as C } from './config';

export const Icono = Ionicons;

export function Boton({ t, onPress, tipo = 'primario', disabled, icono, cargando, style, peque }: { t: string; onPress?: () => void; tipo?: 'primario' | 'sec' | 'peligro' | 'ghost' | 'verde'; disabled?: boolean; icono?: keyof typeof Ionicons.glyphMap; cargando?: boolean; style?: StyleProp<ViewStyle>; peque?: boolean }) {
  const fondo = tipo === 'primario' ? C.marca : tipo === 'verde' ? C.ok : '#fff'; const borde = tipo === 'peligro' ? C.bad : tipo === 'ghost' ? 'transparent' : tipo === 'verde' ? C.ok : C.marca;
  const color = tipo === 'primario' || tipo === 'verde' ? '#fff' : tipo === 'peligro' ? C.bad : tipo === 'ghost' ? C.tinta : C.marca;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t} activeOpacity={0.8} disabled={disabled || cargando} onPress={onPress}
      style={[{ backgroundColor: fondo, borderColor: borde, borderWidth: 1, borderRadius: 999, paddingVertical: peque ? 8 : 13, paddingHorizontal: peque ? 14 : 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }, style]}>
      {cargando ? <ActivityIndicator color={color} /> : <>{icono && <Ionicons name={icono} size={peque ? 15 : 18} color={color} />}<Text style={{ color, fontWeight: '700', fontSize: peque ? 13 : 15 }}>{t}</Text></>}
    </TouchableOpacity>
  );
}

export function Campo({ label, ayuda, ...p }: { label: string; ayuda?: string } & TextInputProps) {
  return (<View style={{ gap: 5 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#a89ba1" {...p} style={[s.input, p.style]} />{ayuda && <Text style={s.ayuda}>{ayuda}</Text>}</View>);
}
export const Chip = ({ t, act, onPress, color }: { t: string; act?: boolean; onPress?: () => void; color?: string }) => (
  <Pressable onPress={onPress} style={[s.chip, act && { backgroundColor: C.marca, borderColor: C.marca }]}>{color && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 1, borderColor: '#0002' }} />}<Text style={{ color: act ? '#fff' : C.tinta, fontWeight: '600', fontSize: 13 }}>{t}</Text></Pressable>
);
const COL: Record<string, [string, string]> = { ok: [C.okBg, C.ok], warn: [C.warnBg, C.warn], bad: [C.badBg, C.bad], info: [C.infoBg, C.info], marca: [C.suave, C.marca], gris: ['#eee', '#555'] };
export const Badge = ({ t, tipo = 'gris' }: { t: string; tipo?: string }) => <View style={{ backgroundColor: (COL[tipo] ?? COL.gris)[0], paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' }}><Text style={{ color: (COL[tipo] ?? COL.gris)[1], fontSize: 11, fontWeight: '700' }}>{t}</Text></View>;
export const Cargando = () => <View style={{ padding: 40 }}><ActivityIndicator size="large" color={C.marca} /></View>;
export const Vacio = ({ icono = 'bag-outline', t, children }: { icono?: keyof typeof Ionicons.glyphMap; t: string; children?: ReactNode }) => <View style={{ alignItems: 'center', padding: 36, gap: 10 }}><Ionicons name={icono} size={48} color={C.linea} /><Text style={{ color: C.gris, textAlign: 'center' }}>{t}</Text>{children}</View>;
export const Tarjeta = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.tarjeta, style]}>{children}</View>;
export const Titulo = ({ t, sub, accion, onAccion }: { t: string; sub?: string; accion?: string; onAccion?: () => void }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}><View style={{ flex: 1 }}><Text style={s.h2}>{t}</Text>{sub && <Text style={{ color: C.gris, fontSize: 12 }}>{sub}</Text>}</View>{accion && <Pressable onPress={onAccion}><Text style={{ color: C.marca, fontWeight: '600' }}>{accion}</Text></Pressable>}</View>
);
export const ErrorBox = ({ t, onRetry }: { t: string; onRetry?: () => void }) => <View style={{ backgroundColor: C.badBg, padding: 12, borderRadius: 12, gap: 6 }}><Text style={{ color: C.bad }}>{t}</Text>{onRetry && <Boton t="Reintentar" tipo="sec" peque onPress={onRetry} />}</View>;
export const Alerta = ({ t, tipo = 'info' }: { t: string; tipo?: 'info' | 'ok' | 'warn' | 'bad' }) => <View style={{ backgroundColor: COL[tipo][0], padding: 12, borderRadius: 12 }}><Text style={{ color: COL[tipo][1], fontSize: 13 }}>{t}</Text></View>;

export function ProductoCard({ p, onPress, ancho }: { p: any; onPress: () => void; ancho?: number }) {
  const foto = p.imagen ?? p.imagenes?.find((i: any) => !i.esOverlayAr)?.url; const agotado = (p.stockTotal ?? p.disponible ?? 1) <= 0; const precio = p.precioVigente ?? p.precio; const lista = p.precioMenor ?? p.precio;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={p.nombre} style={[s.card, ancho ? { width: ancho } : { flex: 1 }]}>
      <View style={{ aspectRatio: 5 / 7, backgroundColor: '#f3ecef' }}>
        {foto && <Image source={{ uri: img(foto) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
        {p.promocion > 0 && <View style={s.cinta}><Text style={s.cintaT}>-{Math.round(p.promocion)}%</Text></View>}
        {agotado && <View style={[s.cinta, { backgroundColor: '#555' }]}><Text style={s.cintaT}>Agotado</Text></View>}
      </View>
      <View style={{ padding: 10, gap: 2 }}>
        <Text style={{ color: C.gris, fontSize: 11 }} numberOfLines={1}>{p.categoria}</Text>
        <Text style={{ fontWeight: '600', color: C.tinta }} numberOfLines={2}>{p.nombre}</Text>
        <Text style={{ color: C.marca, fontWeight: '700' }}>{bs(precio)} {p.promocion > 0 && <Text style={{ color: C.gris, fontWeight: '400', fontSize: 12, textDecorationLine: 'line-through' }}>{bs(lista)}</Text>}</Text>
        {p.motivo && !/^(Lo más|Popular)/.test(p.motivo) && <Text style={{ color: C.gris, fontSize: 11 }} numberOfLines={2}>✨ {p.motivo}</Text>}
      </View>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: C.gris }, ayuda: { fontSize: 11, color: C.gris },
  input: { borderWidth: 1, borderColor: '#d9ccd1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', color: C.tinta },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#d9ccd1', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: '#fff' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.linea, gap: 8 },
  h1: { fontSize: 26, fontWeight: '700', color: C.tinta }, h2: { fontSize: 19, fontWeight: '700', color: C.tinta },
  card: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.linea },
  cinta: { position: 'absolute', top: 8, left: 8, backgroundColor: C.marca, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }, cintaT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pantalla: { flex: 1, backgroundColor: C.fondo }, fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
