// Prueba de humo end-to-end de la API (requiere la API en marcha y la BD con datos de demo).
//   node test/smoke.mjs            -> usa http://localhost:3000 y DATABASE_URL del .env
import 'dotenv/config';
import pg from 'pg';

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let fallos = 0, pasos = 0;
const ok = (cond, msg, extra) => { pasos++; if (!cond) { fallos++; console.log('  ✗ FALLO:', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } else console.log('  ✓', msg); };

async function api(ruta, { metodo = 'GET', cuerpo, token, raw } = {}) {
  const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (raw) return r;
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { status: r.status, data: json };
}
const login = async (email, password) => (await api('/auth/login', { metodo: 'POST', cuerpo: { email, password } })).data;
const stock = async (varianteId, almacenId) => (await db.query('SELECT cantidad, reservado FROM stock WHERE variante_id=$1 AND almacen_id=$2', [varianteId, almacenId])).rows[0];
const manana = (h = 10) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.toISOString(); };

console.log('\n== Autenticación (CU-01, CU-02)');
const admin = await login('admin@fashionstore.test', 'Admin123!');
const enc = await login('encargado@fashionstore.test', 'Encargado123!');
const enc2 = await login('encargado2@fashionstore.test', 'Encargado123!');
const caj = await login('cajero@fashionstore.test', 'Cajero123!');
const prov = await login('proveedor@fashionstore.test', 'Proveedor123!');
const cli = await login('cliente@fashionstore.test', 'Cliente123!');
ok([admin, enc, enc2, caj, prov, cli].every((x) => x.token), 'los 6 roles inician sesión');
ok((await api('/auth/login', { metodo: 'POST', cuerpo: { email: 'admin@fashionstore.test', password: 'mala' } })).status === 401, 'contraseña incorrecta -> 401');
const nuevoEmail = `nuevo${Date.now()}@correo.test`;
const reg = await api('/auth/registro', { metodo: 'POST', cuerpo: { nombre: 'José Ñandú Peña', email: nuevoEmail, password: 'secreta1' } });
ok(reg.status === 201 && reg.data.usuario.rol === 'cliente', 'registro crea un cliente', reg.data);
ok(reg.data.usuario.nombre === 'José Ñandú Peña', 'los acentos y la ñ se guardan y devuelven bien (UTF-8)', reg.data.usuario.nombre);
ok((await api('/auth/registro', { metodo: 'POST', cuerpo: { nombre: 'X Y', email: nuevoEmail, password: 'secreta1' } })).status === 409, 'correo duplicado -> 409');
ok((await api('/auth/registro', { metodo: 'POST', cuerpo: { nombre: 'Hack', email: 'h@h.test', password: 'secreta1', rol: 'admin' } })).data.usuario?.rol === 'cliente', 'no se puede autoasignar rol admin');
ok((await api('/usuarios', { token: cli.token })).status === 403, 'un cliente no puede listar usuarios');

console.log('\n== Catálogo y disponibilidad (CU-03)');
const cat = (await api('/productos')).data;
ok(cat.length === 16, '16 productos en el catálogo', cat.length);
ok(cat.some((p) => p.nombre.includes('Clásica') || p.nombre.includes('Elegante')) && cat.some((p) => /[ñóé]/i.test(p.nombre + p.descripcion)), 'el catálogo trae acentos correctos');
const blusas = (await api('/productos?q=blusa')).data;
ok(blusas.length === 2 && blusas.every((p) => p.categoria === 'Blusas'), 'búsqueda por texto');
const conDescuento = blusas.find((p) => p.promocion > 0);
ok(conDescuento && conDescuento.precioVigente < conDescuento.precioMenor, 'las promociones vigentes rebajan el precio', conDescuento?.precioVigente);
ok((await api('/productos?talla=XL')).data.length === 1, 'filtro por talla');
ok((await api('/productos?color=Rosado&categoriaId=1')).data.length === 1, 'filtro por color y categoría');
const disp = (await api('/productos/1/disponibilidad')).data;
ok(disp.length > 0 && new Set(disp.map((d) => d.sucursalId)).size === 4, 'disponibilidad por sucursal (4 sucursales)');
ok((await api('/productos?sucursalId=1&soloDisponibles=1')).data.length > 0, 'filtro solo disponibles en sucursal');
ok((await api('/sucursales')).data.length === 4 && (await api('/temporadas')).data.length === 3, 'sucursales y temporadas públicas');
ok((await api('/proveedores')).status === 400 || (await api('/proveedores')).status === 401, 'proveedores requiere sesión');

