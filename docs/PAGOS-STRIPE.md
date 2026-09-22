# Pagos reales con Stripe

`backend-nest/.env` ya viene configurado con `PAGOS_MODO=produccion`, así que
el checkout ya NO usa la pasarela simulada: crea sesiones reales de Stripe.
Solo falta poner tus credenciales.

## 1. Cuenta y llave secreta

1. Crea una cuenta gratis en https://dashboard.stripe.com/register (no pide
   datos bancarios para el modo test).
2. Verifica que el switch **Test mode** (arriba a la derecha del dashboard)
   esté activado — así no se cobra dinero real.
3. Ve a **Developers → API keys** y copia la **Secret key** (`sk_test_...`).
4. Pégala en `backend-nest/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```

Con solo esto, al elegir "pagar con tarjeta" ya te redirige a un Checkout de
Stripe real. Puedes pagar con la tarjeta de prueba `4242 4242 4242 4242`,
cualquier fecha futura y cualquier CVC.

## 2. Webhook (para que el pago se confirme solo)

Sin el webhook, Stripe cobra bien pero tu venta se queda en
`pendiente_pago` porque nadie le avisa al backend que el pago se aprobó.

**Mientras desarrollas (más simple):**
```
stripe listen --forward-to localhost:3000/api/pagos/webhook/stripe
```
(instala el Stripe CLI: https://docs.stripe.com/stripe-cli). Ese comando te
imprime un `whsec_...` — cópialo a `STRIPE_WEBHOOK_SECRET` en el `.env` y
reinicia el backend. Déjalo corriendo en una terminal aparte mientras pruebas.

**Con URL pública (Codespaces, demo, etc.):**
1. En Codespaces, pestaña **PORTS** → pon el puerto 3000 en **Public** →
   copia esa URL https y ponla en `PUBLIC_API_URL` del `.env`.
2. En el dashboard de Stripe: **Developers → Webhooks → Add endpoint**,
   URL = `{esa URL}/api/pagos/webhook/stripe`, evento
   `checkout.session.completed` (agrega también `checkout.session.expired`).
3. Copia el **Signing secret** que te muestra a `STRIPE_WEBHOOK_SECRET`.

## 3. URLs de retorno

`PUBLIC_WEB_URL` también debe ser una URL real accesible (no `localhost`) si
quieres probar el checkout desde el celular o mostrárselo a alguien más —
Stripe redirige ahí después de pagar. En Codespaces, haz público también el
puerto del frontend (5173) y ponlo ahí.

## Volver a modo simulación

Si necesitas demostrar rápido sin configurar nada de esto, basta con poner
de nuevo en `backend-nest/.env`:
```
PAGOS_MODO=sandbox
```
