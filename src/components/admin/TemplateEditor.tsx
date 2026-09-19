'use client';

import { useActionState, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { TemplateFormState } from '@/app/admin/(panel)/plantillas/actions';
import { renderTemplate, TEMPLATE_EXAMPLE_VALUES, unknownVariables, validateWhatsAppTemplate } from '@/lib/crm/templates';
import { cn } from '@/lib/utils';
import { buttonClass, Field, inputClass, Notice } from './ui';

export type TemplateValues = {
  name: string;
  kind: 'chat' | 'campaign';
  body: string;
  footer: string;
  buttonText: string;
  buttonUrl: string;
  category: 'MARKETING' | 'UTILITY';
  isDefault: boolean;
};

type Action = (state: TemplateFormState, formData: FormData) => Promise<TemplateFormState>;

export function TemplateFeedback({ state }: { state: TemplateFormState }) {
  if (state.error) {
    return (
      <Notice tone="danger">
        {state.error}
        {state.errors?.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </Notice>
    );
  }
  return state.notice ? <Notice tone="success">{state.notice}</Notice> : null;
}

export function TemplateEditor({ action, initial, siteUrl, locked }: { action: Action; initial: TemplateValues; siteUrl: string; locked?: boolean }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [values, setValues] = useState(initial);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof TemplateValues>(key: K, value: TemplateValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const campaign = values.kind === 'campaign';
  const issues = campaign
    ? validateWhatsAppTemplate({ body: values.body, footer: values.footer, buttonText: values.buttonText, buttonUrl: values.buttonUrl || siteUrl })
    : unknownVariables(values.body).map((name) => `Variable desconocida: {{${name}}}. Usa solo {{nombre}}.`);
  const preview = renderTemplate(values.body, TEMPLATE_EXAMPLE_VALUES);

  const insertName = () => {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? values.body.length;
    const end = textarea?.selectionEnd ?? values.body.length;
    set('body', `${values.body.slice(0, start)}{{nombre}}${values.body.slice(end)}`);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + 10, start + 10);
    });
  };

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <TemplateFeedback state={state} />
        <Field label="Nombre interno">
          <input name="name" value={values.name} onChange={(event) => set('name', event.target.value)} className={inputClass} required maxLength={80} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">Uso</legend>
          {[
            { value: 'chat', title: 'Mensaje rápido', text: 'Para “Abrir en WhatsApp” desde la ficha y para responder en chats con la ventana de 24 h abierta. No necesita aprobación.' },
            { value: 'campaign', title: 'Plantilla de WhatsApp', text: 'Para escribir primero (campañas o clientes que no escriben hace más de 24 h). WhatsApp la revisa antes de poder usarla.' },
          ].map((option) => (
            <label key={option.value} className={cn('flex cursor-pointer gap-3 border p-3 text-sm', values.kind === option.value ? 'border-foreground' : 'border-border', locked && 'cursor-not-allowed opacity-60')}>
              <input type="radio" name="kind" value={option.value} checked={values.kind === option.value} onChange={() => set('kind', option.value as TemplateValues['kind'])} disabled={locked} className="mt-1 accent-white" />
              <span>
                <span className="block font-medium">{option.title}</span>
                <span className="text-xs text-muted-foreground">{option.text}</span>
              </span>
            </label>
          ))}
          {locked ? <input type="hidden" name="kind" value={values.kind} /> : null}
        </fieldset>

        <Field label="Mensaje" hint="{{nombre}} se reemplaza por el primer nombre del cliente.">
          <textarea ref={bodyRef} name="body" value={values.body} onChange={(event) => set('body', event.target.value)} rows={6} maxLength={1024} className={inputClass} required />
        </Field>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button type="button" onClick={insertName} className="border border-border px-2 py-1 hover:border-foreground hover:text-foreground">
            Insertar {'{{nombre}}'}
          </button>
          <span>{values.body.length}/1024</span>
        </div>

        {campaign ? (
          <>
            <Field label="Pie de mensaje (opcional)" hint="Recomendado en campañas: cómo darse de baja.">
              <input name="footer" value={values.footer} onChange={(event) => set('footer', event.target.value)} maxLength={60} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Botón (opcional)" hint="Ej.: Ver catálogo">
                <input name="button_text" value={values.buttonText} onChange={(event) => set('buttonText', event.target.value)} maxLength={25} className={inputClass} />
              </Field>
              <Field label="Enlace del botón" hint={`Vacío = la web (${siteUrl}).`}>
                <input name="button_url" value={values.buttonUrl} onChange={(event) => set('buttonUrl', event.target.value)} placeholder={siteUrl} className={inputClass} disabled={!values.buttonText} />
              </Field>
            </div>
            <Field label="Categoría en WhatsApp" hint="Marketing: novedades y promociones. Utilidad: avisos de un pedido o trámite del cliente (más barata, WhatsApp la reclasifica si tiene promoción).">
              <select name="wa_category" value={values.category} onChange={(event) => set('category', event.target.value as TemplateValues['category'])} className={inputClass}>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidad</option>
              </select>
            </Field>
          </>
        ) : (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="is_default" checked={values.isDefault} onChange={(event) => set('isDefault', event.target.checked)} className="h-4 w-4 accent-white" />
            Usar por defecto en “Abrir en WhatsApp”
          </label>
        )}

        <button type="submit" className={buttonClass.primary} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Guardar
        </button>
      </div>

      <aside aria-label="Vista previa" className="space-y-3">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Vista previa (cliente: Ana)</p>
        <div className="max-w-sm border border-border bg-[#0b141a] p-4">
          <div className="bg-[#1f2c34] px-3 py-2 text-sm text-[#e9edef] shadow">
            <p className="whitespace-pre-line break-words">{preview || '…'}</p>
            {campaign && values.footer ? <p className="mt-2 text-xs text-[#8696a0]">{values.footer}</p> : null}
          </div>
          {campaign && values.buttonText ? (
            <div className="mt-px flex items-center justify-center gap-1.5 bg-[#1f2c34] py-2 text-sm text-[#53bdeb]">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {values.buttonText}
            </div>
          ) : null}
        </div>
        {issues.length ? (
          <Notice tone="warning">
            <ul className="list-disc space-y-1 pl-4">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Notice>
        ) : campaign ? (
          <p className="text-xs text-muted-foreground">Cumple las reglas de WhatsApp. Después de guardar, envíala a revisión.</p>
        ) : null}
      </aside>
    </form>
  );
}

export function ActionForm({ action, label, variant = 'secondary', confirm }: { action: (state: TemplateFormState) => Promise<TemplateFormState>; label: string; variant?: 'primary' | 'secondary'; confirm?: string }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-2" onSubmit={(event) => { if (confirm && !window.confirm(confirm)) event.preventDefault(); }}>
      <TemplateFeedback state={state} />
      <button type="submit" className={buttonClass[variant]} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {label}
      </button>
    </form>
  );
}
