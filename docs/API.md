# API comercial (NestJS) — `http://localhost:3000/api`

Autenticación: `Authorization: Bearer <JWT>` (login en `POST /auth/login`). Roles: `admin`, `encargado`, `cajero`, `proveedor`, `cliente`.
Errores: `{ statusCode, message }` (409 de stock: `{ code: 'SIN_STOCK' | 'SIN_STOCK_SUCURSAL', faltantes, alternativas, reposicionEstimada }`).

| Área | Endpoints (público = sin token) |
|---|---|
| Sistema | `GET /health` · `GET /config` (público) |
| Auth | `POST /auth/registro` · `POST /auth/login` · `GET/PATCH /auth/me` · `POST /auth/me/password` |
| Maestros | `GET /categorias · /temporadas · /colecciones?temporadaId · /sucursales · /promociones?vigentes=1` (público) · `POST/PATCH/DELETE` (admin) · `/almacenes` y `/proveedores` (staff) |
| Catálogo | `GET /productos?q&categoriaId&temporadaId&coleccionId&talla&color&min&max&sucursalId&soloDisponibles&temporadaActual&orden&limite` · `GET /productos/filtros` · `GET /productos/:id` · `GET /productos/:id/disponibilidad` · `POST/PATCH/DELETE /productos` (admin) · `POST /productos/:id/variantes` · `PATCH /variantes/:id` · `POST /archivos` (subir imagen) |
| Reservas | `POST /reservas` · `GET /reservas/mias` · `GET /reservas?estado&sucursalId&q` (staff) · `GET /reservas/codigo/:codigo` · `POST /reservas/:id/{cancelar,preparar,confirmar-atencion,finalizar}` · `POST /reservas/liberar-vencidas` |
| Ventas | `POST /ventas` (canal `web`/`app`/`pos`; con `reservaId` o `items`) · `GET /ventas/mias` · `GET /ventas` (staff) · `GET /ventas/:id[/comprobante]` · `POST /ventas/:id/{reintentar-pago,entregar,devolucion}` · `POST /ventas/sincronizar` (offline) |
| Pagos | `GET /pagos/config` · `GET /pagos/ref/:referencia` · `GET /pagos/:id` · `POST /pagos/webhook/{stripe,libelula}` · sandbox: `GET/POST /pagos/sandbox/:ref[/aprobar|rechazar]` |
| POS | `GET /pos/caja/activa` · `POST /pos/caja/{abrir,cerrar}` · `GET /pos/cajas` |
| Inventario | `GET /inventario · /inventario/alertas · /inventario/movimientos` · `POST /inventario/{movimientos,recepciones,transferencias}` · `PATCH /inventario/stock` |
| Reportes | `GET /reportes/dashboard?desde&hasta&sucursalId` · `GET /reportes/export?tipo=ventas|inventario|reservas` (CSV) |
| Usuarios | `GET/POST/PATCH /usuarios` (admin) |
| Proveedores | `GET/POST /propuestas` · `POST /propuestas/:id/{aprobar,rechazar}` (admin) |
| Notificaciones | `GET /notificaciones · /notificaciones/contador` · `POST /notificaciones/:id/leer · /notificaciones/leer-todas` |
| IA (proxy a FastAPI) | `GET /ia/recomendaciones?productoId&sucursalId` · `POST /ia/chat` · `GET /ia/ar/:productoId?color` · `POST /ia/reportes` (staff) · `POST /ia/interacciones` |

FastAPI (`:8000`, documentación interactiva en `/docs`): `POST /api/recomendaciones`, `POST /api/asistente/chat`, `GET /api/ar/prenda/{id}`, `POST /api/reportes/ask`.
PostgREST (`:3001`): `catalogo_publico`, `disponibilidad_sucursal`, `categorias`, `temporadas`, `colecciones`, `sucursales` (público); `inventario_critico` y tablas con RLS (con JWT).
