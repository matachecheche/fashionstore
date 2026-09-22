// Manual de usuario por rol (Parte III del documento). Se muestra en /ayuda y alimenta el onboarding.
export interface Seccion { id: string; titulo: string; intro?: string; tareas: { titulo: string; pasos: string[] }[] }

export const MANUAL: Seccion[] = [
  { id: 'cliente', titulo: 'Cliente (web y app móvil)', intro: 'Todo lo que necesitas para comprar, reservar y probarte prendas.', tareas: [
    { titulo: 'Registrarse e iniciar sesión', pasos: ['Abre la app o el sitio web de FashionStore.', 'Presiona «Crear cuenta» y completa nombre, correo y contraseña.', 'Inicia sesión con el correo y la contraseña registrados.'] },
    { titulo: 'Consultar el catálogo y la disponibilidad', pasos: ['En la pantalla principal explora el catálogo o usa el buscador.', 'Aplica filtros por categoría, talla, color o temporada.', 'Selecciona una prenda para ver el detalle.', 'Elige una sucursal en el selector para ver la disponibilidad específica en esa tienda.'] },
    { titulo: 'Probar una prenda con el vestidor virtual (AR)', pasos: ['Desde el detalle de la prenda presiona «Probar en vestidor virtual» (disponible en la app móvil; en la web hay una vista previa con la cámara).', 'Concede el permiso de cámara si la app lo solicita.', 'Apunta la cámara hacia ti y espera a que el sistema detecte tu posición.', 'Ve la prenda superpuesta en tiempo real; puedes moverla, cambiar su tamaño y su color.', 'Presiona «Capturar» para guardar una imagen o «Agregar a reserva» para continuar.'] },
    { titulo: 'Reservar prendas para probarlas en tienda', pasos: ['Selecciona una o varias prendas indicando talla y color.', 'Presiona «Reservar».', 'Elige la sucursal y un horario aproximado.', 'Confirma: recibirás un código de seguimiento (RES-XXXXXX) y el estado PENDIENTE.', 'Acude a la sucursal dentro del horario indicado. Si no llegas, la reserva vence 2 horas después y las prendas se liberan.'] },
    { titulo: 'Comprar desde la web o la app', pasos: ['Agrega las prendas al carrito (o paga una reserva desde «Mis reservas»).', 'Presiona «Ir a pagar» y elige la sucursal.', 'Elige el método: tarjeta o QR (Libélula), tarjeta internacional (Stripe), PayPal o contra entrega.', 'Confirma y realiza el pago. Si es rechazado podrás reintentar con otro método.', 'Recibe el comprobante digital una vez confirmado el pago.'] },
    { titulo: 'Ver recomendaciones y usar el asistente virtual', pasos: ['En la pantalla principal revisa «Recomendadas para ti».', 'Presiona el ícono del asistente para escribir (o dictar con el micrófono) tu consulta, por ejemplo: «busco un vestido para una fiesta de verano».', 'Revisa las sugerencias y toca la que más te interese.'] },
  ] },
  { id: 'encargado', titulo: 'Encargado de sucursal (web)', intro: 'Recibe y prepara reservas y controla el inventario de su tienda.', tareas: [
    { titulo: 'Gestionar reservas entrantes', pasos: ['En el menú lateral abre «Reservas».', 'Revisa la lista de reservas PENDIENTES de tu sucursal (te llega una notificación por cada nueva).', 'Abre una reserva para ver las prendas solicitadas.', 'Prepara físicamente las prendas y presiona «Marcar como preparada»: el cliente recibe un aviso.', 'Cuando el cliente llegue presiona «Confirmar atención» (pasa a EN_ATENCION).', 'Si compra, usa «Cobrar» para pasar la reserva a venta; si no compra, «Finalizar sin compra» libera el stock.'] },
    { titulo: 'Registrar movimientos de inventario', pasos: ['En el menú abre «Inventario».', 'Elige la pestaña Recepción, Ajustes o Transferencias.', 'Selecciona la prenda y variante (talla/color) e indica la cantidad.', 'Guarda: el saldo se actualiza automáticamente y queda en el historial de movimientos.'] },
  ] },
  { id: 'cajero', titulo: 'Cajero (punto de venta)', intro: 'Registra ventas presenciales y cobra reservas.', tareas: [
    { titulo: 'Registrar una venta presencial', pasos: ['Inicia sesión y abre «Punto de venta».', 'Abre tu caja indicando el monto inicial.', 'Busca la prenda por nombre o código y selecciona talla y color.', 'Agrégala al ticket y ajusta la cantidad.', 'Presiona «Cobrar» y elige el método: efectivo, tarjeta física, QR o transferencia.', 'Emite el comprobante para el cliente.', 'El sistema descuenta el inventario automáticamente, sin que lo actualices a mano.'] },
    { titulo: 'Cobrar una reserva', pasos: ['En el punto de venta escribe el código RES-XXXXXX del cliente y presiona «Buscar reserva».', 'Marca las prendas que el cliente se lleva (las demás vuelven al stock).', 'Cobra normalmente.'] },
    { titulo: 'Cerrar la caja', pasos: ['Presiona «Cerrar caja».', 'Cuenta el efectivo e ingrésalo.', 'El sistema muestra el esperado y la diferencia.'] },
  ] },
  { id: 'admin', titulo: 'Administrador (web)', intro: 'Configura el negocio y consulta los indicadores.', tareas: [
    { titulo: 'Gestionar usuarios', pasos: ['Abre «Usuarios» para crear, editar o desactivar cuentas.', 'Asigna el rol: Administrador, Encargado de sucursal, Cajero o Proveedor.', 'Encargados y cajeros deben tener una sucursal; los proveedores, un proveedor vinculado.'] },
    { titulo: 'Gestionar catálogo, sucursales y proveedores', pasos: ['En «Productos» crea o edita prendas con sus variantes (talla × color), fotos y la imagen con fondo transparente para el vestidor AR.', 'En «Catálogo» administra categorías, temporadas, colecciones y promociones.', 'En «Organización» registra sucursales (cada una nace con su tienda), almacenes y proveedores.', 'En «Propuestas» revisa lo que envían los proveedores y apruébalo para que entre al catálogo con su stock.'] },
    { titulo: 'Consultar reportes e indicadores', pasos: ['Abre el «Dashboard» general.', 'Revisa ventas por sucursal, prendas más reservadas e inventario crítico.', 'Exporta ventas, inventario o reservas a CSV (compatible con Excel).', 'En «Reportes IA» pregunta en lenguaje natural o con la voz.'] },
    { titulo: 'Recomendaciones de uso', pasos: ['Verifica periódicamente el inventario crítico para evitar quiebres de stock.', 'Mantén al día las temporadas: el recomendador de IA usa la temporada vigente.', 'Revisa las reservas vencidas: el sistema las libera solo, pero puedes ejecutar «Liberar vencidas» cuando quieras.'] },
  ] },
  { id: 'proveedor', titulo: 'Proveedor', intro: 'Envía tus productos y su disponibilidad por temporada o colección.', tareas: [
    { titulo: 'Enviar una propuesta de producto', pasos: ['Abre «Mis propuestas» y presiona «Nueva propuesta».', 'Indica nombre, descripción, tipo de prenda, temporada/colección y precio sugerido.', 'Agrega las variantes (talla, color) con la cantidad disponible.', 'Envía: el administrador la revisará y recibirás una notificación con la respuesta.'] },
  ] },
];

export const PASOS_ONBOARDING = [
  { icono: '👗', titulo: 'Bienvenida a FashionStore', texto: 'Explora el catálogo de todas nuestras sucursales y mira en tiempo real qué talla y color hay disponible en cada tienda.' },
  { icono: '📅', titulo: 'Reserva y pruébate en tienda', texto: 'Elige varias prendas, reserva en la sucursal que prefieras y te las tendremos listas. Recibes un código de seguimiento.' },
  { icono: '📱', titulo: 'Vestidor virtual con realidad aumentada', texto: 'Desde la app móvil puedes ver cómo te queda una prenda con la cámara antes de ir a la tienda.' },
  { icono: '✨', titulo: 'Asistente e inteligencia artificial', texto: 'Pregúntale al asistente por prendas para tu ocasión o cómo usar la plataforma. Además verás recomendaciones hechas para ti.' },
];