console.log('\n== Reservas (CU-04, CU-05)');
const v1 = (await db.query("SELECT id FROM variantes WHERE producto_id=1 AND talla='M' AND color='Negro'")).rows[0].id;
const antes = await stock(v1, 1);
const res = await api('/reservas', { metodo: 'POST', token: cli.token, cuerpo: { sucursalId: 1, fechaHoraEstimada: manana(), items: [{ varianteId: v1, cantidad: 2 }], notas: 'Prueba' } });
ok(res.status === 201 && /^RES-/.test(res.data.codigo) && res.data.estado === 'PENDIENTE', 'reserva creada con código y estado PENDIENTE', res.data);
const desp = await stock(v1, 1);
ok(desp.reservado === antes.reservado + 2 && desp.cantidad === antes.cantidad, 'el stock queda bloqueado (reservado +2, existencias iguales)', [antes, desp]);
ok((await api('/reservas', { metodo: 'POST', token: cli.token, cuerpo: { sucursalId: 1, fechaHoraEstimada: '2020-01-01T10:00:00Z', items: [{ varianteId: v1, cantidad: 1 }] } })).status === 400, 'no permite fechas en el pasado');
// sin stock: la variante con 0 disponible en Cochabamba
const cero = (await db.query(`SELECT s.variante_id FROM stock s WHERE s.almacen_id=5 AND s.cantidad - s.reservado = 0 LIMIT 1`)).rows[0].variante_id;
const sinStock = await api('/reservas', { metodo: 'POST', token: cli.token, cuerpo: { sucursalId: 4, fechaHoraEstimada: manana(11), items: [{ varianteId: cero, cantidad: 1 }] } });
ok(sinStock.status === 409 && sinStock.data.code === 'SIN_STOCK_SUCURSAL' && sinStock.data.faltantes.length === 1, 'sin stock -> 409 con faltantes', sinStock.data);
ok(Array.isArray(sinStock.data.alternativas) && sinStock.data.alternativas.length > 0 && sinStock.data.alternativas[0].distanciaKm !== undefined, 'sugiere sucursales alternativas con distancia', sinStock.data.alternativas?.[0]);
ok((await db.query('SELECT count(*)::int n FROM reservas WHERE cliente_id=(SELECT id FROM usuarios WHERE email=$1) AND sucursal_id=4', ['cliente@fashionstore.test'])).rows[0].n === 0, 'la reserva fallida no deja basura');
const mias = (await api('/reservas/mias', { token: cli.token })).data;
ok(mias.some((r) => r.codigo === res.data.codigo) && mias[0].items[0].producto, 'mis reservas incluye la nueva con sus prendas');
ok((await api(`/reservas/${res.data.id}`, { token: (await login('ana@fashionstore.test', 'Cliente123!')).token })).status === 403, 'otro cliente no puede ver mi reserva');
ok((await api(`/reservas/${res.data.id}`, { token: enc2.token })).status === 403, 'encargado de otra sucursal no puede ver la reserva');
const notifEnc = (await api('/notificaciones', { token: enc.token })).data;
ok(notifEnc.some((n) => n.tipo === 'reserva_nueva' && n.titulo.includes(res.data.codigo)), 'se notifica a la sucursal la nueva reserva');
const lista = (await api('/reservas?estado=PENDIENTE', { token: enc.token })).data;
ok(lista.length > 0 && lista.every((r) => r.sucursalId === 1), 'el encargado solo ve reservas de su sucursal');
const prep = await api(`/reservas/${res.data.id}/preparar`, { metodo: 'POST', token: enc.token });
ok(prep.data.preparadaEn, 'marcar como preparada');
ok((await api(`/reservas/${res.data.id}/confirmar-atencion`, { metodo: 'POST', token: enc.token })).data.estado === 'EN_ATENCION', 'confirmar atención -> EN_ATENCION');
ok((await api('/notificaciones', { token: cli.token })).data.some((n) => n.tipo === 'reserva_en_atencion'), 'el cliente recibe notificaciones del avance');

