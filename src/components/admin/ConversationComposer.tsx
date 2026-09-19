'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Loader2, Send } from 'lucide-react';
import type { ComposerState } from '@/app/admin/(panel)/conversaciones/actions';
import { firstName, renderTemplate } from '@/lib/crm/templates';
import { buttonClass, inputClass, Notice } from './ui';

type Action = (state: ComposerState, formData: FormData) => Promise<ComposerState>;

// Recarga los datos del servidor cada pocos segundos mientras la pestaña está visible.
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}

export function MessageComposer({
  action,
  windowOpen,
  customerName,
  chatTemplates,
  aiActive,
}: {
  action: Action;
  windowOpen: boolean;
  customerName: string | null;
  chatTemplates: { id: string; name: string; body: string }[];
  aiActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [text, setText] = useState('');
  const lastSent = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.sentAt && state.sentAt !== lastSent.current) {
      lastSent.current = state.sentAt;
      setText('');
    }
  }, [state.sentAt]);

  if (!windowOpen) return null;

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {chatTemplates.length ? (
        <div className="flex flex-wrap gap-2">
          {chatTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setText(renderTemplate(template.body, { nombre: firstName(customerName) }))}
              className="border border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              {template.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="composer-body">
          Mensaje
        </label>
        <textarea
          id="composer-body"
          name="body"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit();
          }}
          rows={3}
          maxLength={4096}
          placeholder="Escribe una respuesta… (Ctrl + Enter para enviar)"
          className={inputClass}
        />
        <button type="submit" className={buttonClass.primary} disabled={pending || !text.trim()} aria-label="Enviar">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {aiActive ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" aria-hidden /> Al responder, la IA se pausa en esta conversación hasta que la devuelvas.
        </p>
      ) : null}
    </form>
  );
}

export function TemplateSender({ action, templates }: { action: Action; templates: { id: string; name: string; preview: string }[] }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [selected, setSelected] = useState(templates[0]?.id ?? '');
  const preview = templates.find((template) => template.id === selected)?.preview;

  if (!templates.length) {
    return (
      <Notice tone="warning">
        Pasaron más de 24 horas desde el último mensaje del cliente. Para escribirle primero necesitas una plantilla aprobada por WhatsApp (se crean en Plantillas).
      </Notice>
    );
  }
  return (
    <form action={formAction} className="space-y-2 border border-amber-500/40 p-3">
      <p className="text-sm text-amber-100">Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite enviar una plantilla aprobada. Cuando responda, podrás escribir libremente.</p>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.sentAt ? <Notice tone="success">Plantilla enviada.</Notice> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="template_id" value={selected} onChange={(event) => setSelected(event.target.value)} className={inputClass} aria-label="Plantilla">
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass.primary} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Enviar plantilla
        </button>
      </div>
      {preview ? <p className="whitespace-pre-line border-l-2 border-border pl-3 text-sm text-muted-foreground">{preview}</p> : null}
    </form>
  );
}

export function SimulatorForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [text, setText] = useState('');
  const lastSent = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.sentAt && state.sentAt !== lastSent.current) {
      lastSent.current = state.sentAt;
      setText('');
    }
  }, [state.sentAt]);

  return (
    <form action={formAction} className="space-y-2 border border-dashed border-amber-500/50 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-amber-200">Modo prueba · simular mensaje del cliente</p>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <div className="flex gap-2">
        <input name="body" value={text} onChange={(event) => setText(event.target.value)} placeholder="Ej.: ¿Qué Casio tienes hasta 300 soles?" className={inputClass} aria-label="Mensaje del cliente" />
        <button type="submit" className={buttonClass.secondary} disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Simular
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Entra como un mensaje real de WhatsApp: pasa por la IA y la respuesta aparece en unos segundos.</p>
    </form>
  );
}
