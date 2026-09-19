'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import type { CampaignFormState, SegmentCount } from '@/app/admin/(panel)/campanas/actions';
import { CUSTOMER_SOURCE_LABELS } from '@/lib/crm/labels';
import { compactFilters, describeFilters, type SegmentFilters } from '@/lib/crm/segments';
import { renderTemplate, TEMPLATE_EXAMPLE_VALUES } from '@/lib/crm/templates';
import { GENDER_LABELS } from '@/lib/store';
import { cn } from '@/lib/utils';
import { buttonClass, Field, inputClass, Notice } from './ui';

type Template = { id: string; name: string; body: string; footer: string | null; buttonText: string | null; approved: boolean; status: string };

// Segmentos pensados para una relojería: recompra, leads, carritos sin pagar, clientes top.
const PRESETS: { label: string; hint: string; filters: SegmentFilters }[] = [
  { label: 'Todos', hint: 'Todos los que aceptan novedades', filters: { audiencia: 'todos', excluir_campana_dias: 7 } },
  { label: 'Recompra', hint: 'Compraron, pero no en los últimos 6 meses', filters: { audiencia: 'compradores', sin_compra_dias: 180, excluir_campana_dias: 7 } },
  { label: 'Aún no compran', hint: 'Registrados o que escribieron, sin compras', filters: { audiencia: 'sin_compras', excluir_campana_dias: 7 } },
  { label: 'Pedido sin pagar', hint: 'Dejaron un pedido sin pagar en los últimos 7 días', filters: { audiencia: 'todos', pedido_sin_pagar_dias: 7, excluir_campana_dias: 3 } },
  { label: 'Mejores clientes', hint: 'Gasto total desde S/ 1,500', filters: { audiencia: 'compradores', gasto_min: 1500, excluir_campana_dias: 7 } },
  { label: 'Conversaron hace poco', hint: 'Escribieron por WhatsApp en los últimos 30 días', filters: { audiencia: 'todos', conversacion_dias: 30, excluir_campana_dias: 7 } },
];

function NumberFilter({ label, hint, value, onChange, prefix }: { label: string; hint?: string; value: number | undefined; onChange: (value: number | undefined) => void; prefix?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-sm text-muted-foreground">{prefix}</span> : null}
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Math.max(1, Math.round(Number(event.target.value))))}
          className={inputClass}
          placeholder="—"
        />
      </div>
    </Field>
  );
}

function Chips<T extends string>({ options, selected, onChange, label }: { options: { value: T; label: string }[]; selected: T[] | undefined; onChange: (value: T[]) => void; label: string }) {
  const current = selected ?? [];
  return (
    <fieldset>
      <legend className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = current.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? current.filter((value) => value !== option.value) : [...current, option.value])}
              className={cn('border px-3 py-1.5 text-sm', active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {option.label}
            </button>
          );
        })}
        {!options.length ? <span className="text-sm text-muted-foreground">Sin opciones todavía.</span> : null}
      </div>
    </fieldset>
  );
}

