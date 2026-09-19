'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ComposerState } from '@/app/admin/(panel)/conversaciones/actions';
import { buttonClass, Field, inputClass, Notice } from './ui';

// Modo prueba: un "cliente" escribe por primera vez al WhatsApp de la tienda.
export function NewSimulationForm({ action }: { action: (state: ComposerState, formData: FormData) => Promise<ComposerState> }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-3 border border-dashed border-amber-500/50 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-amber-200">Modo prueba · simular un cliente nuevo</p>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número">
          <input name="phone" defaultValue="999 000 111" className={inputClass} inputMode="tel" />
        </Field>
        <Field label="Nombre en WhatsApp">
          <input name="name" defaultValue="Cliente de prueba" className={inputClass} />
        </Field>
      </div>
      <Field label="Mensaje">
        <input name="body" defaultValue="Hola, ¿qué relojes Casio tienes hasta 400 soles?" className={inputClass} />
      </Field>
      <button type="submit" className={buttonClass.secondary} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Simular mensaje entrante
      </button>
    </form>
  );
}