console.log('\n== Caja y venta presencial (CU-09) + convertir reserva en venta');
ok((await api('/ventas', { metodo: 'POST', token: caj.token, cuerpo: { canal: 'pos', metodoPago: 'efectivo', items: [{ varianteId: v1, cantidad: 1 }] } })).status === 400, 'no se vende sin caja abierta');
const caja = await api('/pos/caja/abrir', { metodo: 'POST', token: caj.token, cuerpo: { montoApertura: 100 } });
ok(caja.status === 201 && caja.data.estado === 'abierta', 'apertura de caja', caja.data);
const v2 = (await db.query("SELECT id FROM variantes WHERE producto_id=5 AND talla='M' AND color='Blanco'")).rows[0].id;
const s2a = await stock(v2, 1);
const vp = await api('/ventas', { metodo: 'POST', token: caj.token, cuerpo: { canal: 'pos', metodoPago: 'efectivo', items: [{ varianteId: v2, cantidad: 2 }] } });
ok(vp.status === 201 && vp.data.venta.estado === 'completada' && vp.data.venta.total === 130 && /^FS-/.test(vp.data.venta.comprobante), 'venta presencial en efectivo', vp.data.venta);
const s2b = await stock(v2, 1);
ok(s2b.cantidad === s2a.cantidad - 2, 'descuenta el inventario automáticamente (CU-10)', [s2a, s2b]);
ok((await api('/ventas', { metodo: 'POST', token: caj.token, cuerpo: { canal: 'pos', metodoPago: 'efectivo', items: [{ varianteId: v2, cantidad: 9999 }] } })).status === 409, 'no vende más de lo que hay (409)');
// cobrar la reserva del cliente: compra 1 de las 2 reservadas
const vr = await api('/ventas', { metodo: 'POST', token: caj.token, cuerpo: { canal: 'pos', metodoPago: 'tarjeta', reservaId: res.data.id, items: [{ varianteId: v1, cantidad: 1 }] } });
ok(vr.status === 201 && vr.data.venta.reservaCodigo === res.data.codigo, 'cobra una reserva', vr.data);
const s1c = await stock(v1, 1);
ok(s1c.cantidad === antes.cantidad - 1 && s1c.reservado === antes.reservado, 'compra 1 de 2: sale 1 y se libera la otra reservada', [antes, s1c]);
ok((await api(`/reservas/${res.data.id}`, { token: enc.token })).data.estado === 'COMPLETADA', 'la reserva pasa a COMPLETADA');
const resumen = (await api('/pos/caja/activa', { token: caj.token })).data;
ok(resumen.efectivoVentas === 130 && resumen.montoEsperado === 230, 'la caja calcula el efectivo esperado (100 + 130)', resumen);
const dev = await api(`/ventas/${vp.data.venta.id}/devolucion`, { metodo: 'POST', token: caj.token, cuerpo: { items: [{ varianteId: v2, cantidad: 1 }], motivo: 'Talla equivocada' } });
ok(dev.status === 201 && dev.data.estado === 'devuelta_parcial', 'devolución parcial', dev.data);
ok((await stock(v2, 1)).cantidad === s2b.cantidad + 1, 'la devolución reintegra el stock');
ok((await api(`/ventas/${vp.data.venta.id}/devolucion`, { metodo: 'POST', token: caj.token, cuerpo: { items: [{ varianteId: v2, cantidad: 5 }] } })).status === 400, 'no se puede devolver más de lo vendido');
const cierre = await api('/pos/caja/cerrar', { metodo: 'POST', token: caj.token, cuerpo: { montoCierre: 160 } });
ok(cierre.data.estado === 'cerrada' && cierre.data.montoEsperado === 165 && cierre.data.diferencia === -5, 'cierre de caja: esperado 165 (100 + 130 - 65 devuelto) y diferencia -5', cierre.data);

