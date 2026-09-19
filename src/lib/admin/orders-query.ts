import 'server-only';

import type { OrderStatus, PaymentMethod } from '@/lib/store';
import type { createSessionClient } from '@/lib/supabase/clients';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

const STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'];
const PAYMENTS: PaymentMethod[] = ['yape', 'plin', 'transfer'];
const SORTS = ['recientes', 'antiguos', 'total'] as const;

export type OrderFilters = {
  status?: OrderStatus;
  q?: string;
  payment?: PaymentMethod;
  from?: string; // AAAA-MM-DD, hora de Lima
  to?: string;
  sort: (typeof SORTS)[number];
  page: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : undefined);

export function orderFiltersFromParams(params: Record<string, string | string[] | undefined>): OrderFilters {
  const status = single(params.estado) as OrderStatus | undefined;
  const payment = single(params.pago) as PaymentMethod | undefined;
  const from = single(params.desde);
  const to = single(params.hasta);
  const sort = single(params.orden) as OrderFilters['sort'] | undefined;
  return {
    status: status && STATUSES.includes(status) ? status : undefined,
    q: single(params.q) || undefined,
    payment: payment && PAYMENTS.includes(payment) ? payment : undefined,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    sort: sort && SORTS.includes(sort) ? sort : 'recientes',
    page: Math.max(1, Number(single(params.pagina)) || 1),
  };
}

export function ordersQueryString(filters: Partial<OrderFilters>) {
  const params = new URLSearchParams();
  if (filters.status) params.set('estado', filters.status);
  if (filters.q) params.set('q', filters.q);
  if (filters.payment) params.set('pago', filters.payment);
  if (filters.from) params.set('desde', filters.from);
  if (filters.to) params.set('hasta', filters.to);
  if (filters.sort && filters.sort !== 'recientes') params.set('orden', filters.sort);
  if (filters.page && filters.page > 1) params.set('pagina', String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

// Perú no tiene horario de verano: medianoche de Lima = 05:00 UTC.
export const limaStartOfDay = (date: string) => `${date}T00:00:00-05:00`;
export const limaEndOfDay = (date: string) => new Date(Date.parse(`${date}T00:00:00-05:00`) + 86_400_000).toISOString();

export type AdminOrderRow = {
  id: string;
  code: string;
  createdAt: string;
  paidAt: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingCity: string | null;
  subtotal: number;
  shippingCost: number;
  total: number;
  items: { productName: string; brandName: string | null; variantLabel: string | null; quantity: number; unitPrice: number }[];
};

type Row = {
  id: string;
  code: string;
  created_at: string;
  paid_at: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_city: string | null;
  subtotal: number;
  shipping_cost: number;
  total: number;
  order_items: { product_name: string; brand_name: string | null; variant_label: string | null; quantity: number; unit_price: number }[];
};

export async function queryOrders(
  supabase: SessionClient,
  filters: Omit<OrderFilters, 'page'> & { page?: number },
  options: { page?: number; pageSize?: number; countOnly?: boolean; limit?: number } = {}
): Promise<{ orders: AdminOrderRow[]; total: number }> {
  let query = supabase
    .from('orders')
    .select(
      options.countOnly
        ? 'id'
        : 'id, code, created_at, paid_at, status, payment_method, customer_name, customer_email, customer_phone, shipping_city, subtotal, shipping_cost, total, order_items(product_name, brand_name, variant_label, quantity, unit_price)',
      { count: 'exact', head: options.countOnly }
    );
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.payment) query = query.eq('payment_method', filters.payment);
  if (filters.from) query = query.gte('created_at', limaStartOfDay(filters.from));
  if (filters.to) query = query.lt('created_at', limaEndOfDay(filters.to));
  if (filters.q) {
    // Caracteres con significado en el filtro "or" de PostgREST.
    const term = filters.q.replace(/[,()*%\\]/g, ' ').trim();
    const digits = term.replace(/\D/g, '');
    const clauses = [`code.ilike.*${term}*`, `customer_name.ilike.*${term}*`, `customer_email.ilike.*${term}*`];
    if (digits.length >= 3) clauses.push(`customer_phone.ilike.*${digits}*`);
    if (term) query = query.or(clauses.join(','));
  }
  if (options.countOnly) {
    const { count, error } = await query;
    if (error) throw error;
    return { orders: [], total: count ?? 0 };
  }
  query =
    filters.sort === 'total'
      ? query.order('total', { ascending: false })
      : query.order('created_at', { ascending: filters.sort === 'antiguos' });
  if (options.pageSize) {
    const page = options.page ?? 1;
    query = query.range((page - 1) * options.pageSize, page * options.pageSize - 1);
  } else if (options.limit) {
    query = query.limit(options.limit);
  }
  const { data, count, error } = await query;
  if (error) throw error;
  return {
    total: count ?? 0,
    orders: (data as unknown as Row[]).map((row) => ({
      id: row.id,
      code: row.code,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      status: row.status,
      paymentMethod: row.payment_method,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      shippingCity: row.shipping_city,
      subtotal: Number(row.subtotal),
      shippingCost: Number(row.shipping_cost),
      total: Number(row.total),
      items: row.order_items.map((item) => ({
        productName: item.product_name,
        brandName: item.brand_name,
        variantLabel: item.variant_label,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })),
    })),
  };
}
