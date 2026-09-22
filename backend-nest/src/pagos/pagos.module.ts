import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, Injectable, Logger, Module, NotFoundException,
  OnModuleInit, Param, Post, Query, Req, Res, ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as QRCode from 'qrcode';
import { Db, Tx } from '../common/db';
import { Notificador } from '../common/notificador';
import { VentaStock } from '../common/venta-stock';
import { Auth, esStaff, UsuarioJwt } from '../common/auth';
import { envNum, idParam, redondear } from '../common/util';

export type Pasarela = 'libelula' | 'stripe' | 'paypal';
const NOMBRES: Record<Pasarela, string> = { libelula: 'Libélula', stripe: 'Stripe', paypal: 'PayPal' };
const esProduccion = () => process.env.PAGOS_MODO === 'produccion';
const API = () => (process.env.PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const WEB = () => (process.env.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/$/, '');
const TC = () => envNum('TIPO_CAMBIO_USD', 6.96);

@Injectable()
export class PagosService implements OnModuleInit {
  private log = new Logger('Pagos');
  constructor(private db: Db, private notif: Notificador, private stock: VentaStock) {}

  onModuleInit() {
    const tick = () => this.expirarPendientes().then((n) => n && this.log.log(`${n} venta(s) con pago vencido cancelada(s)`)).catch((e) => this.log.error(e.message));
    setTimeout(tick, 20000).unref();
    setInterval(tick, 2 * 60 * 1000).unref();
  }

  config() {
    const real = esProduccion();
    return {
      modo: real ? 'produccion' : 'sandbox', moneda: 'BOB', tipoCambioUsd: TC(), holdMinutos: envNum('PAGO_HOLD_MINUTOS', 30),
      pasarelas: [
        { id: 'libelula', nombre: 'Libélula', metodos: ['tarjeta', 'qr'], internacional: false, real: real && !!process.env.LIBELULA_APPKEY },
        { id: 'stripe', nombre: 'Stripe', metodos: ['tarjeta'], internacional: true, real: real && !!process.env.STRIPE_SECRET_KEY },
        { id: 'paypal', nombre: 'PayPal', metodos: ['paypal'], internacional: true, real: real && !!process.env.PAYPAL_CLIENT_ID },
      ],
    };
  }

  /** Pasarela por defecto segun el metodo elegido por el cliente. */
  resolverPasarela(metodo: string, pedida?: string): Pasarela {
    if (metodo === 'paypal') return 'paypal';
    if (metodo === 'qr') return 'libelula';
    if (pedida === 'stripe') return 'stripe';
    return 'libelula';
  }

  // Crea el registro de pago (dentro de la transaccion de la venta)
  async crear(tx: Tx, o: { ventaId: number; metodo: string; pasarela: Pasarela; monto: number }) {
    const referencia = `FS${o.ventaId}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const expira = new Date(Date.now() + envNum('PAGO_HOLD_MINUTOS', 30) * 60000);
    return tx.one(
      `INSERT INTO pagos (venta_id, metodo, pasarela, estado, monto, referencia, expira_en)
       VALUES ($1,$2,$3,'PENDIENTE',$4,$5,$6) RETURNING *`,
      [o.ventaId, o.metodo, esProduccion() ? o.pasarela : 'sandbox', o.monto, referencia, expira],
    ).then(async (p) => { if (!esProduccion()) await tx.q('UPDATE pagos SET referencia_externa=$2 WHERE id=$1', [p.id, o.pasarela]); return p; });
  }

  // ---------------------------------------------------------------- checkout (fuera de la transaccion de BD)
  async iniciarCheckout(pagoId: number) {
    const p = await this.db.one('SELECT p.*, v.numero_comprobante AS comprobante, u.email, u.nombre AS cliente FROM pagos p JOIN ventas v ON v.id = p.venta_id LEFT JOIN usuarios u ON u.id = v.cliente_id WHERE p.id = $1', [pagoId]);
    let url: string | null = null, qr: string | null = null, ext: string | null = p.referencia_externa;
    try {
      if (p.pasarela === 'sandbox') {
        url = `${API()}/api/pagos/sandbox/${p.referencia}`;
        qr = p.metodo === 'qr' ? url : null;
      } else if (p.pasarela === 'stripe') ({ url, ext } = await this.stripeCrear(p));
      else if (p.pasarela === 'paypal') ({ url, ext } = await this.paypalCrear(p));
      else ({ url, qr, ext } = await this.libelulaCrear(p));
    } catch (e: any) {
      await this.db.q("UPDATE pagos SET estado='RECHAZADO', motivo_rechazo=$2, actualizado_en=now() WHERE id=$1", [pagoId, `No se pudo iniciar el pago: ${e.message}`]);
      throw new ServiceUnavailableException(`No se pudo iniciar el pago con la pasarela: ${e.message}`);
    }
    await this.db.q('UPDATE pagos SET checkout_url=$2, qr_texto=$3, referencia_externa=$4, actualizado_en=now() WHERE id=$1', [pagoId, url, qr, ext]);
    return this.obtener(pagoId);
  }

  private async http(url: string, init: RequestInit) {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const txt = await r.text();
    let json: any = null; try { json = JSON.parse(txt); } catch { /* no json */ }
    if (!r.ok) throw new Error(json?.error?.message || json?.message || json?.error_description || `HTTP ${r.status}`);
    return json;
  }

  private async stripeCrear(p: any) {
    const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new Error('STRIPE_SECRET_KEY no está configurada');
    const centavos = Math.max(Math.round((p.monto / TC()) * 100), 50);   // Stripe no opera en BOB: se cobra en USD
    const f = new URLSearchParams({
      mode: 'payment', client_reference_id: p.referencia,
      success_url: `${WEB()}/pago/${p.referencia}?ok=1`, cancel_url: `${WEB()}/pago/${p.referencia}?cancelado=1`,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(centavos),
      'line_items[0][price_data][product_data][name]': `Pedido ${p.comprobante} - FashionStore`, 'metadata[pago_id]': String(p.id),
    });
    if (p.email) f.set('customer_email', p.email);
    const j = await this.http('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
    return { url: j.url as string, ext: j.id as string };
  }

  private async paypalToken() {
    const base = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_SECRET no están configuradas');
    const j = await this.http(`${base}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    return { base, token: j.access_token as string };
  }

  private async paypalCrear(p: any) {
    const { base, token } = await this.paypalToken();
    const j = await this.http(`${base}/v2/checkout/orders`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: p.referencia, description: `Pedido ${p.comprobante} - FashionStore`, amount: { currency_code: 'USD', value: (p.monto / TC()).toFixed(2) } }],
        payment_source: { paypal: { experience_context: { return_url: `${WEB()}/pago/${p.referencia}?ok=1`, cancel_url: `${WEB()}/pago/${p.referencia}?cancelado=1`, user_action: 'PAY_NOW' } } },
      }),
    });
    const link = (j.links || []).find((l: any) => ['payer-action', 'approve'].includes(l.rel));
    return { url: link?.href as string, ext: j.id as string };
  }

  // Libelula: integracion segun su API REST de "registrar deuda". Verifica endpoint y campos con la documentacion
  // de tu cuenta de comercio (varian por contrato) y define LIBELULA_APPKEY.
  private async libelulaCrear(p: any) {
    if (!process.env.LIBELULA_APPKEY) throw new Error('LIBELULA_APPKEY no está configurada');
    const j = await this.http(`${(process.env.LIBELULA_BASE_URL || 'https://api.libelula.bo').replace(/\/$/, '')}/rest/deuda/registrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appkey: process.env.LIBELULA_APPKEY, email_cliente: p.email || 'cliente@fashionstore.bo', identificador: p.referencia, moneda: 'BOB',
        descripcion: `Pedido ${p.comprobante} - FashionStore`, nombre_cliente: p.cliente || 'Cliente FashionStore',
        callback_url: `${API()}/api/pagos/webhook/libelula?token=${encodeURIComponent(process.env.LIBELULA_WEBHOOK_TOKEN || '')}`,
        url_retorno: `${WEB()}/pago/${p.referencia}`,
        lineas_detalle_deuda: [{ concepto: `Pedido ${p.comprobante}`, cantidad: 1, costo_unitario: p.monto }],
      }),
    });
    if (j?.error && Number(j.error) !== 0) throw new Error(j.mensaje || 'Libélula rechazó el registro de la deuda');
    return { url: (j.url_pasarela_pagos || j.url) as string, qr: (j.qr_simple_url || null) as string | null, ext: String(j.id_transaccion ?? '') };
  }

  // ---------------------------------------------------------------- consulta
  async obtener(id: number) {
    const p = await this.db.one(
      `SELECT p.id, p.venta_id AS "ventaId", p.metodo, p.pasarela, p.estado, p.monto, p.moneda, p.referencia, p.referencia_externa AS "referenciaExterna",
              p.checkout_url AS "checkoutUrl", p.qr_texto AS "qrTexto", p.motivo_rechazo AS "motivoRechazo", p.expira_en AS "expiraEn",
              v.estado AS "estadoVenta", v.numero_comprobante AS comprobante, v.cliente_id AS "clienteId", v.sucursal_id AS "sucursalId"
         FROM pagos p JOIN ventas v ON v.id = p.venta_id WHERE p.id = $1`, [id]);
    if (!p) throw new NotFoundException('Pago no encontrado');
    return this.serializar(p);
  }

  async serializar(p: any) {
    const sandbox = p.pasarela === 'sandbox';
    const gateway: Pasarela | null = sandbox ? p.referenciaExterna : (['libelula', 'stripe', 'paypal'].includes(p.pasarela) ? p.pasarela : null);
    let qrImagen: string | null = null;
    if (p.qrTexto) {
      qrImagen = /^https?:\/\/.+\.(png|jpg|jpeg|gif)/i.test(p.qrTexto) ? p.qrTexto : await QRCode.toDataURL(p.qrTexto, { margin: 1, width: 300 });
    }
    return { ...p, sandbox, pasarelaNombre: gateway ? NOMBRES[gateway] + (sandbox ? ' (simulada)' : '') : p.pasarela, qrImagen };
  }

  /** Estado del pago para que la app haga polling; en pasarelas reales consulta a la pasarela. */
  async estado(u: UsuarioJwt, id: number) {
    let p = await this.obtener(id);
    if (u.rol === 'cliente' && p.clienteId !== u.id) throw new ForbiddenException('Este pago no te pertenece');
    if (esStaff(u) && u.rol !== 'admin' && u.sucursalId && p.sucursalId !== u.sucursalId) throw new ForbiddenException('Este pago pertenece a otra sucursal');
    if (p.estado === 'PENDIENTE' && ['stripe', 'paypal'].includes(p.pasarela)) {
      try { await this.verificarPasarela(p); p = await this.obtener(id); } catch (e: any) { this.log.warn(`verificar ${p.referencia}: ${e.message}`); }
    }
    return p;
  }

  private async verificarPasarela(p: any) {
    if (p.pasarela === 'stripe' && p.referenciaExterna) {
      const j = await this.http(`https://api.stripe.com/v1/checkout/sessions/${p.referenciaExterna}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
      if (j.payment_status === 'paid') await this.aprobar(p.id, j.payment_intent);
      else if (j.status === 'expired') await this.rechazar(p.id, 'La sesión de pago expiró', 'EXPIRADO');
    } else if (p.pasarela === 'paypal' && p.referenciaExterna) {
      const { base, token } = await this.paypalToken();
      const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      let o = await this.http(`${base}/v2/checkout/orders/${p.referenciaExterna}`, { headers: h });
      if (o.status === 'APPROVED') o = await this.http(`${base}/v2/checkout/orders/${p.referenciaExterna}/capture`, { method: 'POST', headers: h, body: '{}' });
      if (o.status === 'COMPLETED') await this.aprobar(p.id, o.id);
    }
  }

  // ---------------------------------------------------------------- CU-08 transiciones
  async aprobar(pagoId: number, refExterna?: string) {
    return this.db.tx(async (tx) => {
      const p = await tx.one('SELECT * FROM pagos WHERE id=$1 FOR UPDATE', [pagoId]);
      if (!p) throw new NotFoundException('Pago no encontrado');
      if (p.estado === 'APROBADO') return { ok: true, yaAprobado: true };
      const v = await tx.one('SELECT * FROM ventas WHERE id=$1 FOR UPDATE', [p.venta_id]);
      if (v.estado === 'completada' || v.estado === 'entregada') throw new ConflictException('La venta ya fue pagada con otro intento');
      const items = await tx.q('SELECT variante_id AS "varianteId", cantidad FROM venta_items WHERE venta_id=$1', [v.id]);
      const conservaHold = v.estado === 'pendiente_pago';
      try {
        await this.stock.consumir(tx, { ventaId: v.id, almacenId: v.almacen_id, reservaId: v.reserva_id, retenido: conservaHold && !v.reserva_id, items });
      } catch (e) {
        if (conservaHold) throw e;
        // El pago llego despues de vencer la retencion y ya no hay stock: hay que reembolsar
        await tx.q("UPDATE pagos SET estado='APROBADO', referencia_externa = COALESCE($2, referencia_externa), actualizado_en=now() WHERE id=$1", [pagoId, refExterna ?? null]);
        await this.notif.aAdmins(tx, 'pago_sin_stock', `Reembolsar pago ${p.referencia}`, `Se aprobó un pago (Bs ${p.monto}) de una venta ya cancelada y sin stock disponible.`, 'venta', v.id);
        return { ok: true, requiereReembolso: true };
      }
      await tx.q("UPDATE pagos SET estado='APROBADO', motivo_rechazo=NULL, referencia_externa = COALESCE($2, referencia_externa), actualizado_en=now() WHERE id=$1", [pagoId, refExterna ?? null]);
      await tx.q("UPDATE ventas SET estado='completada' WHERE id=$1", [v.id]);
      await tx.q("UPDATE pagos SET estado='EXPIRADO', actualizado_en=now() WHERE venta_id=$1 AND id<>$2 AND estado='PENDIENTE'", [v.id, pagoId]);
      if (v.cliente_id) await this.notif.aUsuario(tx, v.cliente_id, 'pago_aprobado', `Pago aprobado: ${v.numero_comprobante}`, `Recibimos tu pago de Bs ${p.monto}. Ya puedes ver tu comprobante en Mis pedidos.`, 'venta', v.id);
      await this.notif.aPersonalSucursal(tx, v.sucursal_id, 'venta_digital', `Nueva compra digital ${v.numero_comprobante}`, `Pago aprobado por Bs ${p.monto}.`, 'venta', v.id);
      return { ok: true };
    });
  }

  async rechazar(pagoId: number, motivo: string, estado: 'RECHAZADO' | 'EXPIRADO' = 'RECHAZADO') {
    return this.db.tx(async (tx) => {
      const p = await tx.one('SELECT * FROM pagos WHERE id=$1 FOR UPDATE', [pagoId]);
      if (!p) throw new NotFoundException('Pago no encontrado');
      if (p.estado !== 'PENDIENTE') return { ok: true, sinCambios: true };
      await tx.q('UPDATE pagos SET estado=$2, motivo_rechazo=$3, actualizado_en=now() WHERE id=$1', [pagoId, estado, motivo]);
      const v = await tx.one('SELECT cliente_id, numero_comprobante FROM ventas WHERE id=$1', [p.venta_id]);
      if (v.cliente_id) await this.notif.aUsuario(tx, v.cliente_id, 'pago_rechazado', `Pago rechazado: ${v.numero_comprobante}`, `${motivo}. Puedes reintentar con otro método de pago.`, 'venta', p.venta_id);
      return { ok: true };
    });
  }

  /** Cancela ventas digitales cuyo pago no se completo a tiempo y libera el stock retenido. */
  async expirarPendientes(): Promise<number> {
    const vencidas = await this.db.q(
      `SELECT v.id FROM ventas v WHERE v.estado = 'pendiente_pago'
          AND COALESCE((SELECT MAX(expira_en) FROM pagos WHERE venta_id = v.id), v.creada_en) < now()`);
    let n = 0;
    for (const { id } of vencidas) {
      await this.db.tx(async (tx) => {
        const v = await tx.one("SELECT * FROM ventas WHERE id=$1 AND estado='pendiente_pago' FOR UPDATE SKIP LOCKED", [id]);
        if (!v) return;
        if (!v.reserva_id) {
          const items = await tx.q('SELECT variante_id AS "varianteId", cantidad FROM venta_items WHERE venta_id=$1', [id]);
          await this.stock.liberarRetencion(tx, { ventaId: id, almacenId: v.almacen_id, items });
        }
        await tx.q("UPDATE pagos SET estado='EXPIRADO', motivo_rechazo = COALESCE(motivo_rechazo, 'Tiempo de pago agotado'), actualizado_en=now() WHERE venta_id=$1 AND estado='PENDIENTE'", [id]);
        await tx.q("UPDATE ventas SET estado='cancelada' WHERE id=$1", [id]);
        if (v.cliente_id) await this.notif.aUsuario(tx, v.cliente_id, 'venta_cancelada', `Compra ${v.numero_comprobante} cancelada`, 'No recibimos el pago a tiempo y liberamos las prendas.', 'venta', id);
        n++;
      });
    }
    return n;
  }

  // ---------------------------------------------------------------- webhooks
  async webhookStripe(raw: Buffer | undefined, firma?: string) {
    const secreto = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secreto || !raw || !firma) throw new BadRequestException('Webhook de Stripe no configurado');
    const partes = Object.fromEntries(firma.split(',').map((x) => x.split('=') as [string, string]));
    const esperado = createHmac('sha256', secreto).update(`${partes.t}.${raw.toString('utf8')}`).digest('hex');
    const a = Buffer.from(esperado), b = Buffer.from(partes.v1 || '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Firma inválida');
    const ev = JSON.parse(raw.toString('utf8'));
    if (ev.type === 'checkout.session.completed' && ev.data?.object?.payment_status === 'paid') {
      const p = await this.db.one('SELECT id FROM pagos WHERE referencia=$1', [ev.data.object.client_reference_id]);
      if (p) await this.aprobar(p.id, ev.data.object.payment_intent);
    } else if (ev.type === 'checkout.session.expired') {
      const p = await this.db.one('SELECT id FROM pagos WHERE referencia=$1', [ev.data.object.client_reference_id]);
      if (p) await this.rechazar(p.id, 'La sesión de pago expiró', 'EXPIRADO');
    }
    return { recibido: true };
  }

  async webhookLibelula(token: string, cuerpo: any) {
    const esperado = process.env.LIBELULA_WEBHOOK_TOKEN || '';
    if (!esperado || token !== esperado) throw new ForbiddenException('Token inválido');
    const ref = cuerpo?.identificador || cuerpo?.referencia || cuerpo?.transaction_id;
    const p = ref ? await this.db.one('SELECT id FROM pagos WHERE referencia=$1', [ref]) : null;
    if (!p) throw new NotFoundException('Pago no encontrado');
    const pagado = cuerpo?.pagado === true || cuerpo?.estado === 'PAGADO' || cuerpo?.estado === 'APROBADO' || cuerpo?.error === 0;
    if (pagado) await this.aprobar(p.id, cuerpo?.id_transaccion ? String(cuerpo.id_transaccion) : undefined);
    else await this.rechazar(p.id, cuerpo?.mensaje || 'Pago rechazado por la pasarela');
    return { recibido: true };
  }

  // ---------------------------------------------------------------- sandbox (pasarela simulada para demo/examen)
  async porReferencia(ref: string) {
    const p = await this.db.one('SELECT id FROM pagos WHERE referencia=$1', [ref]);
    if (!p) throw new NotFoundException('Referencia de pago inexistente');
    return this.obtener(p.id);
  }
  soloSandbox() { if (esProduccion()) throw new ForbiddenException('La pasarela simulada está deshabilitada en modo producción'); }
}

