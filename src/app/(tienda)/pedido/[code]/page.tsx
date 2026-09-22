import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { OrderItems, OrderTimeline } from '@/components/orders/OrderSummaryView';
import { getStoreSettings } from '@/lib/catalog';
import { getOrderByToken } from '@/lib/orders';
import { formatPEN, formatPhone, whatsappLink } from '@/lib/store';

export const metadata: Metadata = { title: 'Tu pedido', robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string | string[] }> };

export default async function OrderPage({ params, searchParams }: PageProps) {
  const [{ code }, { t }] = await Promise.all([params, searchParams]);
  const order = typeof t === 'string' ? await getOrderByToken(decodeURIComponent(code), t) : null;
  if (!order) notFound();
  const settings = await getStoreSettings();

  const awaitingPayment = order.status === 'pending_payment';
  const proofMessage = `Hola, quiero finalizar mi pedido ${order.code} por ${formatPEN(order.total)}.`;
  const walletNumber = order.paymentMethod === 'yape' ? settings.yapeNumber : order.paymentMethod === 'plin' ? settings.plinNumber : null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10 md:py-14 space-y-8">
      <header className="text-center space-y-3">
        <CheckCircle2 className="mx-auto h-12 w-12" strokeWidth={1.25} aria-hidden="true" />
        <h1 className="text-3xl md:text-4xl font-display">¡Gracias, {order.customerName.split(' ')[0]}!</h1>
        <p className="text-sm text-muted-foreground">
          Registramos tu pedido <strong className="font-display tracking-wider text-foreground">{order.code}</strong>. Guarda este código para
          seguirlo.
        </p>
      </header>

      <OrderTimeline status={order.status} history={order.history} />

      {awaitingPayment ? (
        <section aria-labelledby="como-pagar" className="border border-foreground p-6 space-y-5">
          <h2 id="como-pagar" className="text-lg font-display tracking-wider">
            Paga {formatPEN(order.total)}
          </h2>

          {walletNumber ? (
            <div className="space-y-1">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                {order.paymentMethod === 'yape' ? 'Yape' : 'Plin'} al número
              </p>
              <p className="text-2xl font-display tracking-wider">{formatPhone(walletNumber)}</p>
              {settings.paymentHolderName ? <p className="text-sm text-muted-foreground">A nombre de {settings.paymentHolderName}</p> : null}
            </div>
          ) : null}

          {order.paymentMethod === 'transfer' ? (
            <ul className="space-y-4">
              {settings.bankAccounts.map((account, index) => (
                <li key={index} className="grid gap-1 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Banco:</span> {account.bank}</p>
                  <p><span className="text-muted-foreground">Titular:</span> {account.holder}</p>
                  <p><span className="text-muted-foreground">Cuenta:</span> {account.account}</p>
                  <p><span className="text-muted-foreground">CCI:</span> {account.cci}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Escríbenos por WhatsApp con tu código de pedido para cerrar la compra: puedes adelantar el pago con los datos de arriba y enviarnos el
            comprobante, o coordinar <strong className="text-foreground">pago contra entrega</strong>. Guardamos tu reloj{' '}
            {settings.pendingOrderTtlHours} horas mientras conversamos.
          </p>

          {settings.whatsappNumber ? (
            <a
              href={whatsappLink(settings.whatsappNumber, proofMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex w-full items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Finalizar mi compra por WhatsApp
            </a>
          ) : null}
        </section>
      ) : null}

      <OrderItems order={order} />

      <p className="text-center text-sm text-muted-foreground">
        Puedes consultar el estado cuando quieras en{' '}
        <Link href="/seguimiento" className="underline hover:text-foreground">
          seguimiento de pedido
        </Link>{' '}
        con tu código y tu correo.
      </p>
    </div>
  );
}
