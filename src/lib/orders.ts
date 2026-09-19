import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireEnv } from '@/lib/env';
import type { OrderStatus, PaymentMethod } from '@/lib/store';
import { createServiceClient } from '@/lib/supabase/clients';

// El link de confirmación (/pedido/TM-001001?t=…) lleva un HMAC del código: no expone datos personales
// en la URL y no se puede adivinar el de otro pedido.
function orderLinkToken(code: string) {
  return createHmac('sha256', requireEnv('ORDER_LINK_SECRET')).update(code).digest('base64url').slice(0, 32);
}

export function orderConfirmationPath(code: string) {
  return `/pedido/${encodeURIComponent(code)}?t=${orderLinkToken(code)}`;
}

export function isValidOrderToken(code: string, token: string) {
  const expected = Buffer.from(orderLinkToken(code));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type OrderSummary = {
  code: string;
  status: OrderStatus;
  customerName: string;
  paymentMethod: PaymentMethod;
  createdAt: string;
  paidAt: string | null;
  subtotal: number;
  shippingCost: number;
  total: number;
  items: { productName: string; brandName: string | null; variantLabel: string | null; imagePublicId: string | null; unitPrice: number; quantity: number }[];
  history: { status: OrderStatus; at: string }[];
};

type TrackedOrder = {
  code: string;
  status: OrderStatus;
  customer_name: string;
  payment_method: PaymentMethod;
  created_at: string;
  paid_at: string | null;
  subtotal: number;
  shipping_cost: number;
  total: number;
  items: { product_name: string; brand_name: string | null; variant_label: string | null; image_public_id: string | null; unit_price: number; quantity: number }[];
  history: { status: OrderStatus; at: string }[];
};

function toSummary(order: TrackedOrder): OrderSummary {
  return {
    code: order.code,
    status: order.status,
    customerName: order.customer_name,
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    subtotal: Number(order.subtotal),
    shippingCost: Number(order.shipping_cost),
    total: Number(order.total),
    items: order.items.map((item) => ({
      productName: item.product_name,
      brandName: item.brand_name,
      variantLabel: item.variant_label,
      imagePublicId: item.image_public_id,
      unitPrice: Number(item.unit_price),
      quantity: item.quantity,
    })),
    history: order.history,
  };
}

// Seguimiento público: la base solo responde si el código y el email coinciden.
export async function trackOrder(code: string, email: string): Promise<OrderSummary | null> {
  const { data, error } = await createServiceClient().rpc('track_order', { p_code: code, p_email: email });
  if (error) throw error;
  return data ? toSummary(data as unknown as TrackedOrder) : null;
}

// Confirmación tras el checkout: el token del link reemplaza al email como prueba de acceso.
export async function getOrderByToken(code: string, token: string): Promise<OrderSummary | null> {
  if (!isValidOrderToken(code, token)) return null;
  const supabase = createServiceClient();
  const { data: order, error } = await supabase.from('orders').select('customer_email').eq('code', code).maybeSingle();
  if (error) throw error;
  return order ? trackOrder(code, order.customer_email) : null;
}
