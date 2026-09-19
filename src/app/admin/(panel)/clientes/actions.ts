'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getAdminSession } from '@/lib/auth';
import { normalizePhone } from '@/lib/phone';
import { createServiceClient } from '@/lib/supabase/clients';
import { getOrCreateConversation } from '@/lib/whatsapp/messaging';

export type CustomerFormValues = { name: string; phone: string; email: string; document: string; city: string; notes: string; interests: string[]; tags: string[] };
export type CustomerFormState = { error: string | null; fieldErrors?: Record<string, string>; existingId?: string; saved?: boolean; values?: CustomerFormValues; optIn?: boolean };

// React limpia el formulario al terminar la acción: ante un error se devuelve lo escrito.
function submittedValues(formData: FormData): CustomerFormValues {
  const text = (name: string) => String(formData.get(name) ?? '');
  return {
    name: text('name'),
    phone: text('phone'),
    email: text('email'),
    document: text('document'),
    city: text('city'),
    notes: text('notes'),
    interests: formData.getAll('interests').map(String),
    tags: text('tags').split(',').map((tag) => tag.trim()).filter(Boolean),
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const CustomerSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre.').max(120),
  phone: z.string().trim().min(1, 'Escribe el número de WhatsApp.'),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((value) => !value || z.email().safeParse(value).success, 'Correo no válido.')
    .transform((value) => value.toLowerCase() || null),
  document: optionalText(20),
  city: optionalText(80),
  notes: optionalText(2000),
  interests: z.array(z.string().trim().min(1).max(80)).max(40),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
});

function parseCustomer(formData: FormData) {
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return CustomerSchema.safeParse({
    name: formData.get('name') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    document: formData.get('document') ?? '',
    city: formData.get('city') ?? '',
    notes: formData.get('notes') ?? '',
    interests: formData.getAll('interests').map(String),
    tags: [...new Set(tags)],
  });
}

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
}

const INVALID_PHONE = 'Número no válido. Usa un celular peruano de 9 dígitos o el número con código de país (+…).';

export async function createCustomer(_previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const parsed = parseCustomer(formData);
  const values = submittedValues(formData);
  const optIn = formData.get('whatsapp_opt_in') === 'on';
  if (!parsed.success) return { error: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values, optIn };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'Revisa los campos marcados.', fieldErrors: { phone: INVALID_PHONE }, values, optIn };

  // Un cliente por número: si ya existe, se muestra su ficha en lugar de duplicarlo.
  const { data: existing } = await session.supabase.from('customers').select('id, name, whatsapp_name').eq('phone', phone).maybeSingle();
  if (existing) {
    return { error: `Ese número ya está registrado como ${existing.name ?? existing.whatsapp_name ?? 'cliente sin nombre'}.`, existingId: existing.id, values, optIn };
  }

  const { data: id, error } = await createServiceClient().rpc('upsert_customer', {
    p_phone: phone,
    p_name: parsed.data.name,
    p_source: 'manual',
    p_opt_in: optIn,
    p_opt_in_source: optIn ? 'panel' : undefined,
    ...(parsed.data.email ? { p_email: parsed.data.email } : {}),
    ...(parsed.data.document ? { p_document: parsed.data.document } : {}),
    ...(parsed.data.city ? { p_city: parsed.data.city } : {}),
    p_interests: parsed.data.interests,
  });
  if (error || !id) return { error: 'No se pudo guardar el cliente. Intenta de nuevo.', values, optIn };
  await session.supabase.from('customers').update({ tags: parsed.data.tags, notes: parsed.data.notes }).eq('id', id);

  revalidatePath('/admin/clientes');
  redirect(`/admin/clientes/${id}`);
}

export async function updateCustomer(customerId: string, _previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const parsed = parseCustomer(formData);
  const values = submittedValues(formData);
  if (!parsed.success) return { error: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'Revisa los campos marcados.', fieldErrors: { phone: INVALID_PHONE }, values };

  const { data: existing } = await session.supabase.from('customers').select('id').eq('phone', phone).neq('id', customerId).maybeSingle();
  if (existing) return { error: 'Ese número pertenece a otro cliente.', existingId: existing.id, fieldErrors: { phone: 'Número ya registrado.' }, values };

  const { error } = await session.supabase
    .from('customers')
    .update({
      name: parsed.data.name,
      phone,
      email: parsed.data.email,
      document: parsed.data.document,
      city: parsed.data.city,
      notes: parsed.data.notes,
      interests: parsed.data.interests,
      tags: parsed.data.tags,
    })
    .eq('id', customerId);
  if (error) return { error: 'No se pudo guardar. Intenta de nuevo.', values };
  revalidatePath(`/admin/clientes/${customerId}`);
  revalidatePath('/admin/clientes');
  return { error: null, saved: true };
}

// Consentimiento para mensajes promocionales (campañas). Registrar de dónde viene es parte de la
// prueba de consentimiento que exige WhatsApp y la Ley 29733.
export async function setCustomerConsent(customerId: string, value: boolean) {
  const session = await getAdminSession();
  if (!session) return;
  const now = new Date().toISOString();
  await session.supabase
    .from('customers')
    .update(value ? { whatsapp_opt_in: true, opt_in_at: now, opt_in_source: 'panel', opt_out_at: null } : { whatsapp_opt_in: false, opt_out_at: now })
    .eq('id', customerId);
  revalidatePath(`/admin/clientes/${customerId}`);
}

export async function openConversation(customerId: string) {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  const conversation = await getOrCreateConversation(customerId);
  redirect(`/admin/conversaciones/${conversation.id}`);
}

export async function deleteCustomer(customerId: string) {
  const session = await getAdminSession();
  if (!session) return;
  // Los pedidos se conservan (customer_id queda vacío); se borran la ficha, la conversación y sus mensajes.
  await session.supabase.from('customers').delete().eq('id', customerId);
  revalidatePath('/admin/clientes');
  redirect('/admin/clientes');
}
