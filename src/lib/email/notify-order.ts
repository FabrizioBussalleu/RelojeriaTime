import 'server-only';

import { getStoreSettings } from '@/lib/catalog';
import { siteUrl } from '@/lib/env';
import { orderConfirmationPath } from '@/lib/orders';
import { createServiceClient } from '@/lib/supabase/clients';
import { isTestAddress, renderOrderEmails, type OrderEmailData } from './order-emails';
import { isEmailConfigured, sendEmail } from './transport';

// Aviso de pedido nuevo: a la tienda (ORDER_NOTIFICATION_EMAIL o el correo de contacto de Ajustes) y al
// cliente. Corre después de responder (after), así el checkout no espera al correo. Un fallo se registra
// en el log y no afecta al pedido.
export async function notifyNewOrder(code: string) {
  if (!isEmailConfigured()) {
    console.info(`Correo del pedido ${code} omitido: falta configurar SMTP_USER y SMTP_PASSWORD.`);
    return;
  }
  const [{ data: order, error }, settings] = await Promise.all([
    createServiceClient()
      .from('orders')
      .select(
        'id, code, created_at, customer_name, customer_email, customer_phone, customer_document, shipping_address, shipping_city, notes, payment_method, subtotal, shipping_cost, discount, total, items:order_items(product_name, brand_name, variant_label, unit_price, quantity)'
      )
      .eq('code', code)
      .single(),
    getStoreSettings(),
  ]);
  if (error || !order) {
    console.error(`Correo del pedido ${code}: no se pudo leer el pedido`, error);
    return;
  }
  if (isTestAddress(order.customer_email)) {
    console.info(`Correo del pedido ${code} omitido: es un pedido de prueba (${order.customer_email}).`);
    return;
  }

  const data: OrderEmailData = {
    code: order.code,
    createdAt: order.created_at,
    customer: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      document: order.customer_document,
      address: order.shipping_address,
      city: order.shipping_city,
      notes: order.notes,
    },
    paymentMethod: order.payment_method,
    items: order.items.map((item) => ({ name: item.product_name, brand: item.brand_name, variant: item.variant_label, unitPrice: Number(item.unit_price), quantity: item.quantity })),
    subtotal: Number(order.subtotal),
    shippingCost: Number(order.shipping_cost),
    discount: Number(order.discount),
    total: Number(order.total),
  };
  const base = siteUrl();
  const emails = renderOrderEmails(data, {
    orderUrl: `${base}${orderConfirmationPath(order.code)}`,
    adminUrl: `${base}/admin/pedidos/${order.id}`,
    whatsappNumber: settings.whatsappNumber,
    yapeNumber: settings.yapeNumber,
    plinNumber: settings.plinNumber,
    paymentHolderName: settings.paymentHolderName,
    bankAccounts: settings.bankAccounts,
    reserveHours: settings.pendingOrderTtlHours,
  });

  const owner = process.env.ORDER_NOTIFICATION_EMAIL?.trim() || settings.contactEmail || process.env.SMTP_USER!.trim();
  const results = await Promise.allSettled([
    // Responder al aviso le escribe directo al cliente.
    sendEmail({ to: owner, replyTo: order.customer_email, ...emails.owner }),
    sendEmail({ to: { name: order.customer_name, address: order.customer_email }, replyTo: settings.contactEmail ?? owner, ...emails.customer }),
  ]);
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`Correo del pedido ${code} a ${index === 0 ? 'la tienda' : 'el cliente'} falló`, result.reason);
  });
}
