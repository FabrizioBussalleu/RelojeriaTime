import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { SubmitButton, WhatsAppChatLink } from '@/components/admin/ClientBits';
import { CustomerForm } from '@/components/admin/CustomerForm';
import { Badge, Card, EmptyState, formatDate, formatDateTime, PageHeader, StatCard, timeAgo } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { CUSTOMER_SOURCE_LABELS, MESSAGE_SENDER_LABELS, RECIPIENT_STATUS_LABELS, type CustomerSource } from '@/lib/crm/labels';
import { displayPhone } from '@/lib/phone';
import { formatPEN, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, visibleVariantLabel } from '@/lib/store';
import { deleteCustomer, openConversation, setCustomerConsent, updateCustomer } from '../actions';

export const metadata = { title: 'Ficha de cliente' };

const OPT_IN_SOURCES: Record<string, string> = {
  checkout: 'al comprar en la web',
  registro: 'al registrarse en la web',
  whatsapp: 'respondiendo ALTA por WhatsApp',
  panel: 'registrado por el equipo',
  tienda: 'en tienda',
};

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: customer } = await supabase.from('customer_overview').select('*').eq('id', id).maybeSingle();
  if (!customer) notFound();

  const [orders, messages, campaigns, templates, brands] = await Promise.all([
    supabase
      .from('orders')
      .select('id, code, created_at, status, total, payment_method, paid_at, order_items(product_name, brand_name, variant_label, quantity, unit_price)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    customer.conversation_id
      ? supabase.from('wa_messages').select('id, direction, sender, type, body, created_at').eq('conversation_id', customer.conversation_id).order('created_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] as { id: string; direction: string; sender: string; type: string; body: string | null; created_at: string }[] }),
    supabase.from('campaign_recipients').select('id, status, sent_at, replied_at, campaign:campaigns(id, name)').eq('customer_id', id).order('id', { ascending: false }).limit(10),
    supabase.from('message_templates').select('id, name, body, is_default').eq('kind', 'chat').order('is_default', { ascending: false }).order('name'),
    supabase.from('brands').select('name').order('name'),
  ]);

  const paidOrders = (orders.data ?? []).filter((order) => order.paid_at && order.status !== 'cancelled');
  const brandCounts = new Map<string, number>();
  for (const order of paidOrders) for (const item of order.order_items) if (item.brand_name) brandCounts.set(item.brand_name, (brandCounts.get(item.brand_name) ?? 0) + item.quantity);
  const favoriteBrand = [...brandCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const totalSpent = customer.total_spent ?? 0;
  const contactable = customer.whatsapp_opt_in && !customer.opt_out_at;
  const phone = customer.phone!;

  return (
    <>
      <PageHeader
        title={customer.display_name ?? 'Cliente sin nombre'}
        back={{ href: '/admin/clientes', label: 'Clientes' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{displayPhone(phone)}</span>
            {customer.email ? <span>· {customer.email}</span> : null}
            <Badge>{CUSTOMER_SOURCE_LABELS[customer.source as CustomerSource] ?? customer.source}</Badge>
            {customer.whatsapp_name && customer.name && customer.whatsapp_name !== customer.name ? <span>· en WhatsApp: {customer.whatsapp_name}</span> : null}
          </span>
        }
        actions={
          <>
            <form action={openConversation.bind(null, id)}>
              <SubmitButton variant="primary">
                <MessagesSquare className="h-4 w-4" aria-hidden />
                Conversación
              </SubmitButton>
            </form>
            <WhatsAppChatLink
              phone={phone}
              customerName={customer.display_name}
              templates={(templates.data ?? []).map((template) => ({ id: template.id, name: template.name, body: template.body, isDefault: template.is_default }))}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Compras" value={paidOrders.length} hint={customer.pending_orders ? `${customer.pending_orders} pedido(s) por pagar` : `Cliente desde ${formatDate(customer.created_at)}`} />
        <StatCard label="Gasto total" value={formatPEN(totalSpent)} hint={paidOrders.length ? `Ticket promedio ${formatPEN(totalSpent / paidOrders.length)}` : 'Sin compras pagadas'} />
        <StatCard label="Última compra" value={customer.last_paid_at ? timeAgo(customer.last_paid_at) : '—'} hint={customer.last_paid_at ? formatDate(customer.last_paid_at) : undefined} />
        <StatCard label="Marca favorita" value={favoriteBrand ?? '—'} hint={customer.interests?.length ? `Le interesa: ${customer.interests.join(', ')}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Historial de compras">
            {orders.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium">Productos</th>
                      <th className="py-2 pr-3 text-right font-medium">Total</th>
                      <th className="py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.data.map((order) => (
                      <tr key={order.id} className="align-top">
                        <td className="py-2.5 pr-3">
                          <span className="block">{formatDate(order.created_at)}</span>
                          <span className="text-xs text-muted-foreground">{order.code}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          {order.order_items.map((item, index) => (
                            <span key={index} className="block">
                              {[item.brand_name, item.product_name].filter(Boolean).join(' ')}
                              {visibleVariantLabel(item.variant_label) ? ` · ${item.variant_label}` : ''}
                              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                            </span>
                          ))}
                          <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[order.payment_method]}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{formatPEN(order.total)}</td>
                        <td className="py-2.5">
                          <Badge tone={order.status === 'cancelled' ? 'danger' : order.paid_at ? 'success' : 'warning'}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Sin pedidos">Cuando compre en la web con este número, sus pedidos aparecerán aquí.</EmptyState>
            )}
          </Card>

          <Card title="Datos del cliente">
            <CustomerForm
              action={updateCustomer.bind(null, id)}
              brands={(brands.data ?? []).map((brand) => brand.name)}
              mode="edit"
              initial={{
                name: customer.name ?? customer.whatsapp_name ?? '',
                phone: displayPhone(phone),
                email: customer.email ?? '',
                document: customer.document ?? '',
                city: customer.city ?? '',
                notes: customer.notes ?? '',
                interests: customer.interests ?? [],
                tags: customer.tags ?? [],
              }}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Novedades por WhatsApp">
            <p className="text-sm">
              {contactable ? (
                <Badge tone="success">Acepta novedades</Badge>
              ) : customer.opt_out_at ? (
                <Badge tone="danger">Se dio de baja</Badge>
              ) : (
                <Badge>Sin consentimiento</Badge>
              )}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {contactable
                ? `Aceptó ${OPT_IN_SOURCES[customer.opt_in_source ?? ''] ?? ''} el ${formatDateTime(customer.opt_in_at)}.`
                : customer.opt_out_at
                  ? `Pidió no recibir novedades el ${formatDateTime(customer.opt_out_at)}.`
                  : 'No entra en campañas. Igual puedes responderle si escribe.'}
            </p>
            <form action={setCustomerConsent.bind(null, id, !contactable)} className="mt-3">
              <SubmitButton
                variant="secondary"
                confirm={contactable ? '¿Quitar el consentimiento? Dejará de recibir campañas.' : '¿El cliente aceptó expresamente recibir novedades por WhatsApp?'}
              >
                {contactable ? 'Quitar consentimiento' : 'Registrar consentimiento'}
              </SubmitButton>
            </form>
          </Card>

          <Card
            title="Conversación"
            actions={
              customer.conversation_id ? (
                <Link href={`/admin/conversaciones/${customer.conversation_id}`} className="text-xs text-muted-foreground hover:text-foreground">
                  Abrir
                </Link>
              ) : null
            }
          >
            {messages.data?.length ? (
              <ul className="space-y-2">
                {[...messages.data].reverse().map((message) => (
                  <li key={message.id} className={message.direction === 'in' ? 'pr-8' : 'pl-8 text-right'}>
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                      {MESSAGE_SENDER_LABELS[message.sender]} · {timeAgo(message.created_at)}
                    </span>
                    <span className="line-clamp-3 whitespace-pre-line text-sm">{message.body ?? (message.type === 'image' ? '[Foto]' : '[Mensaje]')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay mensajes por WhatsApp.</p>
            )}
          </Card>

          <Card title="Campañas recibidas">
            {campaigns.data?.length ? (
              <ul className="divide-y divide-border text-sm">
                {campaigns.data.map((recipient) => (
                  <li key={recipient.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/admin/campanas/${recipient.campaign?.id}`} className="truncate hover:underline">
                      {recipient.campaign?.name}
                    </Link>
                    <span className="flex shrink-0 gap-1">
                      {recipient.replied_at ? <Badge tone="info">Respondió</Badge> : null}
                      <Badge>{RECIPIENT_STATUS_LABELS[recipient.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No recibió campañas.</p>
            )}
          </Card>

          <Card title="Eliminar">
            <p className="text-xs text-muted-foreground">Borra la ficha, la conversación y sus mensajes. Los pedidos se conservan.</p>
            <form action={deleteCustomer.bind(null, id)} className="mt-3">
              <SubmitButton variant="danger" confirm="¿Eliminar este cliente y su conversación? No se puede deshacer.">
                Eliminar cliente
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
