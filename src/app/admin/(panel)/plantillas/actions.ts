'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { refreshTemplateStatus, submitTemplate } from '@/lib/crm/campaigns';
import { unknownVariables, validateWhatsAppTemplate, waTemplateName } from '@/lib/crm/templates';
import { WhatsAppApiError } from '@/lib/whatsapp/provider';
import { siteUrl } from '@/lib/env';

export type TemplateFormState = { error: string | null; errors?: string[]; notice?: string };

type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;

// Nombre técnico único en WhatsApp. Una plantilla ya enviada a revisión no se puede reemplazar con el
// mismo nombre: al cambiar su texto se registra como versión nueva (_v2, _v3…).
async function uniqueWaName(session: Session, base: string, excludeId?: string) {
  const { data } = await session.supabase.from('message_templates').select('id, wa_template_name').like('wa_template_name', `${base}%`);
  const taken = new Set((data ?? []).filter((row) => row.id !== excludeId).map((row) => row.wa_template_name));
  if (!taken.has(base)) return base;
  for (let version = 2; ; version += 1) if (!taken.has(`${base}_v${version}`)) return `${base}_v${version}`;
}

function readForm(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  return {
    name: text('name'),
    kind: text('kind') === 'campaign' ? ('campaign' as const) : ('chat' as const),
    body: String(formData.get('body') ?? '').replace(/\r\n/g, '\n').trim(),
    footer: text('footer') || null,
    buttonText: text('button_text') || null,
    buttonUrl: text('button_url') || null,
    category: text('wa_category') === 'UTILITY' ? ('UTILITY' as const) : ('MARKETING' as const),
    isDefault: formData.get('is_default') === 'on',
  };
}

export async function saveTemplate(templateId: string | null, _previous: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const form = readForm(formData);

  if (form.name.length < 2 || form.name.length > 80) return { error: 'El nombre debe tener entre 2 y 80 caracteres.' };
  const errors =
    form.kind === 'campaign'
      ? validateWhatsAppTemplate({ body: form.body, footer: form.footer, buttonText: form.buttonText, buttonUrl: form.buttonUrl })
      : [
          ...(form.body.length < 2 ? ['Escribe el mensaje.'] : []),
          ...(form.body.length > 1024 ? ['El mensaje admite hasta 1024 caracteres.'] : []),
          ...unknownVariables(form.body).map((name) => `Variable desconocida: {{${name}}}. Usa solo {{nombre}}.`),
        ];
  if (errors.length) return { error: 'Revisa el mensaje antes de guardar.', errors };

  const existing = templateId ? (await session.supabase.from('message_templates').select('*').eq('id', templateId).single()).data : null;
  if (templateId && !existing) return { error: 'La plantilla ya no existe.' };

  if (existing) {
    const { count } = await session.supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('template_id', existing.id).eq('status', 'sending');
    if (count) return { error: 'Hay una campaña enviándose con esta plantilla. Espera a que termine para editarla.' };
  }

  let notice: string | undefined;
  const fields = {
    name: form.name,
    body: form.body,
    footer: form.kind === 'campaign' ? form.footer : null,
    button_text: form.kind === 'campaign' ? form.buttonText : null,
    button_url: form.kind === 'campaign' && form.buttonText ? form.buttonUrl : null,
    wa_category: form.category,
    is_default: form.kind === 'chat' && form.isDefault,
  };
  let waFields: { wa_template_name?: string | null; wa_status?: string; wa_rejection_reason?: string | null } = {};
  if (form.kind === 'campaign') {
    const contentChanged =
      !existing ||
      existing.body !== fields.body ||
      existing.footer !== fields.footer ||
      existing.button_text !== fields.button_text ||
      (existing.button_url ?? null) !== (fields.button_url ?? null) ||
      existing.wa_category !== fields.wa_category ||
      existing.kind !== 'campaign';
    if (contentChanged) {
      const submitted = existing && existing.kind === 'campaign' && existing.wa_status !== 'draft';
      waFields = {
        wa_template_name: existing?.wa_template_name && !submitted ? existing.wa_template_name : await uniqueWaName(session, waTemplateName(form.name), existing?.id),
        wa_status: 'draft',
        wa_rejection_reason: null,
      };
      if (submitted) notice = 'Cambiaste una plantilla ya enviada a WhatsApp: se guardó como versión nueva y debes enviarla a revisión otra vez.';
    }
  } else {
    waFields = { wa_template_name: null, wa_status: 'draft', wa_rejection_reason: null };
  }

  if (fields.is_default) await session.supabase.from('message_templates').update({ is_default: false }).eq('kind', 'chat').neq('id', templateId ?? '00000000-0000-0000-0000-000000000000');

  if (existing) {
    const { error } = await session.supabase.from('message_templates').update({ ...fields, ...waFields, kind: form.kind }).eq('id', existing.id);
    if (error) return { error: 'No se pudo guardar la plantilla.' };
    revalidatePath('/admin/plantillas');
    revalidatePath(`/admin/plantillas/${existing.id}`);
    return { error: null, notice: notice ?? 'Plantilla guardada.' };
  }
  const { data, error } = await session.supabase.from('message_templates').insert({ ...fields, ...waFields, kind: form.kind }).select('id').single();
  if (error) return { error: 'No se pudo crear la plantilla.' };
  revalidatePath('/admin/plantillas');
  redirect(`/admin/plantillas/${data.id}`);
}

function describeError(error: unknown) {
  if (error instanceof WhatsAppApiError) return `WhatsApp respondió: ${error.message}`;
  return error instanceof Error ? error.message : 'Error desconocido.';
}

export async function submitTemplateForReview(templateId: string): Promise<TemplateFormState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const { data: template } = await session.supabase.from('message_templates').select('*').eq('id', templateId).single();
  if (!template || template.kind !== 'campaign') return { error: 'Solo las plantillas de WhatsApp se envían a revisión.' };
  const errors = validateWhatsAppTemplate({ body: template.body, footer: template.footer, buttonText: template.button_text, buttonUrl: template.button_url || siteUrl() });
  if (errors.length) return { error: 'La plantilla no cumple las reglas de WhatsApp.', errors };
  try {
    const status = await submitTemplate(template);
    revalidatePath(`/admin/plantillas/${templateId}`);
    revalidatePath('/admin/plantillas');
    return { error: null, notice: status === 'approved' ? 'WhatsApp aprobó la plantilla.' : 'Enviada a revisión. WhatsApp suele responder en minutos (a veces hasta 48 horas).' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function refreshTemplate(templateId: string): Promise<TemplateFormState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const { data: template } = await session.supabase.from('message_templates').select('*').eq('id', templateId).single();
  if (!template) return { error: 'La plantilla ya no existe.' };
  try {
    await refreshTemplateStatus(template);
    revalidatePath(`/admin/plantillas/${templateId}`);
    return { error: null, notice: 'Estado actualizado.' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function deleteTemplate(templateId: string) {
  const session = await getAdminSession();
  if (!session) return;
  const { count } = await session.supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('template_id', templateId);
  if (count) redirect(`/admin/plantillas/${templateId}?error=en-uso`);
  await session.supabase.from('message_templates').delete().eq('id', templateId);
  revalidatePath('/admin/plantillas');
  redirect('/admin/plantillas');
}
