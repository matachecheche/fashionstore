# FashionStore — Plataforma inteligente de comercio electrónico con vestidores virtuales (AR)

Proyecto del **Examen 1 – Sistemas II (UAGRM · FICCT)**. Implementa **todos los casos de uso CU-01 a CU-14** del documento
`FashionStore_Documentacion.pdf`, con el stack exigido: **NestJS** + **Python/FastAPI** + **React** + **React Native (Expo)** + **PostgreSQL/PostgREST**.

| Parte | Tecnología | Carpeta | Puerto |
|---|---|---|---|
| API comercial (catálogo, sucursales, reservas, ventas, pagos, inventario, reportes) | NestJS + TypeORM (SQL parametrizado y transacciones) | `backend-nest/` | 3000 |
| Servicio de IA (recomendador, asistente virtual, soporte AR, reportes Text-to-SQL) | Python + FastAPI | `backend-fastapi/` | 8000 |
| Capa REST de solo lectura sobre la base | PostgREST | (se descarga sola) | 3001 |
| Tienda web + panel del personal | React 18 + Vite + TypeScript | `frontend-web/` | 5173 |
| App móvil con vestidor AR | React Native (Expo SDK 57) | `mobile-app/` | 8081 |
| Base de datos | PostgreSQL 13+ (UTF-8) | `database/` | 5432 |

## Inicio rápido (3 pasos)

Requisitos: **Node.js 18+**, **Python 3.9+**, **PostgreSQL 13+** (con `psql`). Para la app móvil: la app **Expo Go** en tu celular.

```bash
# Windows: doble clic en  iniciar-windows.bat      (o:  python iniciar.py)
# Linux / macOS / Codespaces:
python3 iniciar.py            # o:  ./iniciar-linux.sh
```

`iniciar.py` es **idempotente** (puedes ejecutarlo las veces que quieras): verifica requisitos, crea la base `fashionstore`
**en UTF-8**, carga el esquema y los datos de demostración, genera los `.env`, instala dependencias, descarga PostgREST,
levanta todos los servicios y por último Expo (con el QR para tu celular).

| Opción | Efecto |
|---|---|
| `--sin-movil` | no instala ni arranca Expo (solo web + APIs) |
| `--detener` / `--estado` | apaga / muestra los servicios en segundo plano |
| `--reset-db` | **borra** y recrea la base con los datos de demo |
| `--pg-password X --pg-user Y --pg-host Z --pg-port N` | si tu PostgreSQL no usa `postgres/postgres` |
| `--solo-preparar` | instala y configura sin arrancar |

Alternativa con Docker: `docker compose up --build` (web en `http://localhost:8080`).

### Cuentas de demostración
| Rol | Correo | Contraseña |
|---|---|---|
| Cliente | `cliente@fashionstore.test` | `Cliente123!` |
| Administrador | `admin@fashionstore.test` | `Admin123!` |
| Encargado de sucursal | `encargado@fashionstore.test` | `Encargado123!` |
| Cajero | `cajero@fashionstore.test` | `Cajero123!` |
| Proveedor | `proveedor@fashionstore.test` | `Proveedor123!` |

> Cambia estas contraseñas antes de cualquier uso real.

### App móvil
1. PC y celular en la **misma red WiFi**. 2. `python iniciar.py` (deja el QR en pantalla). 3. Escanéalo con **Expo Go**.
La app llama a la API en `http://IP-DE-TU-PC:3000` (lo escribe `iniciar.py` en `mobile-app/.env`). Si tu firewall bloquea el puerto 3000, permítelo.
En **Codespaces** el lanzador usa `--tunnel` y las URLs públicas de los puertos (deben estar en *Public*).

## Cobertura del documento
Detalle completo en [`docs/COBERTURA-CASOS-DE-USO.md`](docs/COBERTURA-CASOS-DE-USO.md). Resumen:

| CU | Caso de uso | Dónde |
|---|---|---|
| CU-01/02 | Registrar cliente / Iniciar sesión (JWT, 5 roles) | web, app · `auth/` |
| CU-03 | Catálogo con filtros y **disponibilidad por sucursal** | web, app · `catalogo/`, PostgREST `disponibilidad_sucursal` |
| CU-04 | **Reservar** prendas (código, bloqueo de stock, sucursales alternativas, reposición) | web, app · `reservas/` |
| CU-05 | **Recepción de reservas**: preparar, confirmar atención, cobrar, finalizar, cancelar, liberar vencidas | panel · `reservas/` |
| CU-06 | **Vestidor virtual AR** (app: seguimiento del cuerpo + modo manual; web: vista previa) | app, web · `ProbadorAR.tsx`, FastAPI `ar.py` |
| CU-07/08 | Compra web/app y **pago electrónico** (Libélula tarjeta/QR, Stripe, PayPal, contra entrega; reintento) | web, app · `ventas/`, `pagos/` |
| CU-09 | **Venta presencial** en caja (efectivo/tarjeta/QR/transferencia, comprobante, arqueo, modo offline) | panel · POS |
| CU-10 | **Inventario automático** tras reservas, ventas, devoluciones y recepciones + historial | `common/inventario-core.ts` |
| CU-11/12 | Gestión de productos, categorías, tallas, colores, temporadas, colecciones, promociones, sucursales, almacenes, proveedores, usuarios | panel |
| CU-13 | **Recomendaciones** (IA basada en contenido + reglas de negocio) y **asistente virtual** | web, app · FastAPI |
| CU-14 | Reportes: dashboard, prendas más reservadas, inventario crítico, CSV, **reportes con IA (texto/voz)** | panel |
| Parte III | Onboarding, manual por rol, tooltips y asistente | web, app |

