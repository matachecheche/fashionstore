# Guía completa: FashionStore en la nube gratuita (paso a paso)

Esta guía lleva tu proyecto de "corriendo solo en tu PC" a "accesible desde
cualquier lado con una URL real", sin pagar nada, y deja la app móvil (el
`.apk`) apuntando a esa nube en vez de a tu WiFi de casa — así funciona desde
cualquier red, incluyendo datos móviles.

## 0. Qué vamos a usar y por qué (todo gratis, sin tarjeta)

| Pieza | Dónde vive | Servicio | Costo |
|---|---|---|---|
| Código fuente | GitHub (privado) | GitHub | Gratis |
| Base de datos PostgreSQL | Neon | Neon.tech | Gratis (0.5 GB, se "duerme" si no se usa, no se borra) |
| API comercial (NestJS) | Render | Render.com | Gratis (se duerme tras 15 min sin uso) |
| API de IA (FastAPI) | Render | Render.com | Gratis (opcional) |
| PostgREST (reportes/panel) | Render | Render.com | Gratis (opcional) |
| Tienda web | Render (sitio estático) | Render.com | Gratis |
| App móvil | Tu celular (.apk) | EAS Build | Gratis |

**Importante sobre el plan gratis de Render:** un servicio gratis "se duerme"
si nadie lo usa por 15 minutos, y la primera petición después de eso tarda
entre 30 y 60 segundos en "despertar" (se ve como que la página no carga, pero
solo está arrancando). Para tu demo/entrega, entra a la URL uno o dos minutos
antes para que ya esté despierta.

Si en algún punto se te complica la parte de IA/PostgREST, sáltatela sin
culpa: la tienda, el carrito, los pagos (Stripe/PayPal) y el POS funcionan
completos sin esas dos piezas. Son un extra.

---

## 1. Cuentas que necesitas crear (todas gratis, 5 minutos)

1. **GitHub** — https://github.com/signup (si ya tienes, sáltatelo)
2. **Render** — https://dashboard.render.com/register — regístrate con tu
   cuenta de GitHub (botón "Sign up with GitHub"), así quedan conectadas
   directo, sin pasos extra.
3. **Neon** — https://console.neon.tech/signup — también puedes registrarte
   con GitHub.

---

## 2. Sube el proyecto a GitHub

Tu proyecto todavía no está en git. Desde la carpeta `fashionstore/` (la raíz,
donde está `iniciar.py`):

```powershell
git init
git add .
git commit -m "FashionStore"
```

Nota: el `.gitignore` ya excluye `.env`, `node_modules`, `dist`, etc. — tus
llaves de Stripe/PayPal NO se van a subir a GitHub, quedan solo en tu PC (y
las vas a volver a pegar directo en Render más adelante).

Ahora crea el repositorio en GitHub:

1. Ve a https://github.com/new
2. Nombre: `fashionstore` (o el que quieras)
3. **Déjalo en "Private"** (no es obligatorio, pero tu código no necesita ser
   público)
4. NO marques "Add a README" ni ".gitignore" (ya los tienes)
5. Click "Create repository"
6. GitHub te muestra unos comandos — usa los de "…or push an existing
   repository from the command line", algo así (copia los que a TI te
   muestra, con tu usuario):

```powershell
git remote add origin https://github.com/TU_USUARIO/fashionstore.git
git branch -M main
git push -u origin main
```

Te va a pedir iniciar sesión en GitHub la primera vez (se abre el navegador,
o te pide un token — sigue las instrucciones en pantalla).

---

## 3. Base de datos en Neon

1. En https://console.neon.tech, click **"New Project"**.
2. Nombre: `fashionstore`. Región: la más cercana a Bolivia suele ser
   `US East` o `AWS South America` si aparece — cualquiera funciona, solo
   afecta la latencia un poco.
3. Postgres version: déjalo en el que venga por defecto.
4. Click **"Create Project"**.
5. Te muestra un **Connection string** (empieza con
   `postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require`).
   **Cópialo y guárdalo en un bloc de notas** — lo vas a usar varias veces.

### Cargar el esquema de la base

Necesitas correr los archivos `database/schema.sql` y `database/seed.sql`
contra esa base nueva. Desde tu PC, con `psql` (el mismo que usa
`iniciar.py`, viene con tu instalación de PostgreSQL):

```powershell
cd fashionstore
psql "PEGA_AQUI_TU_CONNECTION_STRING_DE_NEON" -f database/schema.sql
psql "PEGA_AQUI_TU_CONNECTION_STRING_DE_NEON" -f database/seed.sql
```