export function CampaignForm({
  action,
  countAction,
  templates,
  brands,
  tags,
  quota,
  initial,
}: {
  action: (state: CampaignFormState, formData: FormData) => Promise<CampaignFormState>;
  countAction: (filters: SegmentFilters) => Promise<SegmentCount>;
  templates: Template[];
  brands: string[];
  tags: string[];
  quota: { limit: number; remaining: number };
  initial: { name: string; templateId: string; filters: SegmentFilters };
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [name, setName] = useState(initial.name);
  const [templateId, setTemplateId] = useState(initial.templateId || templates.find((template) => template.approved)?.id || '');
  const [filters, setFilters] = useState<SegmentFilters>(initial.filters);
  const [count, setCount] = useState<SegmentCount | null>(null);
  const [counting, startCounting] = useTransition();
  const set = <K extends keyof SegmentFilters>(key: K, value: SegmentFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  const compact = useMemo(() => compactFilters(filters), [filters]);
  const filtersJson = JSON.stringify(compact);
  useEffect(() => {
    const timer = setTimeout(() => startCounting(async () => setCount(await countAction(JSON.parse(filtersJson)))), 350);
    return () => clearTimeout(timer);
  }, [filtersJson, countAction]);

  const template = templates.find((item) => item.id === templateId);
  const recipients = count && 'contactable' in count ? count.contactable : null;
  const approvedTemplates = templates.filter((item) => item.approved);

  return (
    <form action={formAction} className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <input type="hidden" name="filters" value={filtersJson} />
      <div className="space-y-6">
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la campaña">
            <input name="name" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Ej.: Novedades Casio octubre" required maxLength={120} />
          </Field>
          <Field label="Plantilla" hint={approvedTemplates.length ? undefined : 'No hay plantillas aprobadas todavía.'}>
            <select name="template_id" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className={inputClass} required>
              <option value="">Elige una plantilla</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.approved}>
                  {item.name}
                  {item.approved ? '' : ` (${item.status})`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <section className="space-y-4 border border-border p-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Segmentos rápidos</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button key={preset.label} type="button" title={preset.hint} onClick={() => setFilters(preset.filters)} className="border border-border px-3 py-1.5 text-sm hover:border-foreground">
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Audiencia</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'todos', label: 'Todos' },
                { value: 'compradores', label: 'Ya compraron' },
                { value: 'sin_compras', label: 'Aún no compran' },
              ].map((option) => (
                <label key={option.value} className={cn('cursor-pointer border px-3 py-1.5 text-sm', (filters.audiencia ?? 'todos') === option.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}>
                  <input type="radio" className="sr-only" checked={(filters.audiencia ?? 'todos') === option.value} onChange={() => set('audiencia', option.value as SegmentFilters['audiencia'])} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Chips label="Marcas (compradas o de interés)" options={brands.map((brand) => ({ value: brand, label: brand }))} selected={filters.marcas} onChange={(value) => set('marcas', value)} />
          <Chips
            label="Relojes de"
            options={(Object.keys(GENDER_LABELS) as (keyof typeof GENDER_LABELS)[]).map((value) => ({ value, label: GENDER_LABELS[value] }))}
            selected={filters.generos}
            onChange={(value) => set('generos', value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberFilter label="Sin comprar hace más de (días)" hint="Para recompra o reactivar clientes." value={filters.sin_compra_dias} onChange={(value) => set('sin_compra_dias', value)} />
            <NumberFilter label="Compraron en los últimos (días)" value={filters.compra_reciente_dias} onChange={(value) => set('compra_reciente_dias', value)} />
            <NumberFilter label="Gasto total desde" prefix="S/" value={filters.gasto_min} onChange={(value) => set('gasto_min', value)} />
            <NumberFilter label="Escribieron en los últimos (días)" value={filters.conversacion_dias} onChange={(value) => set('conversacion_dias', value)} />
            <NumberFilter label="Pedido sin pagar en los últimos (días)" value={filters.pedido_sin_pagar_dias} onChange={(value) => set('pedido_sin_pagar_dias', value)} />
            <NumberFilter label="No enviar a quien recibió campaña en (días)" hint="Evita saturar y que marquen como spam." value={filters.excluir_campana_dias} onChange={(value) => set('excluir_campana_dias', value)} />
          </div>

          <Chips
            label="Origen"
            options={(Object.keys(CUSTOMER_SOURCE_LABELS) as (keyof typeof CUSTOMER_SOURCE_LABELS)[]).map((value) => ({ value, label: CUSTOMER_SOURCE_LABELS[value] }))}
            selected={filters.origen}
            onChange={(value) => set('origen', value)}
          />
          {tags.length ? <Chips label="Etiquetas" options={tags.map((tag) => ({ value: tag, label: tag }))} selected={filters.etiquetas} onChange={(value) => set('etiquetas', value)} /> : null}
        </section>
      </div>

      <aside aria-label="Resumen del envío" className="space-y-4">
        <div className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Destinatarios</p>
          <p className="mt-1 flex items-center gap-2 font-display text-4xl">
            {recipients ?? '—'}
            {counting ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Calculando" /> : null}
          </p>
          {count && 'error' in count ? <p className="text-sm text-red-400">{count.error}</p> : null}
          {count && 'withoutConsent' in count && count.withoutConsent ? (
            <p className="mt-1 text-xs text-muted-foreground">{count.withoutConsent} más cumplen los filtros pero no aceptaron novedades: no se les envía.</p>
          ) : null}
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {describeFilters(compact).map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          {recipients !== null && recipients > quota.remaining ? (
            <p className="mt-3 text-xs text-amber-200">
              Hoy quedan {quota.remaining} de {quota.limit} envíos (límite diario configurado). El resto sale en los días siguientes, automáticamente.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Costo referencial: WhatsApp cobra cada plantilla de marketing entregada (en Perú, unos US$ 0.06–0.07 c/u según la tarifa vigente de Meta)
            {recipients ? ` ≈ US$ ${(recipients * 0.07).toFixed(2)} como máximo.` : '.'} Se envía de 9:00 a 21:00.
          </p>
        </div>

        {template ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Vista previa (cliente: Ana)</p>
            <div className="border border-border bg-[#0b141a] p-4">
              <div className="bg-[#1f2c34] px-3 py-2 text-sm text-[#e9edef]">
                <p className="whitespace-pre-line">{renderTemplate(template.body, TEMPLATE_EXAMPLE_VALUES)}</p>
                {template.footer ? <p className="mt-2 text-xs text-[#8696a0]">{template.footer}</p> : null}
              </div>
              {template.buttonText ? (
                <div className="mt-px flex items-center justify-center gap-1.5 bg-[#1f2c34] py-2 text-sm text-[#53bdeb]">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {template.buttonText}
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Si el cliente responde, se abre la conversación y la IA le muestra relojes con fotos y precios reales.</p>
          </div>
        ) : (
          <Notice tone="warning">
            Necesitas una plantilla aprobada por WhatsApp.{' '}
            <Link href="/admin/plantillas/nueva" className="underline">
              Crear plantilla
            </Link>
          </Notice>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="draft" className={buttonClass.secondary} disabled={pending}>
            Guardar borrador
          </button>
          <button
            type="submit"
            name="intent"
            value="send"
            className={buttonClass.primary}
            disabled={pending || !template?.approved || !recipients}
            onClick={(event) => {
              if (!window.confirm(`¿Enviar "${name || 'la campaña'}" a ${recipients} cliente(s)? No se puede deshacer.`)) event.preventDefault();
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Enviar ahora
          </button>
        </div>
      </aside>
    </form>
  );
}
