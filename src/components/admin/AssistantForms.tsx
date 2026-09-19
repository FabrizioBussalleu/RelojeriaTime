'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PreviewState, SettingsState } from '@/app/admin/(panel)/asistente/actions';
import { ASSISTANT_MODEL_LABELS } from '@/lib/crm/labels';
import { buttonClass, Field, inputClass, Notice } from './ui';

export type SettingsValues = {
  enabled: boolean;
  model: string;
  effort: string;
  max_products: number;
  max_photos_per_product: number;
  photos_mode: string;
  resume_ai_after_hours: number;
  instructions: string;
  handoff_message: string;
  daily_campaign_limit: number;
};

export function AssistantSettingsForm({ action, initial }: { action: (state: SettingsState, formData: FormData) => Promise<SettingsState>; initial: SettingsValues }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.saved ? <Notice tone="success">Ajustes guardados.</Notice> : null}

      <label className="flex items-start gap-3 border border-border p-3 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="mt-1 h-4 w-4 accent-white" />
        <span>
          Asistente activado
          <span className="block text-xs text-muted-foreground">Apagado, todos los mensajes quedan para el equipo como “requiere atención”.</span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Modelo" hint="Opus 5 entiende mejor pedidos ambiguos; Haiku 4.5 cuesta alrededor de una décima parte, con respuestas más simples.">
          <select name="model" defaultValue={initial.model} className={inputClass}>
            {Object.entries(ASSISTANT_MODEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Esfuerzo" hint="Más esfuerzo: respuestas más cuidadas, algo más lentas y caras. No aplica a Haiku.">
          <select name="effort" defaultValue={initial.effort} className={inputClass}>
            <option value="low">Bajo (más rápido)</option>
            <option value="medium">Medio (recomendado)</option>
            <option value="high">Alto</option>
          </select>
        </Field>
        <Field label="Relojes por respuesta" hint="Máximo que muestra en cada respuesta.">
          <input type="number" name="max_products" min={1} max={6} defaultValue={initial.max_products} className={inputClass} />
        </Field>
        <Field label="Fotos por reloj" hint="Cada foto es un mensaje de WhatsApp (tiene costo desde oct. 2026).">
          <input type="number" name="max_photos_per_product" min={1} max={10} defaultValue={initial.max_photos_per_product} className={inputClass} />
        </Field>
        <Field label="Nombre y precio" hint="Como texto de la primera foto ahorra un mensaje por reloj.">
          <select name="photos_mode" defaultValue={initial.photos_mode} className={inputClass}>
            <option value="caption">En la primera foto (recomendado)</option>
            <option value="separate">En un mensaje aparte, antes de las fotos</option>
          </select>
        </Field>
        <Field label="La IA retoma tras (horas)" hint="Horas sin mensajes del equipo para que la IA vuelva a responder sola.">
          <input type="number" name="resume_ai_after_hours" min={1} max={168} defaultValue={initial.resume_ai_after_hours} className={inputClass} />
        </Field>
        <Field label="Límite diario de campañas" hint="WhatsApp limita los contactos nuevos por día según la calidad del número (250 al inicio).">
          <input type="number" name="daily_campaign_limit" min={1} max={100000} defaultValue={initial.daily_campaign_limit} className={inputClass} />
        </Field>
      </div>

      <Field label="Indicaciones del equipo" hint="Políticas y datos que la IA debe conocer: garantía, envíos, horarios, tono. No pongas precios: los toma del catálogo.">
        <textarea
          name="instructions"
          defaultValue={initial.instructions}
          rows={6}
          maxLength={4000}
          className={inputClass}
          placeholder={'Ej.:\n- Todos los relojes tienen garantía de 1 año.\n- Envíos a todo el Perú; Lima en 24-48 h.\n- Atendemos de lunes a sábado de 10 a 7.'}
        />
      </Field>
      <Field label="Mensaje al derivar por un error" hint="Se envía si la IA no puede responder.">
        <input name="handoff_message" defaultValue={initial.handoff_message} maxLength={500} className={inputClass} />
      </Field>

      <button type="submit" className={buttonClass.primary} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Guardar ajustes
      </button>
    </form>
  );
}

// Referencia de precios por millón de tokens (entrada/salida) para estimar el costo de cada respuesta.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function AssistantPlayground({ action, configured }: { action: (state: PreviewState, formData: FormData) => Promise<PreviewState>; configured: boolean }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const result = state.result;
  const price = result ? PRICES[result.model] : undefined;
  const cost =
    result && price
      ? (result.usage.input * price.input + result.usage.cacheRead * price.input * 0.1 + result.usage.cacheWrite * price.input * 1.25 + result.usage.output * price.output) / 1_000_000
      : null;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <Field label="Mensaje del cliente">
          <textarea name="message" rows={3} defaultValue="Hola, ¿qué relojes de hombre tienes hasta 500 soles?" className={inputClass} disabled={!configured} />
        </Field>
        <button type="submit" className={buttonClass.secondary} disabled={pending || !configured}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Pensando…' : 'Probar respuesta'}
        </button>
        {!configured ? <p className="text-xs text-muted-foreground">Disponible cuando se configure la clave de Anthropic.</p> : null}
      </form>

      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {result && !result.ok ? <Notice tone="warning">El asistente no respondió: {result.reason}. En WhatsApp se enviaría el mensaje de derivación.</Notice> : null}
      {result?.ok ? (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Mensajes que se enviarían, en orden</p>
          <ol className="space-y-2 border border-border bg-[#0b141a] p-3">
            {result.parts.map((part, index) => (
              <li key={index} className="max-w-sm bg-[#005c4b] px-3 py-2 text-sm text-[#e9edef]">
                {part.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de la foto que recibe el cliente
                  <img src={part.src} alt="" className="mb-2 max-h-48 w-auto" />
                ) : null}
                {part.kind === 'text' ? <p className="whitespace-pre-line">{part.body}</p> : part.caption ? <p className="whitespace-pre-line">{part.caption}</p> : null}
              </li>
            ))}
          </ol>
          {result.reply.derivar_a_humano ? <Notice tone="info">Derivaría al equipo: {result.reply.motivo_derivacion}</Notice> : null}
          {result.droppedIds.length ? <p className="text-xs text-amber-200">Se descartaron {result.droppedIds.length} producto(s) inexistentes o agotados que propuso el modelo.</p> : null}
          <p className="text-xs text-muted-foreground">
            {result.usage.requests} consulta(s) al modelo · {result.usage.input + result.usage.cacheRead + result.usage.cacheWrite} tokens de entrada ({result.usage.cacheRead} desde caché) · {result.usage.output} de salida
            {cost !== null ? ` · ≈ US$ ${cost.toFixed(4)}` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