(`seed.sql` es opcional — son los datos de demostración: productos, las
cuentas de prueba `cliente@fashionstore.test`, etc. Recomendado para la
demo.)

Si te sale un error de permisos con `CREATE ROLE` en algún punto del
`schema.sql`: es porque ese paso crea los roles que usa PostgREST
(`web_anon`, `app_admin`, etc.). Neon SÍ permite `CREATE ROLE` con el usuario
`neondb_owner` que te dan por defecto, así que no debería pasar — pero si
pasa, puedes saltarte esa parte y seguir sin PostgREST (opcional, ver arriba).

---

## 4. Desplegar los servicios en Render (con el Blueprint)

El proyecto ya trae un archivo `render.yaml` en la raíz que describe los 4
servicios de una vez (api, ia, web, postgrest). Esto te ahorra crearlos uno
por uno a mano.

1. En https://dashboard.render.com, click **"New +"** → **"Blueprint"**.
2. Conecta el repositorio `fashionstore` que acabas de subir (si es la
   primera vez, Render te pide autorizar acceso a tus repos de GitHub — dale
   "Only select repositories" y marca `fashionstore`).
3. Render lee el `render.yaml` y te muestra una lista con los 4 servicios que
   va a crear: `fashionstore-api`, `fashionstore-ia`, `fashionstore-web`,
   `fashionstore-postgrest`.
4. Más abajo te va a pedir, uno por uno, los valores marcados como secretos
   en el archivo. Rellénalos así:

| Variable | En qué servicio | Qué poner |
|---|---|---|
| `DATABASE_URL` (api) | fashionstore-api | Tu connection string de Neon completo |
| `DATABASE_URL` (ia) | fashionstore-ia | El mismo connection string de Neon |
| `PGRST_DB_URI` | fashionstore-postgrest | El mismo connection string de Neon otra vez |
| `PGRST_JWT_SECRET` | fashionstore-postgrest | **Déjalo vacío por ahora** — lo completas en el paso 4.1 de abajo |
| `GEMINI_API_KEY` | fashionstore-ia | Tu llave de Gemini si tienes (opcional — déjalo vacío si no) |
| `STRIPE_SECRET_KEY` | fashionstore-api | Tu `sk_test_...` de Stripe |
| `STRIPE_WEBHOOK_SECRET` | fashionstore-api | **Déjalo vacío por ahora** — lo completas en el paso 5 |
| `PAYPAL_CLIENT_ID` | fashionstore-api | Tu Client ID de PayPal |
| `PAYPAL_SECRET` | fashionstore-api | Tu Secret de PayPal |
| `LIBELULA_APPKEY` | fashionstore-api | Vacío si no tienes cuenta comercial Libélula |

5. Click **"Apply"** / **"Create New Resources"**. Render empieza a construir
   los 4 servicios — tarda entre 5 y 15 minutos la primera vez (compila
   NestJS, instala Python, hace el build de React, descarga la imagen de
   PostgREST).

### 4.1 Completar `PGRST_JWT_SECRET` (después del primer deploy)

El `JWT_SECRET` de `fashionstore-api` se generó solo (línea
`generateValue: true`), así que no lo sabes todavía. Necesitas copiarlo a
`fashionstore-postgrest` para que ambos usen el mismo:

1. Entra al servicio **fashionstore-api** en el dashboard de Render →
   pestaña **"Environment"**.
2. Busca `JWT_SECRET`, dale click al ícono de ojo para verlo, y cópialo.
3. Ve al servicio **fashionstore-postgrest** → **"Environment"** → pega ese
   mismo valor en `PGRST_JWT_SECRET` → **"Save Changes"** (esto reinicia ese
   servicio solo, no afecta a los demás).

### 4.2 Verifica las URLs

Como los servicios se llaman exactamente `fashionstore-api`,
`fashionstore-web`, etc., sus URLs son predecibles:

- API: `https://fashionstore-api.onrender.com`
- Web: `https://fashionstore-web.onrender.com`
- IA: `https://fashionstore-ia.onrender.com`
- PostgREST: `https://fashionstore-postgrest.onrender.com`

(Si Render te obligó a agregarle un sufijo al nombre porque ya estaba
ocupado, usa la URL real que te muestra el dashboard de cada servicio, y
ajusta `PUBLIC_API_URL`, `PUBLIC_WEB_URL`, `FASTAPI_URL` y `VITE_API_URL` en
"Environment" de cada servicio para que coincidan.)

