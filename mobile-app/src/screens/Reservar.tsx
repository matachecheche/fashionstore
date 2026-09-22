import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { ApiError, fechaHora, post } from '../api';
import { COLORES as C } from '../config';
import { useAuth, useCarrito, useDatos, useToast } from '../context';
import { encolar, nuevoId } from '../offline';
import { Alerta, Boton, Chip, Icono, s, Tarjeta } from '../ui';

// CU-04 Reservar prendas: sucursal + horario; si no hay stock sugiere sucursales cercanas y fecha de reposicion.
export default function Reservar({ navigation, route }: any) {
  const { items, sucursalId: sucInicial, desdeCarrito } = route.params; const { sucursales, config, recargarPendientes } = useDatos(); const { usuario } = useAuth(); const toast = useToast(); const carrito = useCarrito();
  const [suc, setSuc] = useState<number | null>(sucInicial ?? null); const [notas, setNotas] = useState(''); const [enviando, setEnviando] = useState(false); const [error, setError] = useState(''); const [conflicto, setConflicto] = useState<any>(null); const [hecha, setHecha] = useState<any>(null);
  const dias = useMemo(() => Array.from({ length: (config?.reservas.maxDias ?? 7) + 1 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; }), [config]);
  const [dia, setDia] = useState(0); const horas = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; const [hora, setHora] = useState<number | null>(null);
  const ahora = new Date(); const pasada = (h: number) => dia === 0 && h <= ahora.getHours();
  const nombreDia = (d: Date, i: number) => (i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric' }));

  async function enviar(sucursal = suc) {
    if (!usuario) return navigation.replace('Login');
    if (!sucursal) return setError('Elige la sucursal donde quieres probarte las prendas.'); if (hora === null) return setError('Elige un horario aproximado.');
    const fecha = new Date(dias[dia]); fecha.setHours(hora, 0, 0, 0);
    const cuerpo = { sucursalId: sucursal, fechaHoraEstimada: fecha.toISOString(), items: items.map((i: any) => ({ varianteId: i.varianteId, cantidad: i.cantidad })), notas: notas || undefined };
    setEnviando(true); setError(''); setConflicto(null);
    try { const r = await post('/reservas', cuerpo); setHecha(r); if (desdeCarrito) carrito.vaciar(); toast.ok(`Reserva ${r.codigo} confirmada`); }
    catch (e: any) {
      if (e instanceof ApiError && e.status === 0) { await encolar({ id: nuevoId(), tipo: 'reserva', cuerpo, etiqueta: `Reserva ${fecha.toLocaleDateString('es-BO')}` }); recargarPendientes(); if (desdeCarrito) carrito.vaciar(); toast.info('Sin conexión: la reserva se enviará sola cuando vuelva internet.'); navigation.goBack(); }
      else if (e.status === 409 && e.datos?.code === 'SIN_STOCK_SUCURSAL') setConflicto(e.datos); else setError(e.message);
    } finally { setEnviando(false); }
  }

  if (hecha) return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, alignItems: 'center' }} style={s.pantalla}>
      <Icono name="checkmark-circle" size={80} color={C.ok} /><Text style={s.h1}>¡Reserva confirmada!</Text>
      <Tarjeta style={{ alignItems: 'center', backgroundColor: C.suave, width: '100%' }}><Text style={{ color: C.gris }}>Código de seguimiento</Text><Text style={{ fontSize: 34, fontWeight: '800', color: C.marca, letterSpacing: 3 }}>{hecha.codigo}</Text><Text style={{ color: C.warn, fontWeight: '700' }}>PENDIENTE</Text></Tarjeta>
      <Text style={{ textAlign: 'center', lineHeight: 21 }}>Te esperamos en <Text style={{ fontWeight: '700' }}>{hecha.sucursal}</Text> el <Text style={{ fontWeight: '700' }}>{fechaHora(hecha.fechaHoraEstimada)}</Text>.{'\n'}<Text style={{ color: C.gris, fontSize: 13 }}>{hecha.sucursalDireccion}{'\n'}Las prendas están bloqueadas para ti hasta {fechaHora(hecha.venceEn)}.</Text></Text>
      <Boton t="Ver mis reservas" style={{ width: '100%' }} onPress={() => navigation.replace('Tabs', { screen: 'Reservas' })} /><Boton t="Seguir explorando" tipo="sec" style={{ width: '100%' }} onPress={() => navigation.popToTop()} />
    </ScrollView>);

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Tarjeta><Text style={{ fontWeight: '700' }}>Prendas a reservar</Text>{items.map((i: any) => <Text key={i.varianteId} style={{ color: C.gris }}>• {i.etiqueta} × {i.cantidad}</Text>)}</Tarjeta>
      <Text style={s.label}>SUCURSAL</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{sucursales.map((x) => <Chip key={x.id} t={x.nombre.replace('Sucursal ', '')} act={suc === x.id} onPress={() => setSuc(x.id)} />)}</View>
      {suc && <Text style={{ color: C.gris, fontSize: 12 }}>{sucursales.find((x) => x.id === suc)?.direccion} · {sucursales.find((x) => x.id === suc)?.horario}</Text>}
      <Text style={s.label}>DÍA</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{dias.map((d, i) => <Chip key={i} t={nombreDia(d, i)} act={dia === i} onPress={() => { setDia(i); setHora(null); }} />)}</ScrollView>
      <Text style={s.label}>HORARIO APROXIMADO DE ATENCIÓN</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{horas.map((h) => <View key={h} style={{ opacity: pasada(h) ? 0.35 : 1 }} pointerEvents={pasada(h) ? 'none' : 'auto'}><Chip t={`${String(h).padStart(2, '0')}:00`} act={hora === h} onPress={() => setHora(h)} /></View>)}</View>
      <View style={{ gap: 5 }}><Text style={s.label}>NOTAS (OPCIONAL)</Text><TextInput value={notas} onChangeText={setNotas} maxLength={300} placeholder="Ej.: llegaré con una amiga" style={s.input} /></View>
      {error ? <Alerta tipo="bad" t={error} /> : null}
      {conflicto && <View style={{ gap: 10 }}><Alerta tipo="warn" t={conflicto.message} />
        {conflicto.faltantes.map((f: any) => <Text key={f.varianteId} style={{ color: C.bad, fontSize: 13 }}>✗ {f.producto} ({f.talla}/{f.color}): pediste {f.solicitado}, disponibles {f.disponible}</Text>)}
        {conflicto.reposicionEstimada && <Alerta t={`Fecha estimada de reposición en esa sucursal: ${conflicto.reposicionEstimada}`} />}
        {conflicto.alternativas.map((a: any) => <Tarjeta key={a.sucursalId}><Text style={{ fontWeight: '700' }}>📍 {a.sucursal}</Text><Text style={{ color: C.gris, fontSize: 12 }}>{a.ciudad}{a.distanciaKm != null ? ` · a ${a.distanciaKm} km` : ''} · {a.direccion}</Text><Boton t="Reservar en esta sucursal" peque onPress={() => { setSuc(a.sucursalId); enviar(a.sucursalId); }} /></Tarjeta>)}</View>}
      <Boton t="Confirmar reserva" onPress={() => enviar()} cargando={enviando} />
    </ScrollView>
  );
}
