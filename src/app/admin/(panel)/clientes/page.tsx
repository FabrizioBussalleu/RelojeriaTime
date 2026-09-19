import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, buttonClass, EmptyState, formatDate, inputClass, PageHeader, timeAgo } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { CUSTOMER_SOURCE_LABELS, type CustomerSource } from '@/lib/crm/labels';
import { displayPhone } from '@/lib/phone';
import { formatPEN } from '@/lib/store';

export const metadata = { title: 'Clientes' };

const PAGE_SIZE = 50;
const SORTS = {
  recientes: { column: 'created_at', label: 'Más recientes' },
  gasto: { column: 'total_spent', label: 'Mayor gasto' },
  ultima_compra: { column: 'last_paid_at', label: 'Última compra' },
  ultimo_mensaje: { column: 'last_inbound_at', label: 'Último mensaje' },
} as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const q = single(params.q)?.trim() ?? '';
  const source = single(params.origen);
  const consent = single(params.consentimiento);
  const buyers = single(params.compras);
  const tag = single(params.etiqueta)?.trim();
  const sort = SORTS[single(params.orden) as keyof typeof SORTS] ? (single(params.orden) as keyof typeof SORTS) : 'recientes';
  const page = Math.max(1, Number(single(params.pagina)) || 1);

  let query = supabase
    .from('customer_overview')
    .select('id, display_name, phone, email, source, whatsapp_opt_in, opt_out_at, paid_orders_count, total_spent, last_paid_at, last_inbound_at, tags, needs_attention, created_at', { count: 'exact' });
  if (q) {
    // Caracteres que tienen significado en el filtro "or" de PostgREST.
    const term = q.replace(/[,()*%\\]/g, ' ').trim();
    const digits = q.replace(/\D/g, '');
    const clauses = [`name.ilike.*${term}*`, `whatsapp_name.ilike.*${term}*`, `email.ilike.*${term}*`, `document.ilike.*${term}*`];
    if (digits.length >= 3) clauses.push(`phone.like.*${digits}*`);
    query = query.or(clauses.join(','));
  }
  if (source && source in CUSTOMER_SOURCE_LABELS) query = query.eq('source', source);
  if (consent === 'si') query = query.eq('whatsapp_opt_in', true).is('opt_out_at', null);
  if (consent === 'no') query = query.or('whatsapp_opt_in.eq.false,opt_out_at.not.is.null');
  if (buyers === 'si') query = query.gt('paid_orders_count', 0);
  if (buyers === 'no') query = query.eq('paid_orders_count', 0);
  if (tag) query = query.contains('tags', [tag.toLowerCase()]);
  const { data: customers, count } = await query
    .order(SORTS[sort].column, { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const next = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (typeof value === 'string' && key !== 'pagina' ? [[key, value]] : [])));
    next.set('pagina', String(target));
    return `/admin/clientes?${next}`;
  };
  const filtered = Boolean(q || source || consent || buyers || tag);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Se registran solos al comprar en la web, al registrarse o al escribir por WhatsApp. Un cliente por número de WhatsApp."
        actions={
          <Link href="/admin/clientes/nuevo" className={buttonClass.primary}>
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo cliente
          </Link>
        }
      />

      <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(5,1fr)_auto]" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, teléfono, correo o DNI" className={inputClass} aria-label="Buscar clientes" />
        <select name="origen" defaultValue={source ?? ''} className={inputClass} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {Object.entries(CUSTOMER_SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="consentimiento" defaultValue={consent ?? ''} className={inputClass} aria-label="Consentimiento">
          <option value="">Con y sin consentimiento</option>
          <option value="si">Aceptan novedades</option>
          <option value="no">No aceptan novedades</option>
        </select>
        <select name="compras" defaultValue={buyers ?? ''} className={inputClass} aria-label="Compras">
          <option value="">Con y sin compras</option>
          <option value="si">Ya compraron</option>
          <option value="no">Aún no compran</option>
        </select>
        <input name="etiqueta" defaultValue={tag ?? ''} placeholder="Etiqueta" className={inputClass} aria-label="Etiqueta" />
        <select name="orden" defaultValue={sort} className={inputClass} aria-label="Ordenar por">
          {Object.entries(SORTS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass.secondary}>
          Filtrar
        </button>
      </form>

      <p className="mb-3 text-xs text-muted-foreground">
        {total} {total === 1 ? 'cliente' : 'clientes'}
        {filtered ? (
          <>
            {' '}
            ·{' '}
            <Link href="/admin/clientes" className="underline">
              quitar filtros
            </Link>
          </>
        ) : null}
      </p>

      {customers?.length ? (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 text-right font-medium">Compras</th>
                <th className="px-3 py-2 text-right font-medium">Gasto</th>
                <th className="px-3 py-2 font-medium">Última compra</th>
                <th className="px-3 py-2 font-medium">Último mensaje</th>
                <th className="px-3 py-2 font-medium">Novedades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((customer) => {
                const contactable = customer.whatsapp_opt_in && !customer.opt_out_at;
                return (
                  <tr key={customer.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/clientes/${customer.id}`} className="block font-medium hover:underline">
                        {customer.display_name ?? 'Sin nombre'}
                      </Link>
                      <span className="text-xs text-muted-foreground">{displayPhone(customer.phone!)}</span>
                      {customer.tags?.length ? (
                        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                          {customer.tags.slice(0, 3).map((item) => (
                            <Badge key={item}>{item}</Badge>
                          ))}
                        </span>
                      ) : null}
                      {customer.needs_attention ? <Badge tone="warning" className="ml-2">Atención</Badge> : null}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{CUSTOMER_SOURCE_LABELS[customer.source as CustomerSource] ?? customer.source}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{customer.paid_orders_count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{customer.total_spent ? formatPEN(customer.total_spent) : '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(customer.last_paid_at)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{customer.last_inbound_at ? timeAgo(customer.last_inbound_at) : '—'}</td>
                    <td className="px-3 py-2.5">{contactable ? <Badge tone="success">Sí</Badge> : customer.opt_out_at ? <Badge tone="danger">Baja</Badge> : <Badge>No</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={filtered ? 'Sin resultados' : 'Aún no hay clientes'}>
          {filtered ? 'Prueba con otros filtros.' : 'Aparecerán cuando alguien compre en la web, se registre o escriba por WhatsApp. También puedes agregarlos a mano.'}
        </EmptyState>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClass.secondary}>Anterior</Link> : <span />}
          <span className="text-muted-foreground">
            Página {page} de {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className={buttonClass.secondary}>Siguiente</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
