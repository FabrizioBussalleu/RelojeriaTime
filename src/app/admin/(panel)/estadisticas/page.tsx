import Link from 'next/link';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { SalesChart, type ChartPoint } from '@/components/admin/stats/SalesChart';
import { Card, EmptyState, PageHeader } from '@/components/admin/ui';
import { getBreakdown, getKpis, getSeries, resolvePeriod, type BreakdownRow, type Kpis, type SeriesPoint } from '@/lib/admin/stats';
import { requireAdmin } from '@/lib/auth';
import { formatPEN, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/store';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Estadísticas' };

const VIEWS = [
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
  { key: 'historico', label: 'Histórico' },
] as const;

const dayLabel = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortMonth = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const utc = (bucket: string) => new Date(`${bucket}T00:00:00Z`);

function Delta({ current, previous, name }: { current: number; previous: number; name: string }) {
  if (!previous) return <p className="mt-1 text-xs text-muted-foreground">{current ? `Sin ventas en ${name}` : '—'}</p>;
  const change = (current - previous) / previous;
  const up = change >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className={cn('mt-1 flex items-center gap-1 text-xs', up ? 'text-[#0ca30c]' : 'text-red-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? '+' : '−'}
      {Math.abs(change * 100).toFixed(change !== 0 && Math.abs(change) < 0.1 ? 1 : 0)}%<span className="text-muted-foreground"> vs {name}</span>
    </p>
  );
}

function StatTile({ label, value, current, previous, previousName }: { label: string; value: string; current: number; previous: number | null; previousName: string | null }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {previous !== null && previousName ? <Delta current={current} previous={previous} name={previousName} /> : null}
    </div>
  );
}

