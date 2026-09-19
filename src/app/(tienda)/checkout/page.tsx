import type { Metadata } from 'next';
import CheckoutView, { type PaymentOption } from '@/components/checkout/CheckoutView';
import { getStoreSettings } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Finalizar compra', robots: { index: false } };

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const settings = await getStoreSettings();
  const paymentOptions: PaymentOption[] = [
    settings.yapeNumber ? { value: 'yape' as const, label: 'Yape', description: 'Te mostramos el número al confirmar el pedido.' } : null,
    settings.plinNumber ? { value: 'plin' as const, label: 'Plin', description: 'Te mostramos el número al confirmar el pedido.' } : null,
    settings.bankAccounts.length
      ? { value: 'transfer' as const, label: 'Transferencia bancaria', description: 'Te mostramos las cuentas al confirmar el pedido.' }
      : null,
  ].filter((option): option is PaymentOption => option !== null);

  return <CheckoutView paymentOptions={paymentOptions} reserveHours={settings.pendingOrderTtlHours} />;
}
