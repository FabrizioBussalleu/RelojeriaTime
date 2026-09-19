import { NextResponse } from 'next/server';
import { orderFiltersFromParams, queryOrders } from '@/lib/admin/orders-query';
import { getAdminSession } from '@/lib/auth';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, visibleVariantLabel } from '@/lib/store';

export const dynamic = 'force-dynamic';

const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });

// CSV con ";" (Excel en español lo abre en columnas) y BOM para que respete las tildes.
function csvCell(value: string | number | null) {
  const text = value === null ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const filters = orderFiltersFromParams(Object.fromEntries(new URL(request.url).searchParams));
  const { orders } = await queryOrders(session.supabase, filters, { limit: 5000 });

  const header = ['Código', 'Fecha', 'Estado', 'Pagado el', 'Cliente', 'Correo', 'Teléfono', 'Ciudad', 'Pago', 'Productos', 'Unidades', 'Subtotal', 'Envío', 'Total'];
  const rows = orders.map((order) => [
    order.code,
    dateTime.format(new Date(order.createdAt)),
    ORDER_STATUS_LABELS[order.status],
    order.paidAt ? dateTime.format(new Date(order.paidAt)) : '',
    order.customerName,
    order.customerEmail,
    order.customerPhone,
    order.shippingCity,
    PAYMENT_METHOD_LABELS[order.paymentMethod],
    order.items
      .map((item) => `${[item.brandName, item.productName].filter(Boolean).join(' ')}${visibleVariantLabel(item.variantLabel) ? ` (${item.variantLabel})` : ''} x${item.quantity}`)
      .join(' | '),
    order.items.reduce((sum, item) => sum + item.quantity, 0),
    order.subtotal.toFixed(2),
    order.shippingCost.toFixed(2),
    order.total.toFixed(2),
  ]);
  const csv = `﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-time-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