const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

@Controller('pagos')
export class PagosController {
  constructor(private s: PagosService) {}

  @Get('config') config() { return this.s.config(); }
  @Auth('admin', 'encargado') @Post('expirar-pendientes') @HttpCode(200) async expirar() { return { canceladas: await this.s.expirarPendientes() }; }
  // Stripe/PayPal regresan al sitio con la referencia (no con el id numerico)
  @Auth() @Get('ref/:ref') async porRef(@Param('ref') ref: string, @Req() r: any) { const p = await this.s.porReferencia(ref); return this.s.estado(r.user, p.id); }
  @Auth() @Get(':id') estado(@Param('id') id: string, @Req() r: any) { return this.s.estado(r.user, idParam(id)); }

  @Post('webhook/stripe') @HttpCode(200)
  stripe(@Req() req: any) { return this.s.webhookStripe(req.rawBody, req.headers['stripe-signature']); }
  @Post('webhook/libelula') @HttpCode(200)
  libelula(@Query('token') t: string, @Body() b: any) { return this.s.webhookLibelula(t, b); }

  // --- Pasarela simulada: la referencia es aleatoria e impredecible, y solo existe fuera de modo produccion
  @Get('sandbox/:ref') @Header('Content-Type', 'text/html; charset=utf-8')
  async pagina(@Param('ref') ref: string, @Res() res: any) {
    this.s.soloSandbox();
    const p = await this.s.porReferencia(ref);
    const cerrado = p.estado !== 'PENDIENTE';
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pago simulado · FashionStore</title>
<style>body{font-family:system-ui,Segoe UI,Arial;background:#f6f1f3;margin:0;display:grid;place-items:center;min-height:100vh}
.c{background:#fff;border-radius:16px;box-shadow:0 8px 30px #0002;padding:28px;max-width:380px;width:92%;text-align:center}
h1{font-size:20px;margin:0 0 4px;color:#7a2f45}.m{font-size:34px;font-weight:700;margin:14px 0}.t{color:#666;font-size:14px}
button{border:0;border-radius:10px;padding:13px 18px;font-size:16px;cursor:pointer;width:100%;margin-top:10px}
.ok{background:#1e8e4f;color:#fff}.no{background:#fff;color:#b3261e;border:1px solid #b3261e}.b{display:inline-block;background:#f1e3e8;color:#7a2f45;padding:3px 10px;border-radius:99px;font-size:12px}
#r{margin-top:14px;font-weight:600}</style></head><body><div class="c">
<span class="b">${html(p.pasarelaNombre)}</span><h1>Pago de prueba</h1><div class="t">Pedido ${html(p.comprobante)}</div>
<div class="m">Bs ${Number(p.monto).toFixed(2)}</div>
${p.qrImagen ? `<img src="${p.qrImagen}" width="200" height="200" alt="QR">` : ''}
${cerrado ? `<div id="r">Este pago ya está ${html(p.estado)}.</div>` : `
<button class="ok" onclick="go('aprobar')">Aprobar pago</button><button class="no" onclick="go('rechazar')">Rechazar pago</button>
<div class="t" style="margin-top:12px">Simulación: no se realiza ningún cobro real.</div><div id="r"></div>`}
</div><script>async function go(a){const r=await fetch('/api/pagos/sandbox/${html(ref)}/'+a,{method:'POST'});const j=await r.json();
document.getElementById('r').textContent=r.ok?(a==='aprobar'?'✅ Pago aprobado. Ya puedes volver a la app.':'❌ Pago rechazado.'):(j.message||'Error');
document.querySelectorAll('button').forEach(b=>b.disabled=true)}</script></body></html>`);
  }
  @Post('sandbox/:ref/aprobar') @HttpCode(200)
  async sbAprobar(@Param('ref') ref: string) { this.s.soloSandbox(); const p = await this.s.porReferencia(ref); return this.s.aprobar(p.id, 'SANDBOX-' + ref); }
  @Post('sandbox/:ref/rechazar') @HttpCode(200)
  async sbRechazar(@Param('ref') ref: string) { this.s.soloSandbox(); const p = await this.s.porReferencia(ref); return this.s.rechazar(p.id, 'Pago rechazado en la pasarela de prueba'); }
}

@Module({ providers: [PagosService], controllers: [PagosController], exports: [PagosService] })
export class PagosModule {}
