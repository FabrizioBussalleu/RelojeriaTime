import Image from 'next/image';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, buttonClass, Card, daysAgoIso, formatDateTime, PageHeader, StatCard, timeAgo } from '@/components/admin/ui';
import { LOW_STOCK, ORDER_STATUS_TONES } from '@/lib/admin/labels';
import { queryOrders } from '@/lib/admin/orders-query';
import { getAdminProducts } from '@/lib/admin/products-query';
import { getKpis, limaToday } from '@/lib/admin/stats';
import { requireAdmin } from '@/lib/auth';
import { cloudinaryImageSrc } from '@/lib/cloudinary/url';
import { formatPEN, ORDER_STATUS_LABELS } from '@/lib/store';

export const metadata = { title: 'Resumen' };

function limaDayStart(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00-05:00`) + offsetDays * 86_400_000).toISOString();
}

export default async function AdminHomePage() {
  const { supabase } = await requireAdmin();
  const { year, month } = limaToday();
  const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00-05:00`).toISOString();

  const [today, monthKpis, pending, recent, products, attention, contactable, attentionList] = await Promise.all([
    getKpis(supabase, limaDayStart(), limaDayStart(1)),
    getKpis(supabase, monthStart, limaDayStart(1)),
    queryOrders(supabase, { status: 'pending_payment', sort: 'antiguos' }, { limit: 6 }),
    queryOrders(supabase, { sort: 'recientes' }, { limit: 6 }),
    getAdminProducts(supabase),
    supabase.from('wa_conversations').select('id', { count: 'exact', head: true }).eq('needs_attention', true),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('whatsapp_opt_in', true).is('opt_out_at', null),
    supabase
      .from('wa_conversations')
      .select('id, attention_reason, last_message_at, customer:customers(name, whatsapp_name, phone)')
      .eq('needs_attention', true)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);
  const active = products.filter((product) => product.status === 'active');
  const lowStock = active.filter((product) => product.stock <= LOW_STOCK).sort((a, b) => a.stock - b.stock);
  const soldOut = active.filter((product) => product.stock === 0).length;
  const { count: inbound7 } = await supabase.from('wa_messages').select('id', { count: 'exact', head: true }).eq('direction', 'in').gte('created_at', daysAgoIso(7));

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Lo que necesita atención hoy en la tienda."
        actions={
          <Link href="/admin/productos/nuevo" className={buttonClass.primary}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo producto
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Por confirmar pago" value={pending.total} hint={pending.total ? 'Pedidos esperando tu confirmación' : 'Todo al día'} href="/admin/pedidos?estado=pending_payment" />
        <StatCard label="Ventas de hoy" value={formatPEN(today.revenue)} hint={`${today.orders} pedido(s) pagado(s)`} href="/admin/estadisticas" />
        <StatCard label="Ventas del mes" value={formatPEN(monthKpis.revenue)} hint={`${monthKpis.orders} pedido(s) · ticket ${formatPEN(monthKpis.avgTicket)}`} href="/admin/estadisticas" />
        <StatCard label="Stock bajo" value={lowStock.length} hint={`${soldOut} agotado(s) de ${active.length} publicados`} href="/admin/productos?estado=active&stock=bajo" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Por confirmar pago" actions={<Link href="/admin/pedidos?estado=pending_payment" className="text-xs text-muted-foreground hover:text-foreground">Ver todos</Link>}>
          {pending.orders.length ? (
            <ul className="divide-y divide-border">
              {pending.orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/admin/pedidos/${order.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-muted-foreground">
                    <span className="min-w-0">
                      <span className="block text-sm">
                        <span className="font-mono">{order.code}</span> · {order.customerName}
                      </span>
                      <span className="text-xs text-muted-foreground">hace {timeAgo(order.createdAt).replace('hace ', '')}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">{formatPEN(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No hay pagos pendientes de confirmar.</p>
          )}
        </Card>

        <Card title="Últimos pedidos" actions={<Link href="/admin/pedidos" className="text-xs text-muted-foreground hover:text-foreground">Ver todos</Link>}>
          {recent.orders.length ? (
            <ul className="divide-y divide-border">
              {recent.orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/admin/pedidos/${order.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-muted-foreground">
                    <span className="min-w-0">
                      <span className="block text-sm">
                        <span className="font-mono">{order.code}</span> · {order.customerName}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm tabular-nums">{formatPEN(order.total)}</span>
                      <Badge tone={ORDER_STATUS_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay pedidos.</p>
          )}
        </Card>

        <Card title="Stock bajo" actions={<Link href="/admin/productos?estado=active&stock=bajo" className="text-xs text-muted-foreground hover:text-foreground">Ver en productos</Link>}>
          {lowStock.length ? (
            <ul className="divide-y divide-border">
              {lowStock.slice(0, 6).map((product) => (
                <li key={product.id}>
                  <Link href={`/admin/productos/${product.id}`} className="flex items-center gap-3 py-2 hover:text-muted-foreground">
                    <span className={`relative h-10 w-10 shrink-0 bg-black ${product.stock === 0 ? 'grayscale' : ''}`}>
                      {product.primaryImage ? <Image src={cloudinaryImageSrc(product.primaryImage.public_id, product.primaryImage)} alt="" fill sizes="40px" className="object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{[product.brand, product.name].filter(Boolean).join(' ')}</span>
                    {product.stock === 0 ? <Badge>Agotado</Badge> : <span className="text-sm text-amber-300">{product.stock} en stock</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Todos los productos publicados tienen stock.</p>
          )}
        </Card>

        <Card title="Catálogo">
          <ul className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Publicados', value: active.length, href: '/admin/productos?estado=active' },
              { label: 'Borradores', value: products.filter((product) => product.status === 'draft').length, href: '/admin/productos?estado=draft' },
              { label: 'Archivados', value: products.filter((product) => product.status === 'archived').length, href: '/admin/productos?estado=archived' },
            ].map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="block border border-border p-3 hover:border-foreground/60">
                  <span className="block text-xs uppercase tracking-[0.14em] text-muted-foreground">{item.label}</span>
                  <span className="mt-1 block text-2xl font-semibold">{item.value}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/organizador" className={buttonClass.secondary}>
              Organizar la tienda
            </Link>
            <Link href="/admin/estadisticas" className={buttonClass.secondary}>
              Ver estadísticas
            </Link>
          </div>
        </Card>
      </div>

      <section className="mt-10 border-t border-border pt-6" aria-labelledby="resumen-whatsapp">
        <h2 id="resumen-whatsapp" className="mb-4 font-display text-sm tracking-[0.18em] text-muted-foreground">
          WhatsApp y clientes
        </h2>
        <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
            <StatCard label="Requieren atención" value={attention.count ?? 0} href="/admin/conversaciones?vista=atencion" />
            <StatCard label="Mensajes · 7 días" value={inbound7 ?? 0} hint={`${contactable.count ?? 0} clientes aceptan novedades`} href="/admin/conversaciones" />
          </div>
          <Card title="Conversaciones para el equipo" actions={<Link href="/admin/conversaciones?vista=atencion" className="text-xs text-muted-foreground hover:text-foreground">Ver todas</Link>}>
            {attentionList.data?.length ? (
              <ul className="divide-y divide-border">
                {attentionList.data.map((conversation) => (
                  <li key={conversation.id}>
                    <Link href={`/admin/conversaciones/${conversation.id}`} className="flex items-start justify-between gap-3 py-2.5 hover:text-muted-foreground">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{conversation.customer?.name ?? conversation.customer?.whatsapp_name ?? conversation.customer?.phone}</span>
                        <span className="block truncate text-xs text-muted-foreground">{conversation.attention_reason ?? 'Necesita respuesta'}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.last_message_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nada pendiente.</p>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
