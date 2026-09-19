'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { CustomerFormState, CustomerFormValues } from '@/app/admin/(panel)/clientes/actions';
import { GENDER_INTEREST_LABELS } from '@/lib/crm/labels';
import { buttonClass, Field, inputClass, Notice } from './ui';

export type { CustomerFormValues };

const EMPTY: CustomerFormValues = { name: '', phone: '', email: '', document: '', city: '', notes: '', interests: [], tags: [] };

export function CustomerForm({
  action,
  brands,
  initial = EMPTY,
  mode,
}: {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  brands: string[];
  initial?: CustomerFormValues;
  mode: 'create' | 'edit';
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? initial;
  const interestOptions = [...Object.keys(GENDER_INTEREST_LABELS), ...brands];
  const extraInterests = values.interests.filter((interest) => !interestOptions.some((option) => option.toLowerCase() === interest.toLowerCase()));

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <Notice tone="danger">
          {state.error}{' '}
          {state.existingId ? (
            <Link href={`/admin/clientes/${state.existingId}`} className="underline">
              Ver su ficha
            </Link>
          ) : null}
        </Notice>
      ) : null}
      {state.saved ? <Notice tone="success">Cambios guardados.</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" error={errors.name}>
          <input name="name" defaultValue={values.name} className={inputClass} autoComplete="off" required />
        </Field>
        <Field label="WhatsApp" hint="Celular de 9 dígitos o con código de país (+…)." error={errors.phone}>
          <input name="phone" defaultValue={values.phone} className={inputClass} inputMode="tel" autoComplete="off" required />
        </Field>
        <Field label="Correo (opcional)" error={errors.email}>
          <input name="email" type="email" defaultValue={values.email} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="DNI / RUC (opcional)" error={errors.document}>
          <input name="document" defaultValue={values.document} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Ciudad (opcional)" error={errors.city}>
          <input name="city" defaultValue={values.city} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Etiquetas" hint="Separadas por coma. Ej.: vip, regalo, corporativo." error={errors.tags}>
          <input name="tags" defaultValue={values.tags.join(', ')} className={inputClass} autoComplete="off" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Intereses</legend>
        <p className="mb-3 text-xs text-muted-foreground">Sirven para segmentar campañas (además de lo que ya compró).</p>
        <div className="flex flex-wrap gap-2">
          {[...interestOptions, ...extraInterests].map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 border border-border px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background">
              <input
                type="checkbox"
                name="interests"
                value={option}
                defaultChecked={values.interests.some((interest) => interest.toLowerCase() === option.toLowerCase())}
                className="sr-only"
              />
              {GENDER_INTEREST_LABELS[option as keyof typeof GENDER_INTEREST_LABELS] ?? option}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Notas internas" error={errors.notes}>
        <textarea name="notes" defaultValue={values.notes} rows={4} className={inputClass} placeholder="Preferencias, talla de muñeca, fechas especiales…" />
      </Field>

      {mode === 'create' ? (
        <label className="flex items-start gap-3 border border-border p-3 text-sm">
          <input type="checkbox" name="whatsapp_opt_in" defaultChecked={state.optIn} className="mt-1 h-4 w-4 accent-white" />
          <span>
            Aceptó recibir novedades y promociones por WhatsApp
            <span className="block text-xs text-muted-foreground">Márcalo solo si el cliente lo pidió o aceptó expresamente. Sin esto no entra en campañas.</span>
          </span>
        </label>
      ) : null}

      <button type="submit" className={buttonClass.primary} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {mode === 'create' ? 'Crear cliente' : 'Guardar cambios'}
      </button>
    </form>
  );
}
