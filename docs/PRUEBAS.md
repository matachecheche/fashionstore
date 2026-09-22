# Pruebas realizadas

| Qué | Cómo | Resultado |
|---|---|---|
| API comercial (reglas de negocio) | `node backend-nest/test/smoke.mjs` — 100 comprobaciones: auth, filtros, reservas, concurrencia, POS, pagos, devoluciones, inventario, propuestas, reportes, UTF-8 | 100/100 |
| Servicio de IA | `python backend-fastapi/tests/prueba_ia.py` — recomendador, asistente, AR, Text-to-SQL y rechazo de SQL peligroso | correcto |
| Web (navegador real) | Chromium headless: registro/login de 5 roles, reserva, preparar reserva, POS, compra con pasarela simulada, 10 páginas del panel, asistente | sin errores de JavaScript |
| PostgREST | roles anónimo / cliente / admin, RLS, escritura denegada | correcto |
| Instalación desde cero | `iniciar.py --reset-db` en una carpeta limpia y segunda ejecución (idempotencia) | correcto |
| App móvil | `tsc --noEmit` y `expo export --platform android` (bundle Hermes) | compila |
| Seguimiento AR | página del visor en Chromium con cámara falsa y puntos del cuerpo simulados | prenda ubicada/escalada según hombros y caderas |

## Lo que NO se pudo probar aquí (pruébalo tú)
* La app en un **celular real** con Expo Go (cámara, gestos, guardar en galería, WebView). El sandbox no tiene dispositivo.
* El **modelo MediaPipe** de seguimiento (se descarga de internet la primera vez) — si falla, la app cambia sola al modo manual.
* Pasarelas **reales** (Libélula/Stripe/PayPal): requieren tus credenciales; el modo sandbox sí está probado.
* Instalación en **Windows** (el lanzador está escrito para funcionar allí, pero se probó en Linux).
