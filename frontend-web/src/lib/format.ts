const moneda = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 2 });
export const bs = (n: number | null | undefined) => moneda.format(Number(n ?? 0));
export const fechaHora = (d?: string | null) => (d ? new Date(d).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fecha = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-BO', { dateStyle: 'medium' }) : '—');
export const hace = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`; if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};
/** Valor para <input type="datetime-local"> */
export const paraInput = (d: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export const ESTADO_RESERVA: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'warn' }, EN_ATENCION: { texto: 'En atención', clase: 'info' },
  COMPLETADA: { texto: 'Completada', clase: 'ok' }, CANCELADA: { texto: 'Cancelada', clase: 'bad' },
};
export const ESTADO_VENTA: Record<string, { texto: string; clase: string }> = {
  pendiente_pago: { texto: 'Pendiente de pago', clase: 'warn' }, pendiente: { texto: 'Pendiente de entrega', clase: 'warn' }, completada: { texto: 'Completada', clase: 'ok' },
  entregada: { texto: 'Entregada', clase: 'ok' }, cancelada: { texto: 'Cancelada', clase: 'bad' }, devuelta_parcial: { texto: 'Devolución parcial', clase: 'info' }, devuelta: { texto: 'Devuelta', clase: 'bad' },
};
export const ESTADO_PAGO: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'warn' }, APROBADO: { texto: 'Aprobado', clase: 'ok' }, RECHAZADO: { texto: 'Rechazado', clase: 'bad' },
  EXPIRADO: { texto: 'Expirado', clase: 'bad' }, REEMBOLSADO: { texto: 'Reembolsado', clase: 'info' },
};
export const METODO: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', qr: 'QR', transferencia: 'Transferencia', contra_entrega: 'Contra entrega', paypal: 'PayPal' };
export const CANAL: Record<string, string> = { web: 'Web', app: 'App móvil', pos: 'Punto de venta' };
export const ROL: Record<string, string> = { admin: 'Administrador', encargado: 'Encargado de sucursal', cajero: 'Cajero', proveedor: 'Proveedor', cliente: 'Cliente' };
export const TIPO_MOV: Record<string, string> = {
  recepcion: 'Recepción', venta: 'Venta', reserva: 'Reserva', liberacion_reserva: 'Liberación de reserva', retencion_pago: 'Retención por pago', liberacion_pago: 'Liberación por pago',
  devolucion: 'Devolución', ajuste: 'Ajuste', merma: 'Merma', transferencia_salida: 'Transferencia (salida)', transferencia_entrada: 'Transferencia (entrada)', stock_inicial: 'Stock inicial',
};
export const AR_TIPOS = ['superior', 'inferior', 'vestido', 'abrigo', 'calzado', 'accesorio'];
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', '36', '37', '38', '39', '40', 'Único'];
