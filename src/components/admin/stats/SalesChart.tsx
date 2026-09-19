'use client';

// Ventas del período (columnas, azul) con el período anterior como contexto (línea gris).
// Patrón de énfasis: un color para lo que importa, gris para la referencia. Un solo eje (S/).
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

export type ChartPoint = { label: string; fullLabel: string; revenue: number; orders: number; previous: number | null; previousLabel: string | null };

const ACCENT = '#3987e5';
const ACCENT_HOVER = '#5598e7';
const CONTEXT = '#898781';
const GRID = '#2c2c2a';
const AXIS = '#383835';
const MUTED = '#898781';

const pen = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const compact = new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 });

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ChartPoint;
  return (
    <div className="border border-white/10 bg-[#1a1a19] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-[#c3c2b7]">{point.fullLabel}</p>
      <p className="flex items-center gap-2">
        <span className="h-0.5 w-3" style={{ background: ACCENT }} aria-hidden />
        <strong className="text-sm text-white">{pen.format(point.revenue)}</strong>
        <span className="text-[#c3c2b7]">· {point.orders} pedido(s)</span>
      </p>
      {point.previous !== null ? (
        <p className="mt-1 flex items-center gap-2">
          <span className="h-0.5 w-3" style={{ background: CONTEXT }} aria-hidden />
          <strong className="text-white">{pen.format(point.previous)}</strong>
          <span className="text-[#c3c2b7]">{point.previousLabel}</span>
        </p>
      ) : null}
    </div>
  );
}

export function SalesChart({ data, previousName }: { data: ChartPoint[]; previousName: string | null }) {
  const hasPrevious = Boolean(previousName) && data.some((point) => point.previous !== null);
  return (
    <div>
      {hasPrevious ? (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-[#c3c2b7]" aria-hidden>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: ACCENT }} /> Este período
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4" style={{ background: CONTEXT }} /> {previousName}
          </span>
        </div>
      ) : null}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: MUTED, fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} width={56} tickFormatter={(value: number) => (value ? `S/ ${compact.format(value)}` : '0')} allowDecimals={false} />
            <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="revenue" name="Ventas" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} activeBar={{ fill: ACCENT_HOVER }} isAnimationActive={false} />
            {hasPrevious ? <Line dataKey="previous" name={previousName ?? ''} stroke={CONTEXT} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#141414', strokeWidth: 2, fill: CONTEXT }} strokeLinejoin="round" strokeLinecap="round" connectNulls isAnimationActive={false} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
