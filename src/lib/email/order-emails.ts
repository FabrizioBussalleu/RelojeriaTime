// Correos de un pedido nuevo: aviso a la tienda y confirmación al cliente (HTML simple con estilos en
// línea, más versión de texto). Todo dato del cliente se escapa: llega desde un formulario público.
import { formatPEN, formatPhone, PAYMENT_METHOD_LABELS, visibleVariantLabel, whatsappLink, type PaymentMethod } from '@/lib/store';
import { button, escape, FONT, heading, layout, limaDate, MUTED, sellerLine, subheading, type RenderedEmail } from './pieces';

export type { RenderedEmail };

export type OrderEmailData = {
  code: string;
  createdAt: string;
  customer: { name: string; email: string; phone: string; document: string | null; address: string; city: string | null; notes: string | null };
  paymentMethod: PaymentMethod;
  items: { name: string; brand: string | null; variant: string | null; unitPrice: number; quantity: number }[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
};

export type OrderEmailContext = {
  orderUrl: string;
  adminUrl: string;
  whatsappNumber: string | null;
  yapeNumber: string | null;
  plinNumber: string | null;
  paymentHolderName: string | null;
  bankAccounts: { bank: string; holder: string; account: string; cci: string }[];
  reserveHours: number;
};

const itemTitle = (item: OrderEmailData['items'][number]) => {
  const variant = visibleVariantLabel(item.variant);
  return `${[item.brand, item.name].filter(Boolean).join(' ')}${variant ? ` (${variant})` : ''}`;
};

function itemsTable(order: OrderEmailData) {
  const rows = order.items
    .map(
      (item) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #eeeeee;">${escape(itemTitle(item))}<br><span style="${MUTED}font-size:13px;">${item.quantity} × ${formatPEN(item.unitPrice)}</span></td>
<td align="right" style="padding:8px 0;border-bottom:1px solid #eeeeee;white-space:nowrap;">${formatPEN(item.unitPrice * item.quantity)}</td></tr>`
    )
    .join('');
  const line = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? 'font-weight:bold;' : MUTED}">${label}</td><td align="right" style="padding:4px 0;${strong ? 'font-weight:bold;' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${FONT}font-size:14px;">${rows}
${line('Subtotal', formatPEN(order.subtotal))}
${order.discount > 0 ? line('Descuento', `−${formatPEN(order.discount)}`) : ''}
${line('Envío', order.shippingCost > 0 ? formatPEN(order.shippingCost) : 'Se coordina por WhatsApp')}
${line('Total', formatPEN(order.total), true)}</table>`;
}

function paymentLines(order: OrderEmailData, context: OrderEmailContext) {
  if (order.paymentMethod === 'transfer') {
    return context.bankAccounts.map((account) => `${account.bank} · Titular: ${account.holder} · Cuenta: ${account.account} · CCI: ${account.cci}`);
  }
  const number = order.paymentMethod === 'yape' ? context.yapeNumber : context.plinNumber;
  if (!number) return [];
  return [`${PAYMENT_METHOD_LABELS[order.paymentMethod]} al ${formatPhone(number)}${context.paymentHolderName ? ` (a nombre de ${context.paymentHolderName})` : ''}`];
}

const addressLine = (order: OrderEmailData) => [order.customer.address, order.customer.city].filter(Boolean).join(', ');

// Cliente ---------------------------------------------------------------------------------------------
function customerEmail(order: OrderEmailData, context: OrderEmailContext): RenderedEmail {
  const firstName = order.customer.name.trim().split(/\s+/)[0];
  const total = formatPEN(order.total);
  const payment = paymentLines(order, context);
  const proof = context.whatsappNumber
    ? whatsappLink(context.whatsappNumber, `Hola, quiero finalizar mi pedido ${order.code} por ${total}.`)
    : null;
  const reminder = `Escríbenos por WhatsApp con tu código de pedido para cerrar la compra: puedes adelantar el pago y enviarnos el comprobante, o coordinar pago contra entrega. Guardamos tu reloj ${context.reserveHours} horas mientras conversamos.`;

  const html = layout(
    `Tu código de pedido es ${order.code}. Paga ${total} con ${PAYMENT_METHOD_LABELS[order.paymentMethod]}.`,
    `${heading(`¡Gracias, ${escape(firstName)}!`)}
<p style="margin:0 0 16px;">Registramos tu pedido. Guarda este código para seguirlo:</p>
<p style="margin:0 0 8px;font-size:28px;letter-spacing:3px;font-weight:bold;">${escape(order.code)}</p>
<p style="margin:0;${MUTED}font-size:13px;">${escape(limaDate.format(new Date(order.createdAt)))}</p>
${subheading(`Paga ${total} con ${escape(PAYMENT_METHOD_LABELS[order.paymentMethod])}`)}
${payment.map((line) => `<p style="margin:0 0 6px;font-weight:bold;">${escape(line)}</p>`).join('')}
<p style="margin:10px 0 0;${MUTED}font-size:14px;">${escape(reminder)}</p>
<p style="margin:16px 0 0;">${proof ? button(proof, 'Finalizar compra por WhatsApp') : ''}${button(context.orderUrl, 'Ver mi pedido', !proof)}</p>
${subheading('Tu pedido')}
${itemsTable(order)}
${subheading('Entrega')}
<p style="margin:0;">${escape(order.customer.name)}<br>${escape(addressLine(order))}<br>${escape(formatPhone(order.customer.phone))}</p>
<p style="margin:28px 0 0;${MUTED}font-size:12px;">Si no hiciste este pedido, ignora este correo o respóndelo para avisarnos.</p>`
  );

  const text = [
    `¡Gracias, ${firstName}!`,
    `Registramos tu pedido ${order.code} (${limaDate.format(new Date(order.createdAt))}).`,
    '',
    `Paga ${total} con ${PAYMENT_METHOD_LABELS[order.paymentMethod]}:`,
    ...payment,
    reminder,
    proof ? `Finalizar tu compra por WhatsApp: ${proof}` : null,
    `Ver tu pedido: ${context.orderUrl}`,
    '',
    'TU PEDIDO',
    ...order.items.map((item) => `- ${itemTitle(item)}: ${item.quantity} × ${formatPEN(item.unitPrice)}`),
    `Total: ${total}`,
    '',
    `Entrega: ${addressLine(order)}`,
    '',
    sellerLine(),
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject: `Recibimos tu pedido ${order.code} · Time Relojería`, html, text };
}

// Tienda ----------------------------------------------------------------------------------------------
function ownerEmail(order: OrderEmailData, context: OrderEmailContext): RenderedEmail {
  const total = formatPEN(order.total);
  const method = PAYMENT_METHOD_LABELS[order.paymentMethod];
  const { customer } = order;
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const field = (label: string, value: string) => `<tr><td style="padding:4px 12px 4px 0;${MUTED}vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`;

  const html = layout(
    `${customer.name} · ${total} · ${method}`,
    `${heading(`Nuevo pedido ${escape(order.code)}`)}
<p style="margin:0 0 4px;font-size:18px;"><strong>${total}</strong> · ${escape(method)} · pendiente de pago</p>
<p style="margin:0;${MUTED}font-size:13px;">${escape(limaDate.format(new Date(order.createdAt)))} · ${units} ${units === 1 ? 'unidad' : 'unidades'}</p>
<p style="margin:16px 0 0;">${button(context.adminUrl, 'Abrir en el panel')}${button(whatsappLink(customer.phone), 'Escribir por WhatsApp', false)}</p>
${subheading('Cliente')}
<table role="presentation" cellpadding="0" cellspacing="0" style="${FONT}font-size:14px;">
${field('Nombre', escape(customer.name))}
${field('Celular', `<a href="${escape(whatsappLink(customer.phone))}" style="color:#000000;">${escape(formatPhone(customer.phone))}</a>`)}
${field('Correo', `<a href="mailto:${escape(customer.email)}" style="color:#000000;">${escape(customer.email)}</a>`)}
${customer.document ? field('DNI / CE', escape(customer.document)) : ''}
${field('Entrega', escape(addressLine(order)))}
${customer.notes ? field('Notas', escape(customer.notes).replace(/\n/g, '<br>')) : ''}
</table>
${subheading('Productos')}
${itemsTable(order)}`
  );

  const text = [
    `Nuevo pedido ${order.code}: ${total} con ${method} (pendiente de pago).`,
    limaDate.format(new Date(order.createdAt)),
    '',
    `Cliente: ${customer.name}`,
    `Celular: ${formatPhone(customer.phone)}`,
    `Correo: ${customer.email}`,
    customer.document ? `DNI / CE: ${customer.document}` : null,
    `Entrega: ${addressLine(order)}`,
    customer.notes ? `Notas: ${customer.notes}` : null,
    '',
    ...order.items.map((item) => `- ${itemTitle(item)}: ${item.quantity} × ${formatPEN(item.unitPrice)}`),
    `Total: ${total}`,
    '',
    `Panel: ${context.adminUrl}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject: `Nuevo pedido ${order.code} · ${total} · ${method}`, html, text };
}

// Dominios reservados para pruebas (RFC 2606): los pedidos de prueba no generan correos reales.
export function isTestAddress(email: string) {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return /(^|\.)(example\.(com|net|org)|test|invalid|example|localhost)$/.test(domain);
}

export function renderOrderEmails(order: OrderEmailData, context: OrderEmailContext) {
  return { customer: customerEmail(order, context), owner: ownerEmail(order, context) };
}