function BreakdownList({ title, rows, formatLabel = (label) => label, empty }: { title: string; rows: BreakdownRow[]; formatLabel?: (label: string) => string; empty: string }) {
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  return (
    <Card title={title}>
      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{formatLabel(row.label)}</span>
                <span className="shrink-0 tabular-nums">{formatPEN(row.revenue)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2 rounded-r-[4px] bg-[#3987e5]" style={{ width: `${Math.max(2, (row.revenue / max) * 100)}%` }} aria-hidden />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.units} unidad(es) · {row.orders} pedido(s)
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}

function chartData(view: string, current: SeriesPoint[], previous: SeriesPoint[] | null, granularity: string): ChartPoint[] {
  return current.map((point, index) => {
    const date = utc(point.bucket);
    const before = previous?.[index];
    const label = granularity === 'day' ? String(date.getUTCDate()) : granularity === 'month' ? (view === 'historico' ? `${shortMonth.format(date).replace('.', '')} ${String(date.getUTCFullYear()).slice(2)}` : shortMonth.format(date).replace('.', '')) : String(date.getUTCFullYear());
    const fullLabel = granularity === 'day' ? dayLabel.format(date) : granularity === 'month' ? longMonth.format(date) : String(date.getUTCFullYear());
    return {
      label,
      fullLabel,
      revenue: point.revenue,
      orders: point.orders,
      previous: before ? before.revenue : null,
      previousLabel: before ? (granularity === 'day' ? dayLabel.format(utc(before.bucket)) : longMonth.format(utc(before.bucket))) : null,
    };
  });
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ vista?: string; periodo?: string }> }) {
  const { supabase } = await requireAdmin();
  const { vista, periodo } = await searchParams;
  const period = await resolvePeriod(supabase, vista, periodo);
  const previousName = period.view === 'mes' ? 'el mes anterior' : period.view === 'anio' ? 'el año anterior' : null;

  const [kpis, previousKpis, series, previousSeries, products, brands, categories, payments] = await Promise.all([
    getKpis(supabase, period.from, period.to),
    period.previous ? getKpis(supabase, period.previous.from, period.previous.to) : Promise.resolve(null as Kpis | null),
    getSeries(supabase, period.granularity, period.from, period.to),
    period.previous ? getSeries(supabase, period.granularity, period.previous.from, period.previous.to) : Promise.resolve(null),
    getBreakdown(supabase, 'product', period.from, period.to, 10),
    getBreakdown(supabase, 'brand', period.from, period.to),
    getBreakdown(supabase, 'category', period.from, period.to),
    getBreakdown(supabase, 'payment_method', period.from, period.to),
  ]);
  const data = chartData(period.view, series, previousSeries, period.granularity);
  const link = (view: string, key?: string | null) => `/admin/estadisticas?vista=${view}${key ? `&periodo=${key}` : ''}`;

  return (
    <>
      <PageHeader title="Estadísticas" description="Ventas = pedidos con pago confirmado, no cancelados, fechados el día del pago (hora de Lima)." />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <nav className="flex gap-2" aria-label="Vista">
          {VIEWS.map((option) => (
            <Link
              key={option.key}
              href={link(option.key)}
              aria-current={period.view === option.key ? 'page' : undefined}
              className={cn('border px-3 py-1.5 text-xs uppercase tracking-wider', period.view === option.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          {period.prevKey ? (
            <Link href={link(period.view, period.prevKey)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          <span className="min-w-40 text-center text-sm capitalize">{period.label}</span>
          {period.nextKey ? (
            <Link href={link(period.view, period.nextKey)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Período siguiente">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : period.prevKey ? (
            <span className="w-8" aria-hidden />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Ingresos" value={formatPEN(kpis.revenue)} current={kpis.revenue} previous={previousKpis?.revenue ?? null} previousName={previousName} />
        <StatTile label="Pedidos pagados" value={String(kpis.orders)} current={kpis.orders} previous={previousKpis?.orders ?? null} previousName={previousName} />
        <StatTile label="Ticket promedio" value={formatPEN(kpis.avgTicket)} current={kpis.avgTicket} previous={previousKpis?.avgTicket ?? null} previousName={previousName} />
        <StatTile label="Relojes vendidos" value={String(kpis.units)} current={kpis.units} previous={previousKpis?.units ?? null} previousName={previousName} />
      </div>

      <Card title={period.granularity === 'day' ? 'Ventas por día' : period.granularity === 'month' ? 'Ventas por mes' : 'Ventas por año'} className="mt-6">
        {kpis.orders || (previousKpis?.orders ?? 0) ? (
          <>
            <SalesChart data={data} previousName={previousName ? previousName.replace(/^el /, 'El ') : null} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver como tabla</summary>
              <div className="mt-2 max-h-72 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Período</th>
                      <th className="py-1 pr-3 text-right font-medium">Ventas</th>
                      <th className="py-1 pr-3 text-right font-medium">Pedidos</th>
                      {previousName ? <th className="py-1 text-right font-medium">Período anterior</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {data.map((point) => (
                      <tr key={point.fullLabel}>
                        <td className="py-1 pr-3">{point.fullLabel}</td>
                        <td className="py-1 pr-3 text-right">{formatPEN(point.revenue)}</td>
                        <td className="py-1 pr-3 text-right">{point.orders}</td>
                        {previousName ? <td className="py-1 text-right text-muted-foreground">{point.previous === null ? '—' : formatPEN(point.previous)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <EmptyState title="Sin ventas en este período">Cuando confirmes el pago de un pedido, aparecerá aquí.</EmptyState>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownList title="Relojes más vendidos" rows={products} empty="Sin ventas en este período." />
        <BreakdownList title="Por marca" rows={brands} empty="Sin ventas en este período." />
        <BreakdownList title="Por categoría" rows={categories} empty="Sin ventas en este período." />
        <BreakdownList title="Por método de pago" rows={payments} formatLabel={(label) => PAYMENT_METHOD_LABELS[label as PaymentMethod] ?? label} empty="Sin ventas en este período." />
      </div>
    </>
  );
}
