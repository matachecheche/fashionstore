import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { get, patch, post } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarga, useDatos, useToast } from '../context';
import { MANUAL_CLIENTE } from '../manual';
import { Alerta, Boton, Campo, Chip, Cargando, Icono, s, Tarjeta, Vacio } from '../ui';

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', '36', '37', '38', '39', '40'];

export function Perfil({ navigation }: any) {
  const { usuario, logout, refrescar } = useAuth(); const toast = useToast(); const { pendientes, online } = useDatos(); const colores = useCarga(() => get('/productos/filtros'), []);
  const pref = usuario?.preferencias ?? {}; const [f, setF] = useState({ nombre: usuario?.nombre ?? '', telefono: usuario?.telefono ?? '', documento: usuario?.documento ?? '' });
  const [talla, setTalla] = useState<string>(pref.tallaHabitual ?? ''); const [favs, setFavs] = useState<string[]>(pref.coloresFavoritos ?? []); const [presu, setPresu] = useState<string>(pref.presupuestoMax ? String(pref.presupuestoMax) : '');
  const [pw, setPw] = useState({ actual: '', nueva: '' }); const [errPw, setErrPw] = useState(''); const [editando, setEditando] = useState(false);
  if (!usuario) return <SafeAreaView style={s.pantalla}><Vacio icono="person-circle-outline" t="Inicia sesión para ver tu perfil"><Boton t="Iniciar sesión" onPress={() => navigation.navigate('Login')} /><Boton t="Crear cuenta" tipo="sec" onPress={() => navigation.navigate('Registro')} /><Boton t="Ayuda y manual" tipo="ghost" onPress={() => navigation.navigate('Ayuda')} /></Vacio></SafeAreaView>;
  const guardar = async () => { try { await patch('/auth/me', { ...f, preferencias: { ...pref, tallaHabitual: talla || undefined, coloresFavoritos: favs, presupuestoMax: presu ? Number(presu) : undefined } }); await refrescar(); toast.ok('Perfil actualizado'); setEditando(false); } catch (e: any) { toast.error(e.message); } };
  const cambiarPw = async () => { setErrPw(''); try { await post('/auth/me/password', pw); setPw({ actual: '', nueva: '' }); toast.ok('Contraseña actualizada'); } catch (e: any) { setErrPw(e.message); } };
  const Fila = ({ ic, t, sub, ir }: any) => <Pressable onPress={ir} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, borderBottomWidth: 1, borderColor: C.linea }}><Icono name={ic} size={22} color={C.marca} /><View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{t}</Text>{sub && <Text style={{ color: C.gris, fontSize: 12 }}>{sub}</Text>}</View><Icono name="chevron-forward" size={18} color={C.gris} /></Pressable>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.fondo }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 4 }}><View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.marca, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>{usuario.nombre[0]}</Text></View><Text style={s.h2}>{usuario.nombre}</Text><Text style={{ color: C.gris }}>{usuario.email}</Text></View>
        {(pendientes > 0 || !online) && <Alerta tipo="warn" t={!online ? 'Sin conexión. Tus operaciones pendientes se enviarán al reconectar.' : `${pendientes} operación(es) pendiente(s) de enviar.`} />}
        <Tarjeta style={{ paddingVertical: 4 }}>
          <Fila ic="receipt-outline" t="Mis pedidos" sub="Compras y comprobantes" ir={() => navigation.navigate('MisPedidos')} />
          <Fila ic="notifications-outline" t="Notificaciones" sub="Avisos de tus reservas y pagos" ir={() => navigation.navigate('Notificaciones')} />
          <Fila ic="help-circle-outline" t="Ayuda y manual de usuario" sub="Aprende a usar la app paso a paso" ir={() => navigation.navigate('Ayuda')} />
        </Tarjeta>
        <Boton t={editando ? 'Cerrar edición' : 'Editar mis datos y preferencias'} tipo="sec" icono="create-outline" onPress={() => setEditando(!editando)} />
        {editando && <><Tarjeta><Campo label="Nombre completo" value={f.nombre} onChangeText={(v) => setF({ ...f, nombre: v })} /><Campo label="Teléfono" value={f.telefono} onChangeText={(v) => setF({ ...f, telefono: v })} keyboardType="phone-pad" /><Campo label="NIT / CI (para comprobantes)" value={f.documento} onChangeText={(v) => setF({ ...f, documento: v })} /></Tarjeta>
          <Tarjeta><Text style={{ fontWeight: '700' }}>Preferencias (mejoran tus recomendaciones)</Text><Text style={s.label}>TALLA HABITUAL</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{TALLAS.map((t) => <Chip key={t} t={t} act={talla === t} onPress={() => setTalla(talla === t ? '' : t)} />)}</View>
            <Text style={s.label}>COLORES FAVORITOS</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(colores.data ?? []).filter((c: any) => c.tipo === 'color').map((c: any) => <Chip key={c.valor} t={c.valor} color={c.hex} act={favs.includes(c.valor)} onPress={() => setFavs(favs.includes(c.valor) ? favs.filter((x) => x !== c.valor) : [...favs, c.valor])} />)}</View>
            <Campo label="Presupuesto máximo por prenda (Bs)" value={presu} onChangeText={(v) => setPresu(v.replace(/\D/g, ''))} keyboardType="numeric" /></Tarjeta>
          <Boton t="Guardar cambios" onPress={guardar} />
          <Tarjeta><Text style={{ fontWeight: '700' }}>Cambiar contraseña</Text><Campo label="Contraseña actual" value={pw.actual} onChangeText={(v) => setPw({ ...pw, actual: v })} secureTextEntry /><Campo label="Nueva contraseña" ayuda="Mínimo 6 caracteres" value={pw.nueva} onChangeText={(v) => setPw({ ...pw, nueva: v })} secureTextEntry />{errPw ? <Alerta tipo="bad" t={errPw} /> : null}<Boton t="Actualizar contraseña" tipo="sec" onPress={cambiarPw} disabled={!pw.actual || pw.nueva.length < 6} /></Tarjeta></>}
        <Boton t="Cerrar sesión" tipo="peligro" icono="log-out-outline" onPress={logout} />
      </ScrollView>
    </SafeAreaView>
  );
}

