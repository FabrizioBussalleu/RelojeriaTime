import 'server-only';

import type { createSessionClient } from '@/lib/supabase/clients';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

export type StatsView = 'mes' | 'anio' | 'historico';
export type Granularity = 'day' | 'month' | 'year';

export type Period = {
  view: StatsView;
  key: string; // "2026-09", "2026" o "todo"
  label: string;
  from: string; // ISO, incluido
  to: string; // ISO, excluido
  granularity: Granularity;
  previous: { key: string; label: string; from: string; to: string } | null;
  prevKey: string | null; // navegación
  nextKey: string | null;
};

const LIMA_OFFSET = '-05:00'; // Perú no tiene horario de verano.
const monthLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const iso = (year: number, month: number) => new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00${LIMA_OFFSET}`).toISOString();

export function limaToday() {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).split('-').map(Number);
  return { year, month };
}

function monthPeriod(year: number, month: number) {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    label: monthLabel.format(new Date(Date.UTC(year, month - 1, 1))),
    from: iso(year, month),
    to: iso(next.year, next.month),
  };
}

function yearPeriod(year: number) {
  return { key: String(year), label: String(year), from: iso(year, 1), to: iso(year + 1, 1) };
}

export async function resolvePeriod(supabase: SessionClient, view: string | undefined, key: string | undefined): Promise<Period> {
  const today = limaToday();
  if (view === 'historico') {
    const { data: first } = await supabase.rpc('first_sale_at');
    const start = first ? new Date(first) : new Date();
    const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(start).split('-').map(Number);
    const months = (today.year - year) * 12 + (today.month - month) + 1;
    const end = today.month === 12 ? { year: today.year + 1, month: 1 } : { year: today.year, month: today.month + 1 };
    return {
      view: 'historico',
      key: 'todo',
      label: 'Desde la primera venta',
      from: iso(year, month),
      to: iso(end.year, end.month),
      granularity: months > 36 ? 'year' : 'month',
      previous: null,
      prevKey: null,
      nextKey: null,
    };
  }
  if (view === 'anio') {
    const requested = Number(key);
    const year = Number.isInteger(requested) && requested >= 2000 && requested <= today.year ? requested : today.year;
    return {
      view: 'anio',
      ...yearPeriod(year),
      granularity: 'month',
      previous: yearPeriod(year - 1),
      prevKey: String(year - 1),
      nextKey: year < today.year ? String(year + 1) : null,
    };
  }
  const match = /^(\d{4})-(\d{2})$/.exec(key ?? '');
  let year = today.year;
  let month = today.month;
  if (match) {
    const [candidateYear, candidateMonth] = [Number(match[1]), Number(match[2])];
    if (candidateMonth >= 1 && candidateMonth <= 12 && (candidateYear < today.year || (candidateYear === today.year && candidateMonth <= today.month))) {
      year = candidateYear;
      month = candidateMonth;
    }
  }
  const previousMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const isCurrent = year === today.year && month === today.month;
  return {
    view: 'mes',
    ...monthPeriod(year, month),
    granularity: 'day',
    previous: monthPeriod(previousMonth.year, previousMonth.month),
    prevKey: monthPeriod(previousMonth.year, previousMonth.month).key,
    nextKey: isCurrent ? null : monthPeriod(nextMonth.year, nextMonth.month).key,
  };
}

export type Kpis = { revenue: number; orders: number; units: number; avgTicket: number };
export type SeriesPoint = { bucket: string; revenue: number; orders: number };
export type BreakdownRow = { label: string; revenue: number; units: number; orders: number };

export async function getKpis(supabase: SessionClient, from: string, to: string): Promise<Kpis> {
  const { data, error } = await supabase.rpc('sales_kpis', { p_from: from, p_to: to });
  if (error) throw error;
  const row = data?.[0];
  return { revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0), units: Number(row?.units ?? 0), avgTicket: Number(row?.avg_ticket ?? 0) };
}

export async function getSeries(supabase: SessionClient, granularity: Granularity, from: string, to: string): Promise<SeriesPoint[]> {
  const { data, error } = await supabase.rpc('sales_series', { p_granularity: granularity, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((row) => ({ bucket: row.bucket, revenue: Number(row.revenue), orders: Number(row.orders) }));
}

export async function getBreakdown(supabase: SessionClient, dimension: 'product' | 'brand' | 'category' | 'payment_method', from: string, to: string, limit = 8): Promise<BreakdownRow[]> {
  const { data, error } = await supabase.rpc('sales_breakdown', { p_dimension: dimension, p_from: from, p_to: to, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((row) => ({ label: row.label, revenue: Number(row.revenue), units: Number(row.units), orders: Number(row.orders) }));
}