console.log('\n== Compra digital y pagos (CU-07, CU-08)');
const cfg = (await api('/config')).data;
ok(cfg.pagos.modo === 'sandbox' && cfg.pagos.pasarelas.length === 3, 'configuración pública de pagos', cfg.pagos);
const v3 = (await db.query("SELECT id FROM variantes WHERE producto_id=3 AND talla='S' AND color='Rosado'")).rows[0].id;
const s3a = await stock(v3, 1);
const cd = await api('/ventas', { metodo: 'POST', token: cli.token, cuerpo: { canal: 'app', sucursalId: 1, metodoPago: 'qr', items: [{ varianteId: v3, cantidad: 1 }] } });
console.log('   ', cd.status, JSON.stringify(cd.data).slice(0,300));
ok(cd.status === 201 && cd.data.venta.estado === 'pendiente_pago' && cd.data.pago.estado === 'PENDIENTE' && cd.data.pago.qrImagen?.startsWith('data:image/png'), 'compra digital queda pendiente de pago con QR', cd.data.pago);
const blusaPrecio = 120 * 0.9;
ok(cd.data.venta.total === blusaPrecio, 'aplica la promoción vigente del 10% (108)', cd.data.venta.total);
const s3b = await stock(v3, 1);
ok(s3b.reservado === s3a.reservado + 1 && s3b.cantidad === s3a.cantidad, 'retiene el stock mientras se espera el pago', [s3a, s3b]);
const rej = await api(`/pagos/sandbox/${cd.data.pago.referencia}/rechazar`, { metodo: 'POST' });
ok(rej.status === 200, 'la pasarela rechaza el pago');
const est = (await api(`/pagos/${cd.data.pago.id}`, { token: cli.token })).data;
ok(est.estado === 'RECHAZADO' && est.motivoRechazo, 'el sistema informa el motivo del rechazo', est);
const re = await api(`/ventas/${cd.data.venta.id}/reintentar-pago`, { metodo: 'POST', token: cli.token, cuerpo: { metodoPago: 'tarjeta', pasarela: 'stripe' } });
ok(re.status === 201 && re.data.pago.estado === 'PENDIENTE' && re.data.pago.id !== cd.data.pago.id, 'permite reintentar con otro método (tarjeta Stripe)', re.data.pago);
const html = await (await api(`/pagos/sandbox/${re.data.pago.referencia}`, { raw: true })).text();
ok(html.includes('Aprobar pago') && html.includes('Stripe (simulada)'), 'página de pago simulada (con acentos y charset correctos)');
const apr = await api(`/pagos/sandbox/${re.data.pago.referencia}/aprobar`, { metodo: 'POST' });
ok(apr.status === 200, 'aprobar pago');
const s3c = await stock(v3, 1);
ok(s3c.cantidad === s3a.cantidad - 1 && s3c.reservado === s3a.reservado, 'al aprobar: sale la prenda del inventario y se libera la retención', [s3a, s3c]);
const vd = (await api(`/ventas/${cd.data.venta.id}`, { token: cli.token })).data;
ok(vd.estado === 'completada' && vd.pago.estado === 'APROBADO', 'la venta queda completada y el pago aprobado');
ok((await api(`/ventas/${cd.data.venta.id}/comprobante`, { token: cli.token })).data.venta.items.length === 1, 'comprobante disponible');
ok((await api(`/ventas/${cd.data.venta.id}`, { token: (await login('ana@fashionstore.test', 'Cliente123!')).token })).status === 403, 'otro cliente no ve mi compra');
const dup = await api(`/pagos/sandbox/${re.data.pago.referencia}/aprobar`, { metodo: 'POST' });
ok(dup.status === 200 && (await stock(v3, 1)).cantidad === s3a.cantidad - 1, 'aprobar dos veces no descuenta dos veces (idempotente)');
// expiración de pago
const cd2 = await api('/ventas', { metodo: 'POST', token: cli.token, cuerpo: { canal: 'web', sucursalId: 1, metodoPago: 'paypal', items: [{ varianteId: v3, cantidad: 1 }] } });
const s3d = await stock(v3, 1);
await db.query('UPDATE pagos SET expira_en = now() - interval \'1 minute\' WHERE venta_id=$1', [cd2.data.venta.id]);
ok(s3d.reservado === s3c.reservado + 1, 'PayPal (simulado) también retiene stock', [s3c, s3d]);
const exp = await api('/pagos/expirar-pendientes', { metodo: 'POST', token: enc.token });
ok(exp.data.canceladas >= 1 && (await api(`/ventas/${cd2.data.venta.id}`, { token: cli.token })).data.estado === 'cancelada', 'un pago que vence cancela la venta', exp.data);
ok((await stock(v3, 1)).reservado === s3c.reservado, 'y libera el stock retenido');
const cod = await api('/ventas', { metodo: 'POST', token: cli.token, cuerpo: { canal: 'app', sucursalId: 1, metodoPago: 'contra_entrega', items: [{ varianteId: v3, cantidad: 1 }], origenOfflineId: 'off-test-1' } });
ok(cod.status === 201 && cod.data.venta.estado === 'pendiente', 'contra entrega: pedido pendiente y stock descontado', cod.data.venta);
const cod2 = await api('/ventas', { metodo: 'POST', token: cli.token, cuerpo: { canal: 'app', sucursalId: 1, metodoPago: 'contra_entrega', items: [{ varianteId: v3, cantidad: 1 }], origenOfflineId: 'off-test-1' } });
ok(cod2.data.venta.id === cod.data.venta.id, 'idempotencia offline: el mismo origenOfflineId no duplica la venta');
ok((await api(`/ventas/${cod.data.venta.id}/entregar`, { metodo: 'POST', token: enc.token })).data.estado === 'entregada', 'marcar entregada');
ok((await api('/ventas', { metodo: 'POST', token: cli.token, cuerpo: { canal: 'pos', metodoPago: 'efectivo', items: [{ varianteId: v3, cantidad: 1 }] } })).status === 403, 'un cliente no puede vender por el POS');

