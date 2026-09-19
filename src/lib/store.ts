// Etiquetas, formatos y enlaces compartidos entre servidor y cliente.
import type { Database } from '@/lib/supabase/database.types';

type Enums = Database['public']['Enums'];
export type WatchGender = Enums['watch_gender'];
export type WatchMovement = Enums['watch_movement'];
export type OrderStatus = Enums['order_status'];
export type PaymentMethod = Enums['payment_method'];

export const GENDER_LABELS: Record<WatchGender, string> = {
  hombre: 'Hombre',
  mujer: 'Mujer',
  unisex: 'Unisex',
};

export const MOVEMENT_LABELS: Record<WatchMovement, string> = {
  cuarzo: 'Cuarzo',
  automatico: 'Automático',
  mecanico: 'Mecánico',
  solar: 'Solar',
  smartwatch: 'Smartwatch',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pago confirmado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  yape: 'Yape',
  plin: 'Plin',
  transfer: 'Transferencia bancaria',
};

// Etiqueta de la variante por defecto (default de product_variants.label): no se muestra al cliente.
export const DEFAULT_VARIANT_LABEL = 'Única';

export function visibleVariantLabel(label: string | null) {
  return label && label !== DEFAULT_VARIANT_LABEL ? label : null;
}

const PEN = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export function formatPEN(value: number) {
  return PEN.format(value);
}

// 982762602 → "982 762 602"; con código de país 51982762602 → "+51 982 762 602".
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('51') ? digits.slice(2) : digits;
  const grouped = local.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  return digits.length === 11 ? `+51 ${grouped}` : grouped;
}

export function whatsappLink(number: string, message?: string) {
  const digits = number.replace(/\D/g, '');
  const international = digits.length === 9 ? `51${digits}` : digits;
  return `https://wa.me/${international}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
