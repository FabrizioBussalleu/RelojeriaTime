import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyLink, DeliveryEditor, InternalNotes, OrderDangerZone, OrderStatusControl, WhatsAppOrderLink } from '@/components/admin/orders/OrderActions';
import { Badge, Card, formatDateTime, PageHeader } from '@/components/admin/ui';
import { ORDER_STATUS_TONES } from '@/lib/admin/labels';
import { requireAdmin } from '@/lib/auth';
import { firstName } from '@/lib/crm/templates';
import { orderConfirmationPath } from '@/lib/orders';
import { formatPEN, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, visibleVariantLabel, whatsappLink, type OrderStatus } from '@/lib/store';
import { siteUrl as getSiteUrl } from '@/lib/env';

export const metadata = { title: 'Pedido' };

function whatsappMessage(status: OrderStatus, name: string, code: string, total: string) {
  const hello = `Hola ${firstName(name)}, te escribimos de Time Relojería`;
  switch (status) {
    case 'pending_payment':
      return `${hello} por tu pedido ${code} (${total}). ¿Pudiste realizar el pago? Cuando lo hagas, envíanos la captura por aquí.`;
    case 'paid':
    case 'preparing':
      return `${hello}: confirmamos el pago de tu pedido ${code}. Te avisamos cuando salga.`;
    case 'shipped':
      return `${hello}: tu pedido ${code} ya está en camino.`;
    default:
      return `${hello} por tu pedido ${code}.`;
  }
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*), order_status_history(id, from_status, to_status, changed_by, note, created_at)')
    .eq('id', id)
    .maybeSingle();
  if (!order) notFound();

  const status = order.status as OrderStatus;
  const history = [...order.order_status_history].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const units = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const siteUrl = getSiteUrl();
  const orderLink = `${siteUrl}${orderConfirmationPath(order.code)}`;

  return (
    <>
      <PageHeader
        title={`Pedido ${order.code}`}
        back={{ href: '/admin/pedidos', label: 'Pedidos' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
            <span>Creado {formatDateTime(order.created_at)}</span>
            {order.paid_at ? <span>· pagado {formatDateTime(order.paid_at)}</span> : null}
          </span>
        }
        actions={
          <>
            <WhatsAppOrderLink href={whatsappLink(order.customer_phone, whatsappMessage(status, order.customer_name, order.code, formatPEN(order.total)))} />
            <CopyLink url={orderLink} label="Copiar enlace del pedido" />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title={`Productos (${units})`}>
            <ul className="divide-y divide-border">
              {order.order_items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3">
                  <div className="relative h-16 w-16 shrink-0 bg-black">
                    {item.image_public_id ? <Image src={item.image_public_id} alt="" fill sizes="64px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.product_id ? (
                      <Link href={`/admin/productos/${item.product_id}`} className="font-medium hover:underline">
                        {item.product_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.product_name}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {[item.brand_name, visibleVariantLabel(item.variant_label)].filter(Boolean).join(' · ')}
                      {item.product_id ? '' : ' · producto eliminado del catálogo'}
                    </span>
                  </div>
                  <span className="text-right text-sm tabular-nums">
                    {item.quantity} × {formatPEN(item.unit_price)}
                    <span className="block font-medium">{formatPEN(item.line_total ?? item.unit_price * item.quantity)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatPEN(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Envío</dt>
                <dd className="tabular-nums">{order.shipping_cost ? formatPEN(order.shipping_cost) : 'Gratis / por coordinar'}</dd>
              </div>
              {order.discount ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Descuento</dt>
                  <dd className="tabular-nums">−{formatPEN(order.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPEN(order.total)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Historial">
            <ol className="space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 bg-foreground" aria-hidden />
                  <span>
                    <span className="block">
                      {entry.from_status ? `${ORDER_STATUS_LABELS[entry.from_status as OrderStatus]} → ` : ''}
                      <strong>{ORDER_STATUS_LABELS[entry.to_status as OrderStatus]}</strong>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.created_at)} · {entry.changed_by ? 'Equipo' : entry.from_status ? 'Automático' : 'Cliente (web)'}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Estado">
            <OrderStatusControl orderId={order.id} status={status} />
          </Card>

          <Card title="Cliente">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Nombre</dt>
                <dd>
                  {order.customer_id ? (
                    <Link href={`/admin/clientes/${order.customer_id}`} className="hover:underline">
                      {order.customer_name}
                    </Link>
                  ) : (
                    order.customer_name
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Correo</dt>
                <dd>
                  <a href={`mailto:${order.customer_email}`} className="hover:underline">
                    {order.customer_email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Teléfono</dt>
                <dd>{order.customer_phone}</dd>
              </div>
              {order.customer_document ? (
                <div>
                  <dt className="text-xs text-muted-foreground">DNI / CE</dt>
                  <dd>{order.customer_document}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card title="Entrega y pago">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Dirección</dt>
                <dd>
                  {order.shipping_address}
                  {order.shipping_city ? `, ${order.shipping_city}` : ''}
                </dd>
              </div>
              {order.notes ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Nota del cliente</dt>
                  <dd className="whitespace-pre-line">{order.notes}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Método de pago</dt>
                <dd>{PAYMENT_METHOD_LABELS[order.payment_method]}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <DeliveryEditor orderId={order.id} initial={{ customer_phone: order.customer_phone, shipping_address: order.shipping_address, shipping_city: order.shipping_city ?? '' }} />
            </div>
          </Card>

          <Card title="Notas internas">
            <InternalNotes orderId={order.id} initial={order.internal_notes ?? ''} />
          </Card>

          <OrderDangerZone orderId={order.id} code={order.code} status={status} units={units} />
        </div>
      </div>
    </>
  );
}
