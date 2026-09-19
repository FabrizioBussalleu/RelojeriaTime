'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2, MessageCircle } from 'lucide-react';
import { registerCustomer, type RegistrationState } from '@/app/(tienda)/registro/actions';
import { GENDER_INTEREST_LABELS } from '@/lib/crm/labels';
import { whatsappLink } from '@/lib/store';

const inputClass = 'w-full bg-transparent border border-border px-3 py-3 text-sm focus:outline-none focus:border-foreground';
const labelClass = 'block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground';

export function RegistrationForm({ brands, whatsappNumber }: { brands: string[]; whatsappNumber: string | null }) {
  const [state, formAction, pending] = useActionState<RegistrationState, FormData>(registerCustomer, { status: 'idle' });
  const errors = state.fieldErrors ?? {};
  const values = state.values;

  if (state.status === 'ok') {
    return (
      <div role="status" className="space-y-5 border border-border p-8 text-center">
        <p className="text-xl font-display tracking-wider">¡Listo{state.firstName ? `, ${state.firstName}` : ''}!</p>
        <p className="text-sm text-muted-foreground">Te escribiremos por WhatsApp cuando haya novedades para ti. Para dejar de recibirlas, responde BAJA en cualquier momento.</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          {whatsappNumber ? (
            <a href={whatsappLink(whatsappNumber, 'Hola, me registré en la web y quiero ver relojes')} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Escríbenos ahora
            </a>
          ) : null}
          <Link href="/#catalogo" className="btn-outline">
            Ver catálogo
          </Link>
        </div>
      </div>
    );
  }

  const interests = [
    ...Object.entries(GENDER_INTEREST_LABELS).map(([value, label]) => ({ value, label })),
    ...brands.map((brand) => ({ value: brand, label: brand })),
  ];

  return (
    <form action={formAction} noValidate className="relative space-y-6">
      {state.error ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="registro-name" className={labelClass}>
            Nombre
          </label>
          <input
            id="registro-name"
            name="name"
            defaultValue={values?.name}
            autoComplete="given-name"
            required
            className={inputClass}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'registro-name-error' : undefined}
          />
          {errors.name ? (
            <p id="registro-name-error" className="text-xs text-destructive">
              {errors.name}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label htmlFor="registro-phone" className={labelClass}>
            WhatsApp
          </label>
          <input
            id="registro-phone"
            name="phone"
            defaultValue={values?.phone}
            type="tel"
            autoComplete="tel"
            placeholder="9XX XXX XXX"
            required
            className={inputClass}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'registro-phone-error' : undefined}
          />
          {errors.phone ? (
            <p id="registro-phone-error" className="text-xs text-destructive">
              {errors.phone}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset>
        <legend className={`${labelClass} mb-3`}>¿Qué te interesa? (opcional)</legend>
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <label
              key={interest.value}
              className="cursor-pointer border border-border px-3 py-2 text-sm transition-colors hover:border-foreground has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input type="checkbox" name="interests" value={interest.value} defaultChecked={values?.interests.includes(interest.value)} className="sr-only" />
              {interest.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <input type="checkbox" name="consent" required defaultChecked={values?.consent} className="mt-1 accent-foreground" aria-invalid={Boolean(errors.consent)} />
          <span>
            Autorizo a Time Relojería a enviarme novedades y promociones por WhatsApp y a tratar mis datos según la{' '}
            <Link href="/privacidad" target="_blank" className="underline hover:text-foreground">
              política de privacidad
            </Link>
            . Puedo darme de baja respondiendo BAJA.
          </span>
        </label>
        {errors.consent ? <p className="text-xs text-destructive">{errors.consent}</p> : null}
      </div>

      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" disabled={pending} className="btn-primary flex w-full items-center justify-center gap-2 sm:w-auto">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Registrarme
      </button>
    </form>
  );
}
