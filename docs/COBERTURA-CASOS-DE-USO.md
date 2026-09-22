# Cobertura del documento «FashionStore_Documentacion.pdf»

Cada requisito del documento, dónde está implementado y cómo se verifica. `test:smoke` = `backend-nest/test/smoke.mjs`.

## Actores
| Actor | Rol en el sistema | Qué puede hacer |
|---|---|---|
| Cliente | `cliente` | catálogo, reservas, vestidor, compras, recomendaciones, asistente |
| Administrador | `admin` | todo el panel: usuarios, catálogo, sucursales, proveedores, promociones, inventario, reportes |
| Encargado de sucursal | `encargado` | reservas de su sucursal, inventario local, POS, reportes de su tienda |
| Cajero | `cajero` | POS (caja, ventas presenciales), cobro de reservas |
| Proveedor | `proveedor` | envía propuestas de productos y disponibilidad por temporada/colección |
| Sistema de pagos | externo | Libélula / Stripe / PayPal (o sandbox), webhooks |
| Servicio de IA | externo | microservicio FastAPI |

## Casos de uso
| CU | Requisito del documento | Implementación | Verificación |
|---|---|---|---|
| CU-01 Registrar cliente | registro con nombre, correo, contraseña | `POST /auth/registro` (siempre crea *cliente*), web `/registro`, app `Registro` | smoke: registro, correo duplicado, no se puede autoasignar rol |
| CU-02 Iniciar sesión | los 4 roles + proveedor | `POST /auth/login` (JWT 7 d, cuenta desactivada bloquea) | smoke: 6 roles, contraseña incorrecta |
| CU-03 Catálogo y disponibilidad por sucursal | filtros por categoría, talla, color, temporada; selector de sucursal | `GET /productos`, `/productos/:id/disponibilidad`, vista PostgREST `disponibilidad_sucursal`; web `Catalogo`/`Producto`; app `Catalogo`/`Producto` | smoke: filtros, 4 sucursales |
| CU-04 Reservar prendas | varias prendas, sucursal y horario, validación, notificación a la sucursal, **código de seguimiento**, estado PENDIENTE, **bloqueo temporal de stock**; alterno: sucursales cercanas con stock o fecha de reposición | `POST /reservas`; `ReservarDialog` (web) y `Reservar` (app); respuesta 409 con `alternativas` (distancia Haversine) y `reposicionEstimada` | smoke: bloqueo de stock, sin stock → alternativas, concurrencia (2 clientes, 1 unidad) |
| CU-05 Recepción de reservas | lista PENDIENTES por sucursal, preparar, confirmar atención → EN_ATENCION | `POST /reservas/:id/preparar · confirmar-atencion · finalizar · cancelar`; panel `Reservas`; notificaciones | smoke: flujo completo + aislamiento por sucursal |
| CU-06 Vestidor virtual AR | cámara, detección del cuerpo (body tracking), la app pide a IA/AR las características visuales (color, tipo, textura), superposición en tiempo real, captura, «agregar a reserva»; alterno: vista con fotos si no hay AR | app: `ProbadorAR.tsx` (seguimiento con MediaPipe Pose en WebView + modo manual con gestos + captura/guardar/compartir); FastAPI `GET /api/ar/prenda/:id`; web: `Vestidor.tsx` (vista previa) | pruebas de la API AR; página de seguimiento probada con landmarks simulados en Chromium |
| CU-07 Comprar desde web/app | resumen, método (tarjeta, QR Libélula, Stripe/PayPal), pago, comprobante, inventario | `POST /ventas`, `Checkout`, `Pago`, `Comprobante` | smoke: pendiente de pago, retención, aprobación, comprobante |
| CU-08 Procesar pago electrónico | pago rechazado → informa el motivo y permite reintentar con otro método | `pagos/` (adaptadores Libélula/Stripe/PayPal, sandbox, webhooks, expiración), `POST /ventas/:id/reintentar-pago` | smoke: rechazo, reintento, idempotencia, expiración |
| CU-09 Venta presencial | cajero: buscar prenda, talla/color/cantidad, método (efectivo, tarjeta física, QR), comprobante, descuento automático de inventario | panel `POS` (caja, arqueo, cambio, modo offline) | smoke: caja, venta, cobro de reserva, devolución, cierre |
| CU-10 Actualizar inventario | por venta, reserva, devolución y recepción; historial | `InventarioCore`, `VentaStock`, `inventario/` (recepciones, ajustes, mermas, transferencias, alertas) | smoke: saldos coherentes, no permite stock negativo |
| CU-11 Gestionar productos, categorías, tallas, colores, temporadas | CRUD | `catalogo/`, `maestros/`; panel `Productos`, `Catálogo` | smoke: crear/editar/baja, validaciones |
| CU-12 Gestionar sucursales y proveedores | CRUD | `maestros/`, `usuarios/`; panel `Sucursales y proveedores`, `Usuarios` | smoke: sucursal con su almacén tienda |
| CU-13 Recomendaciones | filtrado basado en contenido + reglas (disponibilidad, temporada) | FastAPI `recomendador.py`; «Recomendadas para ti», «Combina con»; asistente virtual (`asistente.py`) | `prueba_ia.py` |
| CU-14 Reportes de ventas e inventario | indicadores por sucursal, prendas más reservadas, inventario crítico | `reportes/`; panel `Dashboard` (+CSV) y `Reportes con IA` (texto y voz) | smoke: dashboard, CSV con BOM |

## Objetivos específicos (Parte II §1.4)
1. Requisitos → `docs/` + este documento. 2. Clientes, usuarios, empleados, proveedores, sucursales → panel. 3. Catálogo (categorías, tallas, colores, temporadas, colecciones). 4. Disponibilidad por sucursal.
5. Reserva de varias prendas. 6. Recepción y atención de reservas. 7. Vestidor AR en la app. 8. Compras web y móvil. 9. Pagos presenciales y digitales.
10. Inventario automático. 11. IA (recomendador y asistente). 12. NestJS, FastAPI, React, React Native, PostgreSQL/PostgREST.

## Parte III — mecanismo de aprendizaje
* **Onboarding** de 4 pantallas (web y app) · **Manual por rol** (`/ayuda`, `/panel/ayuda`, app «Ayuda») · **Tooltips** contextuales · **Asistente virtual** que responde cómo usar cada función.

## Modelo de datos (Parte II §4.4)
Tablas del documento (`usuarios, sucursales, productos, variantes_producto→variantes, inventario→stock, reservas, detalle_reserva, ventas, pagos, proveedores, temporadas`)
más: `almacenes, categorias, colecciones, producto_imagenes, promociones, movimientos_inventario, recepciones, cajas, venta_items, devoluciones, propuestas_producto,
interacciones, recomendaciones_ia, conversaciones_ia, notificaciones, auditoria`. Claves foráneas `ON DELETE RESTRICT` en lo crítico, `UNIQUE (producto, talla, color)`, 3FN,
`CHECK (reservado <= cantidad)`. Diferencia con el documento: `Inventario` está por *almacén* (cada sucursal tiene un almacén «tienda» que vende y reserva, y puede tener bodegas).
