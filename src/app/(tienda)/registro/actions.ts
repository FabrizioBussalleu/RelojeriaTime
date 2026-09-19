'use server';

import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import { createServiceClient } from '@/lib/supabase/clients';

export type RegistrationValues = { name: string; phone: string; interests: string[]; consent: boolean };
export type RegistrationState = { status: 'idle' | 'ok' | 'error'; error?: string; fieldErrors?: Record<string, string>; firstName?: string; values?: RegistrationValues };

// Freno global ante envíos automatizados: más de esto en 10 minutos es anormal para la tienda.
const MAX_REGISTRATIONS_PER_10_MIN = 30;

const RegistrationSchema = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre.').max(120, 'El nombre es demasiado largo.'),
  phone: z.string().trim().refine((value) => normalizePhone(value) !== null, 'Escribe tu celular de 9 dígitos o tu número con código de país.'),
  interests: z.array(z.string().trim().min(1).max(80)).max(30),
  consent: z.literal(true, 'Necesitamos tu autorización para escribirte por WhatsApp.'),
  website: z.string().max(0),
});

export async function registerCustomer(_previous: RegistrationState, formData: FormData): Promise<RegistrationState> {
  // React limpia el formulario al terminar la acción: lo enviado vuelve en el estado para rellenarlo.
  const values: RegistrationValues = {
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    interests: formData.getAll('interests').map(String),
    consent: formData.get('consent') === 'on',
  };
  const parsed = RegistrationSchema.safeParse({ ...values, website: formData.get('website') ?? '' });
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
    if (fieldErrors.website) return { status: 'error', error: 'No pudimos procesar el registro.' };
    return { status: 'error', error: 'Revisa los datos marcados.', fieldErrors, values };
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'registro')
    .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= MAX_REGISTRATIONS_PER_10_MIN) return { status: 'error', error: 'Estamos recibiendo muchos registros. Inténtalo en unos minutos.', values };

  // Mismo número = mismo cliente: si ya compró o escribió antes, se completan sus datos.
  const { error } = await supabase.rpc('upsert_customer', {
    p_phone: normalizePhone(parsed.data.phone)!,
    p_name: parsed.data.name,
    p_source: 'registro',
    p_opt_in: true,
    p_opt_in_source: 'registro',
    p_interests: parsed.data.interests,
  });
  if (error) {
    console.error('Registro de cliente', error);
    return { status: 'error', error: 'No pudimos registrarte. Inténtalo de nuevo en unos minutos.', values };
  }
  return { status: 'ok', firstName: parsed.data.name.split(/\s+/)[0] };
}