console.log('\n== Concurrencia: dos clientes reservan la última unidad a la vez');
const ultima = (await db.query(`SELECT variante_id FROM stock WHERE almacen_id=3 AND cantidad - reservado >= 1 ORDER BY cantidad - reservado LIMIT 1`)).rows[0].variante_id;
await db.query('UPDATE stock SET cantidad = 1, reservado = 0 WHERE variante_id=$1 AND almacen_id=3', [ultima]);
const otro = await login('luis@fashionstore.test', 'Cliente123!');
const [a, b] = await Promise.all([cli, otro].map((c) => api('/reservas', { metodo: 'POST', token: c.token, cuerpo: { sucursalId: 2, fechaHoraEstimada: manana(15), items: [{ varianteId: ultima, cantidad: 1 }] } })));
ok([a.status, b.status].sort().join() === '201,409', 'solo uno obtiene la última unidad', [a.status, b.status]);
ok((await stock(ultima, 3)).reservado === 1, 'el stock reservado nunca supera lo existente');

console.log('\n== Inventario (CU-10)');
const rec = await api('/inventario/recepciones', { metodo: 'POST', token: enc.token, cuerpo: { proveedorId: 1, almacenId: 1, nota: 'Lote de prueba', items: [{ varianteId: v1, cantidad: 10 }] } });
ok(rec.status === 201, 'recepción de mercadería', rec.data);
ok((await api('/inventario/recepciones', { metodo: 'POST', token: enc.token, cuerpo: { almacenId: 3, items: [{ varianteId: v1, cantidad: 1 }] } })).status === 403, 'un encargado no puede tocar el almacén de otra sucursal');
const mov = (await api(`/inventario/movimientos?varianteId=${v1}&almacenId=1`, { token: enc.token })).data;
ok(mov.length >= 4 && mov.some((m) => m.tipo === 'recepcion') && mov.some((m) => m.tipo === 'venta') && mov.some((m) => m.tipo === 'reserva'), 'el historial registra reserva, venta y recepción (trazabilidad)', mov.map((m) => m.tipo));
ok(mov.every((m) => m.saldoCantidad >= 0), 'los saldos históricos son coherentes');
const tr = await api('/inventario/transferencias', { metodo: 'POST', token: admin.token, cuerpo: { varianteId: v1, origenAlmacenId: 2, destinoAlmacenId: 1, cantidad: 3 } });
ok(tr.status === 201, 'transferencia bodega -> tienda');
ok((await api('/inventario/movimientos', { metodo: 'POST', token: enc.token, cuerpo: { tipo: 'merma', varianteId: v1, almacenId: 1, cantidad: 999999 } })).status === 409, 'una merma no puede dejar stock negativo');
const alertas = (await api('/inventario/alertas', { token: enc.token })).data;
ok(Array.isArray(alertas), 'alertas de inventario crítico', alertas.length);
const inv = (await api('/inventario?sucursalId=1&estado=critico', { token: enc.token })).data;
ok(inv.every((r) => r.estado === 'critico'), 'filtro de inventario por estado');