Prueba abriendo `https://fashionstore-api.onrender.com/api/health` en el
navegador — debería responder algo como `{"status":"ok"}` (puede tardar hasta
un minuto la primera vez, se está "despertando").

---

## 5. Activar el webhook real de Stripe (ahora sí, con URL pública)

Esta es la parte que antes no se podía hacer bien en `localhost` — ahora que
tienes una URL pública de verdad, es más fácil que antes:

1. En https://dashboard.stripe.com (modo **Test** activado arriba a la
   derecha) → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://fashionstore-api.onrender.com/api/pagos/webhook/stripe`
3. Eventos a escuchar: `checkout.session.completed` y
   `checkout.session.expired`.
4. Click "Add endpoint". Te muestra un **Signing secret** (`whsec_...`) —
   cópialo.
5. En Render → `fashionstore-api` → Environment → pega ese valor en
   `STRIPE_WEBHOOK_SECRET` → Save Changes.

PayPal no necesita nada de esto (funciona por consulta directa, como ya
vimos), y ya debería funcionar solo con `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`
puestos en el paso 4.

---

## 6. Prueba la tienda en la nube

Abre `https://fashionstore-web.onrender.com` en el navegador. Debería verse
igual que en tu PC, pero ahora accesible desde cualquier lugar. Prueba un
checkout con Stripe (tarjeta de prueba `4242 4242 4242 4242`) y con PayPal
(cuenta sandbox) para confirmar que los dos ya no dicen "(simulada)".

---

## 7. El APK apuntando a la nube (para que funcione en cualquier red)

Hasta ahora tu app móvil apuntaba a la IP de tu PC en tu WiFi de casa
(`http://192.168.x.x:3000`) — eso solo funciona si el celular está en la
misma red. Vamos a apuntarla a la API de Render, que funciona desde
cualquier lado (WiFi ajeno, datos móviles, etc.).

1. Abre `mobile-app/.env` (si no existe, créalo copiando `.env.example`).
2. Cambia la línea a:
   ```
   EXPO_PUBLIC_API_URL=https://fashionstore-api.onrender.com
   ```
3. Genera el APK de nuevo con el script que ya tienes:
   ```powershell
   cd mobile-app
   .\build-apk.bat preview
   ```
   (usa el perfil `preview`, no `development` — así el APK queda
   autocontenido, sin necesitar tu PC ni Metro corriendo para nada).
4. Cuando termine, vas a tener el nuevo `.apk` en `mobile-app\builds\`.
   Instálalo en tu celular reemplazando el anterior (o desinstala el viejo
   primero si Android se queja de "conflicto de firma").
5. Pruébalo con el WiFi de tu casa apagado (datos móviles) — si carga el
   catálogo y puedes pagar, confirma que ya no depende de tu PC para nada.

---

## 8. Checklist final

- [ ] `https://fashionstore-api.onrender.com/api/health` responde OK
- [ ] `https://fashionstore-web.onrender.com` carga la tienda
- [ ] Checkout con Stripe ya no dice "(simulada)"
- [ ] Checkout con PayPal ya no dice "(simulada)"
- [ ] El pago con Stripe cambia de "pendiente" a "aprobado" solo (confirma
      que el webhook quedó bien puesto)
- [ ] El APK nuevo (`preview`) carga el catálogo con el WiFi de casa apagado
- [ ] (Opcional) `https://fashionstore-postgrest.onrender.com/catalogo_publico`
      devuelve productos en JSON
- [ ] (Opcional) `https://fashionstore-ia.onrender.com/docs` carga la
      documentación de FastAPI

## Problemas comunes

- **"Application failed to respond" o la página tarda 40 segundos en
  cargar:** normal en el plan gratis, el servicio estaba dormido. Espera.
- **La web carga pero no trae productos:** revisa que `VITE_API_URL` en
  `fashionstore-web` apunte a la URL correcta de `fashionstore-api` (sin
  `/` al final).
- **Error de conexión a la base desde Render:** confirma que copiaste el
  connection string de Neon completo (incluyendo `?sslmode=require`) y que
  `DATABASE_SSL=true` está puesto en el servicio.
- **El APK no conecta:** revisa que `EXPO_PUBLIC_API_URL` no tenga un `/` al
  final y que hayas reconstruido el APK después de cambiar el `.env` (los
  cambios de `EXPO_PUBLIC_API_URL` quedan "horneados" dentro del APK al
  compilarlo, no se leen en vivo como en el backend).
