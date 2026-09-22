// Manual del cliente (Parte III del documento): tambien lo consulta el asistente virtual.
export const MANUAL_CLIENTE = [
  { titulo: 'Registrarse e iniciar sesión', pasos: ['Abre la app de FashionStore.', 'Presiona «Crear cuenta» y completa nombre, correo y contraseña.', 'Inicia sesión con el correo y la contraseña registrados.'] },
  { titulo: 'Consultar el catálogo y la disponibilidad', pasos: ['En Inicio explora el catálogo o usa el buscador.', 'Aplica filtros por categoría, talla, color o temporada.', 'Selecciona una prenda para ver el detalle.', 'Elige una sucursal para ver la disponibilidad específica en esa tienda.'] },
  { titulo: 'Probar una prenda con el vestidor virtual (AR)', pasos: ['Desde el detalle de la prenda presiona «Probar en vestidor virtual».', 'Concede el permiso de cámara.', 'Apunta la cámara hacia ti: con el seguimiento automático la prenda se ajusta a tus hombros o caderas.', 'Si el seguimiento no está disponible, usa el modo manual: arrastra la prenda y pellizca para cambiar su tamaño.', 'Cambia de color, presiona «Capturar» para guardar la foto o «Agregar a reserva» para continuar.'] },
  { titulo: 'Reservar prendas para probarlas en tienda', pasos: ['Selecciona una o varias prendas indicando talla y color.', 'Presiona «Reservar».', 'Elige la sucursal y un horario aproximado.', 'Confirma: recibirás un código de seguimiento (RES-XXXXXX) y el estado PENDIENTE.', 'Acude a la sucursal dentro del horario indicado; la reserva vence 2 horas después.'] },
  { titulo: 'Comprar desde la app', pasos: ['Agrega las prendas al carrito (o paga una reserva desde «Reservas»).', 'Presiona «Ir a pagar» y elige la sucursal.', 'Elige el método: tarjeta o QR (Libélula), tarjeta internacional (Stripe), PayPal o pagar al retirar.', 'Confirma el pago. Si es rechazado podrás reintentar con otro método.', 'Recibe el comprobante digital en «Mis pedidos».'] },
  { titulo: 'Recomendaciones y asistente virtual', pasos: ['En Inicio revisa «Recomendadas para ti».', 'Abre la pestaña Asistente y escribe (o dicta con el micrófono del teclado) tu consulta.', 'Ejemplo: «busco un vestido para una fiesta de verano».'] },
  { titulo: 'Sin conexión', pasos: ['Puedes seguir viendo el catálogo que ya cargaste.', 'Las reservas y los pedidos «pagar al retirar» hechos sin internet se guardan y se envían solos al volver la conexión.'] },
];
export const ONBOARDING = [
  { icono: '👗', t: 'Bienvenida a FashionStore', d: 'Explora el catálogo de todas las sucursales y mira qué talla y color hay disponible en cada tienda.' },
  { icono: '📅', t: 'Reserva y pruébate', d: 'Elige varias prendas, reserva en tu sucursal y te las tendremos listas. Recibes un código de seguimiento.' },
  { icono: '📱', t: 'Vestidor virtual (AR)', d: 'Con la cámara del celular ves cómo te queda una prenda antes de ir a la tienda, con seguimiento del cuerpo.' },
  { icono: '✨', t: 'Asistente e IA', d: 'Pregúntale al asistente por prendas para tu ocasión o cómo usar la app. Verás recomendaciones hechas para ti.' },
];