export function Notificaciones({ navigation }: any) {
  const { data, cargando, recargar } = useCarga(() => get('/notificaciones'), [], 20000); const toast = useToast();
  const abrir = async (n: any) => { await post(`/notificaciones/${n.id}/leer`).catch(() => {}); recargar(true); if (n.referenciaTipo === 'reserva') navigation.navigate('Tabs', { screen: 'Reservas' }); else if (n.referenciaTipo === 'venta') navigation.navigate('MisPedidos'); };
  if (cargando && !data) return <Cargando />;
  return (
    <FlatList style={s.pantalla} data={data ?? []} keyExtractor={(n: any) => String(n.id)} contentContainerStyle={{ padding: 14, gap: 10 }} refreshControl={<RefreshControl refreshing={false} onRefresh={() => recargar(true)} tintColor={C.marca} />}
      ListHeaderComponent={data?.some((n: any) => !n.leida) ? <Boton t="Marcar todas como leídas" tipo="sec" peque onPress={async () => { await post('/notificaciones/leer-todas'); recargar(true); toast.ok('Listo'); }} /> : null}
      ListEmptyComponent={<Vacio icono="notifications-off-outline" t="No tienes notificaciones." />}
      renderItem={({ item: n }) => <Pressable onPress={() => abrir(n)} style={{ backgroundColor: n.leida ? '#fff' : C.suave, borderRadius: 14, padding: 14, gap: 3, borderWidth: 1, borderColor: C.linea }}><Text style={{ fontWeight: '700' }}>{n.titulo}</Text><Text style={{ color: C.gris, fontSize: 13 }}>{n.mensaje}</Text><Text style={{ color: C.marca, fontSize: 11 }}>{new Date(n.creadaEn).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></Pressable>} />
  );
}

export function Ayuda() {
  const [abierto, setAbierto] = useState<number | null>(0);
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
      <Text style={s.h1}>Manual de usuario</Text><Text style={{ color: C.gris }}>Aprende a usar FashionStore paso a paso. También puedes preguntarle al asistente virtual.</Text>
      {MANUAL_CLIENTE.map((m, i) => <Tarjeta key={m.titulo}><Pressable onPress={() => setAbierto(abierto === i ? null : i)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ fontWeight: '700', flex: 1 }}>{i + 1}. {m.titulo}</Text><Icono name={abierto === i ? 'chevron-up' : 'chevron-down'} size={20} /></Pressable>{abierto === i && m.pasos.map((p, k) => <Text key={k} style={{ lineHeight: 20, color: C.tinta }}>{k + 1}. {p}</Text>)}</Tarjeta>)}
      <Tarjeta><Text style={{ fontWeight: '700' }}>Conceptos básicos</Text><Text style={{ lineHeight: 20 }}>• <Text style={{ fontWeight: '700' }}>Reserva:</Text> solicitud para probarte prendas en una sucursal.{'\n'}• <Text style={{ fontWeight: '700' }}>Estados:</Text> PENDIENTE, EN_ATENCION, COMPLETADA o CANCELADA.{'\n'}• <Text style={{ fontWeight: '700' }}>Vestidor virtual:</Text> previsualiza una prenda con la cámara y realidad aumentada.{'\n'}• <Text style={{ fontWeight: '700' }}>Venta digital:</Text> compra desde la app pagada con pasarela electrónica.</Text></Tarjeta>
    </ScrollView>
  );
}