## Estructura
```
iniciar.py · iniciar-windows.bat · iniciar-linux.sh · docker-compose.yml · render.yaml
database/        schema.sql (tablas, vistas, roles y RLS de PostgREST) · seed.sql (datos de demo)
backend-nest/    API comercial (src/<modulo>/) · test/smoke.mjs (100 comprobaciones e2e)
backend-fastapi/ IA (app/routers/) · tests/prueba_ia.py
frontend-web/    src/pages/tienda (cliente) · src/pages/panel (personal)
mobile-app/      App.tsx · src/screens/ (incluye ProbadorAR.tsx y seguimientoHtml.ts)
tools/           generar_prendas.py (ilustraciones de prendas para el catálogo y el AR)
docs/            cobertura de casos de uso, API, despliegue, pruebas, guía de Windows
```

## Arquitectura (resumen)
```
 React (web)  ─┐                     ┌─►  NestJS  ──► PostgreSQL ◄── PostgREST (lectura REST + RLS)
 React Native ─┴─ HTTPS/JSON + JWT ──┤        │  (transacciones ACID: stock, reservas, ventas, pagos)
                                     │        └─► FastAPI (IA): recomendador · asistente · AR · Text-to-SQL
                                     └─ pasarelas: Libélula · Stripe · PayPal (o sandbox simulado)
```
* **Stock** (`stock.cantidad` existencias, `stock.reservado` retenido; *disponible = cantidad − reservado*). Toda variación pasa por
  `InventarioCore.mover()`: bloqueo de fila, sin stock negativo, y un movimiento en el historial (trazabilidad).
* **Reserva** retiene stock hasta 2 h después del horario elegido; un temporizador libera las vencidas cada 5 min. **Pago digital** retiene
  el stock 30 min mientras la pasarela confirma.
* **Precios y promociones** siempre se calculan en el servidor.
* **Seguridad**: contraseñas con bcrypt, JWT, roles por endpoint, alcance por sucursal, RLS en PostgREST, Text-to-SQL con rol de solo lectura.

## Pagos
Por defecto `PAGOS_MODO=sandbox`: las pasarelas están **simuladas** (pantalla de pago con QR y botones «aprobar/rechazar») para demos sin cobrar nada.
Para producción define `PAGOS_MODO=produccion` y las claves en `backend-nest/.env` (`STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_ID/SECRET`, `LIBELULA_APPKEY`, webhooks…).
Stripe y PayPal no operan en bolivianos: se cobra en USD con `TIPO_CAMBIO_USD`. **La integración con Libélula debe validarse con la documentación y credenciales
de tu comercio** (endpoint/campos varían por contrato).

## IA con Gemini (opcional)
Sin clave, el asistente y los reportes funcionan con reglas/plantillas. Con `GEMINI_API_KEY` en `backend-fastapi/.env` usan un modelo de lenguaje
(el SQL generado se valida y se ejecuta en una transacción de solo lectura con un rol sin acceso a contraseñas).

## Solución de problemas
* **Acentos o «Ã©» mal vistos**: la causa típica en Windows es cargar el SQL con la codificación WIN1252. `iniciar.py` crea la base en UTF8 y usa
  `PGCLIENTENCODING=UTF8`; si tenías una base vieja, usa `--reset-db`. Los CSV llevan BOM UTF-8 para que Excel muestre bien los acentos.
* **No conecta a PostgreSQL**: enciende el servicio y pasa `--pg-password`. **Puerto ocupado**: `python iniciar.py --detener`.
* **El celular no abre la app**: misma WiFi, permite el puerto 3000/8081 en el firewall, o revisa `mobile-app/.env` (`EXPO_PUBLIC_API_URL`).
* **Vestidor automático no inicia**: necesita internet la 1.ª vez (descarga el modelo de IA de seguimiento); la app cambia sola al **modo manual**.
* Registros de cada servicio en `logs/`.

## Pruebas
```bash
cd backend-nest && node test/smoke.mjs            # 100 comprobaciones e2e de la API (requiere API + BD de demo)
cd backend-fastapi && python tests/prueba_ia.py   # recomendador, asistente, AR y reportes
```
Ver [`docs/PRUEBAS.md`](docs/PRUEBAS.md).