console.log('\n== Administración (CU-11, CU-12) y proveedor');
const nuevoProd = await api('/productos', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Vestido Prueba Ñandú', descripcion: 'Descripción con acentos: crepé, diseño', arTipo: 'vestido', precioMenor: 199.9, categoriaId: 1, temporadaId: 2,
  imagenes: [{ url: '/assets/prendas/vestido-rojo-foto.jpg' }, { url: '/assets/prendas/vestido-rojo-ar.png', esOverlayAr: true, color: 'Rojo' }],
  variantes: [{ talla: 'S', color: 'Rojo', colorHex: '#b3202f', stock: [{ almacenId: 1, cantidad: 5 }] }, { talla: 'M', color: 'Rojo', colorHex: '#b3202f' }] } });
ok(nuevoProd.status === 201 && nuevoProd.data.variantes.length === 2 && nuevoProd.data.variantes[0].disponible === 5, 'crear producto con variantes e imágenes y stock inicial', nuevoProd.data);
ok(nuevoProd.data.nombre === 'Vestido Prueba Ñandú' && nuevoProd.data.descripcion.includes('crepé'), 'producto con acentos se guarda intacto');
ok((await api('/productos', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'X', precioMenor: -5 } })).status === 400, 'validación de precio negativo');
ok((await api(`/productos/${nuevoProd.data.id}`, { metodo: 'PATCH', token: admin.token, cuerpo: { precioMenor: 210 } })).data.precioMenor === 210, 'editar producto');
ok((await api(`/productos/${nuevoProd.data.id}`, { metodo: 'DELETE', token: admin.token })).data.activo === false, 'baja lógica de producto');
ok((await api(`/productos/${nuevoProd.data.id}`)).status === 404, 'un producto dado de baja ya no es público');
const suc = await api('/sucursales', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Sucursal Prueba', ciudad: 'La Paz', latitud: -16.5, longitud: -68.15 } });
ok(suc.status === 201, 'crear sucursal');
ok((await api(`/almacenes?sucursalId=${suc.data.id}`, { token: admin.token })).data.some((a) => a.esTienda), 'toda sucursal nueva nace con su almacén tienda');
ok((await api('/temporadas', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Invierno Prueba', fechaInicio: '2027-03-01', fechaFin: '2027-08-31' } })).status === 201, 'crear temporada');
ok((await api('/promociones', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Test', porcentaje: 95 } })).status === 400, 'promoción > 90% rechazada por la BD');
const usr = await api('/usuarios', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Cajero Nuevo', email: `cn${Date.now()}@f.test`, password: 'abc12345', rol: 'cajero', sucursalId: 2 } });
ok(usr.status === 201, 'admin crea cajero');
ok((await api('/usuarios', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Sin Sucursal', email: `ss${Date.now()}@f.test`, password: 'abc12345', rol: 'cajero' } })).status === 400, 'un cajero exige sucursal');
const prop = await api('/propuestas', { metodo: 'POST', token: prov.token, cuerpo: { nombre: 'Blusa Lino Ñu', arTipo: 'superior', precioSugerido: 140, temporadaId: 2, categoriaId: 2, variantes: [{ talla: 'M', color: 'Beige', colorHex: '#d8c3a5', cantidad: 12 }] } });
ok(prop.status === 201 && prop.data.estado === 'PENDIENTE', 'proveedor envía una propuesta');
ok((await api('/propuestas', { token: prov.token })).data.every((p) => p.proveedorId === 1), 'el proveedor solo ve sus propuestas');
const aprob = await api(`/propuestas/${prop.data.id}/aprobar`, { metodo: 'POST', token: admin.token, cuerpo: {} });
ok(aprob.status === 201 && aprob.data.productoId, 'admin aprueba: se crea el producto y se recibe el stock', aprob.data);
const pn = (await api(`/productos/${aprob.data.productoId}`)).data;
ok(pn.imagenes.some((i) => i.esOverlayAr) && pn.stockTotal === 0 || pn.imagenes.some((i) => i.esOverlayAr), 'el producto aprobado trae imágenes (incl. overlay AR)');
ok((await api('/propuestas', { metodo: 'POST', token: cli.token, cuerpo: {} })).status === 403, 'un cliente no puede enviar propuestas');

console.log('\n== Reportes e indicadores (CU-14)');
const dash = (await api('/reportes/dashboard', { token: admin.token })).data;
ok(dash.kpis.nVentas > 50 && dash.ventasPorDia.length === 30 && dash.ventasPorSucursal.length >= 4, 'dashboard con KPIs y series', dash.kpis);
ok(dash.topVendidos.length > 0 && dash.topReservados.length > 0 && Array.isArray(dash.inventarioCritico), 'prendas más vendidas/reservadas e inventario crítico');
const dEnc = (await api('/reportes/dashboard', { token: enc.token })).data;
ok(dEnc.sucursalId === 1 && dEnc.ventasPorSucursal.length === 1, 'el encargado solo ve su sucursal');
const csv = await (await api('/reportes/export?tipo=ventas', { token: admin.token, raw: true })).arrayBuffer();
const bytes = new Uint8Array(csv);
ok(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, 'el CSV lleva BOM UTF-8 (Excel muestra bien los acentos)');
ok((await api('/reportes/dashboard', { token: cli.token })).status === 403, 'reportes prohibidos al cliente');

console.log('\n== Liberación automática');
const rv = await api('/reservas', { metodo: 'POST', token: cli.token, cuerpo: { sucursalId: 1, fechaHoraEstimada: manana(12), items: [{ varianteId: v1, cantidad: 1 }] } });
const antesV = await stock(v1, 1);
await db.query("UPDATE reservas SET vence_en = now() - interval '1 hour' WHERE id=$1", [rv.data.id]);
const lib = await api('/reservas/liberar-vencidas', { metodo: 'POST', token: enc.token });
ok(lib.data.liberadas >= 1, 'libera reservas vencidas', lib.data);
ok((await stock(v1, 1)).reservado === antesV.reservado - 1 && (await api(`/reservas/${rv.data.id}`, { token: enc.token })).data.estado === 'CANCELADA', 'la reserva vencida se cancela y devuelve el stock');

console.log('\n== IA (proxy)');
const ia = await api('/ia/recomendaciones', { token: cli.token });
ok([200, 503].includes(ia.status), 'endpoint de recomendaciones responde (200 con FastAPI, 503 sin él)', ia.status);

await db.end();
console.log(`\n${pasos - fallos}/${pasos} comprobaciones correctas` + (fallos ? `  —  ${fallos} FALLOS` : '  ✔'));
process.exit(fallos ? 1 : 0);
