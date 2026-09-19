import Link from 'next/link';
import { Download } from 'lucide-react';
import { Badge, buttonClass, EmptyState, formatDateTime, inputClass, PageHeader } from '@/components/admin/ui';
import { ORDER_STATUS_TONES } from '@/lib/admin/labels';
import { orderFiltersFromParams, ordersQueryString, queryOrders, type OrderFilters } from '@/lib/admin/orders-query';
import { requireAdmin } from '@/lib/auth';
import { formatPEN, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, visibleVariantLabel, type OrderStatus } from '@/lib/store';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Pedidos' };

const PAGE_SIZE = 30;
const TABS: { key: OrderStatus | undefined; label: string }[] = [
  { key: undefined, label: 'Todos' },
  { key: 'pending_payment', label: 'Por confirmar pago' },
  { key: 'paid', label: 'Pagados' },
  { key: 'preparing', label: 'En preparación' },
  { key: 'shipped', label: 'Enviados' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'cancelled', label: 'Cancelados' },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireAdmin();
  const filters = orderFiltersFromParams(await searchParams);
  const [{ orders, total }, ...counts] = await Promise.all([
    queryOrders(supabase, filters, { page: filters.page, pageSize: PAGE_SIZE }),
    ...TABS.map((tab) => queryOrders(supabase, { ...filters, status: tab.key }, { countOnly: true })),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (changes: Partial<OrderFilters>) => `/admin/pedidos${ordersQueryString({ ...filters, page: 1, ...changes })}`;
  const hasFilters = Boolean(filters.q || filters.payment || filters.from || filters.to);

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Los pedidos entran como “por confirmar pago”. Al confirmar el pago cuentan como venta; al cancelar, el stock vuelve a la tienda."
        actions={
          <a href={`/api/admin/pedidos/export${ordersQueryString({ ...filters, page: 1 })}`} className={buttonClass.secondary}>
            <Download className="h-4 w-4" aria-hidden /> Exportar CSV
          </a>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Estado">
        {TABS.map((tab, index) => (
          <Link
            key={tab.label}
            href={href({ status: tab.key })}
            aria-current={filters.status === tab.key ? 'page' : undefined}
            className={cn(
              'border px-3 py-1.5 text-xs uppercase tracking-wider',
              filters.status === tab.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
              tab.key === 'pending_payment' && counts[index].total > 0 && filters.status !== tab.key && 'border-amber-500/60 text-amber-200'
            )}
          >
            {tab.label} <span className="tabular-nums opacity-70">{counts[index].total}</span>
          </Link>
        ))}
      </nav>

      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        {filters.status ? <input type="hidden" name="estado" value={filters.status} /> : null}
        <input name="q" defaultValue={filters.q} placeholder="Código, cliente, correo o teléfono" aria-label="Buscar pedidos" className={inputClass} />
        <select name="pago" defaultValue={filters.payment ?? ''} aria-label="Método de pago" className={inputClass}>
          <option value="">Todos los pagos</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={filters.from} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={filters.to} className={inputClass} />
        </label>
        <select name="orden" defaultValue={filters.sort} aria-label="Ordenar" className={inputClass}>
          <option value="recientes">Más recientes</option>
          <option value="antiguos">Más antiguos</option>
          <option value="total">Mayor total</option>
        </select>
        <button type="submit" className={buttonClass.secondary}>
          Filtrar
        </button>
      </form>
      {hasFilters ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {total} pedido(s) ·{' '}
          <Link href={`/admin/pedidos${ordersQueryString({ status: filters.status, sort: 'recientes', page: 1 })}`} className="underline">
            quitar filtros
          </Link>
        </p>
      ) : null}

      {orders.length ? (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Pedido</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Productos</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Pago</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => {
                const [first, ...rest] = order.items;
                return (
                  <tr key={order.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/pedidos/${order.id}`} className="font-mono font-medium hover:underline">
                        {order.code}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block">{order.customerName}</span>
                      <span className="text-xs text-muted-foreground">{order.customerPhone}</span>
                    </td>
                    <td className="max-w-64 px-3 py-2.5">
                      {first ? (
                        <span className="block truncate">
                          {[first.brandName, first.productName].filter(Boolean).join(' ')}
                          {visibleVariantLabel(first.variantLabel) ? ` · ${first.variantLabel}` : ''}
                          {first.quantity > 1 ? ` × ${first.quantity}` : ''}
                        </span>
                      ) : null}
                      {rest.length ? <span className="text-xs text-muted-foreground">+ {rest.length} más</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatPEN(order.total)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={ORDER_STATUS_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={hasFilters || filters.status ? 'Sin resultados' : 'Aún no hay pedidos'}>
          {hasFilters || filters.status ? 'Prueba con otros filtros.' : 'Los pedidos de la web aparecerán aquí.'}
        </EmptyState>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          {filters.page > 1 ? (
            <Link href={href({ page: filters.page - 1 })} className={buttonClass.secondary}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {filters.page} de {pages}
          </span>
          {filters.page < pages ? (
            <Link href={href({ page: filters.page + 1 })} className={buttonClass.secondary}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
