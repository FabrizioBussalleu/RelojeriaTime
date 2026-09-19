import { describe, expect, it } from 'vitest';
import { isTestAddress, renderOrderEmails, type OrderEmailContext, type OrderEmailData } from './order-emails';

const order: OrderEmailData = {
  code: 'TM-001200',
  createdAt: '2026-09-19T20:30:00Z',
  customer: {
    name: 'Ana <b>Pérez</b>',
    email: 'ana@correo.pe',
    phone: '51987654321',
    document: '12345678',
    address: 'Av. Larco 123',
    city: 'Miraflores',
    notes: 'Tocar el timbre\n<script>alert(1)</script>',
  },
  paymentMethod: 'yape',
  items: [
    { name: 'Aurora 40', brand: 'Aurum', variant: 'Única', unitPrice: 890, quantity: 1 },
    { name: 'Norte Field', brand: 'Nordik', variant: '42 mm', unitPrice: 660, quantity: 2 },
  ],
  subtotal: 2210,
  shippingCost: 0,
  discount: 0,
  total: 2210,
};

const context: OrderEmailContext = {
  orderUrl: 'https://time.pe/pedido/TM-001200?t=abc',
  adminUrl: 'https://time.pe/admin/pedidos/1',
  whatsappNumber: '982762602',
  yapeNumber: '982762602',
  plinNumber: null,
  paymentHolderName: 'Time Relojería',
  bankAccounts: [{ bank: 'BCP', holder: 'Time', account: '191-000', cci: '002-191' }],
  reserveHours: 24,
};

describe('correos de pedido', () => {
  const { customer, owner } = renderOrderEmails(order, context);

  it('el cliente recibe el código, el total y cómo pagar', () => {
    expect(customer.subject).toBe('Recibimos tu pedido TM-001200 · Time Relojería');
    expect(customer.html).toContain('TM-001200');
    expect(customer.html).toContain('Yape al 982 762 602 (a nombre de Time Relojería)');
    expect(customer.html).toContain('https://wa.me/51982762602?text=');
    expect(customer.html).toContain('href="https://time.pe/pedido/TM-001200?t=abc"');
    expect(customer.text).toContain('Ver tu pedido: https://time.pe/pedido/TM-001200?t=abc');
    expect(customer.text).toContain('24 horas');
  });

  it('la tienda recibe los datos del cliente y el enlace al panel', () => {
    expect(owner.subject).toMatch(/^Nuevo pedido TM-001200 · S\/\s?2,210\.00 · Yape$/);
    expect(owner.html).toContain('ana@correo.pe');
    expect(owner.html).toContain('+51 987 654 321');
    expect(owner.html).toContain(context.adminUrl);
    expect(owner.text).toContain('Norte Field (42 mm): 2 ×');
  });

  it('escapa lo que escribe el cliente', () => {
    for (const html of [customer.html, owner.html]) {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>Pérez</b>');
    }
    expect(owner.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('no muestra la variante por defecto', () => {
    expect(customer.text).toContain('- Aurum Aurora 40: 1 ×');
    expect(customer.text).not.toContain('Única');
  });

  it('en transferencia lista las cuentas', () => {
    const transfer = renderOrderEmails({ ...order, paymentMethod: 'transfer' }, context).customer;
    expect(transfer.text).toContain('BCP · Titular: Time · Cuenta: 191-000 · CCI: 002-191');
  });

  it('reconoce los correos de prueba', () => {
    expect(isTestAddress('e2e-tienda@example.com')).toBe(true);
    expect(isTestAddress('x@pruebas.invalid')).toBe(true);
    expect(isTestAddress('ana@correo.pe')).toBe(false);
    expect(isTestAddress('contact.time.pe@gmail.com')).toBe(false);
  });
});
