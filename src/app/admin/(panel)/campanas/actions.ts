'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { processCampaign } from '@/lib/crm/campaigns';
import { compactFilters, SegmentFiltersSchema, type SegmentFilters } from '@/lib/crm/segments';
import { createServiceClient } from '@/lib/supabase/clients';

export type CampaignFormState = { error: string | null };
export type SegmentCount = { contactable: number; withoutConsent: number } | { error: string };

export async function countSegment(filters: SegmentFilters): Promise<SegmentCount> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró.' };
  const parsed = SegmentFiltersSchema.safeParse(filters);
  if (!parsed.success) return { error: 'Revisa los filtros.' };
  const base = compactFilters(parsed.data);
  const [contactable, everyone] = await Promise.all([
    // POST con limit 1: el conteo exacto viene en la cabecera (HEAD no admite parámetros jsonb).
    session.supabase.rpc('crm_segment', { p_filters: { ...base, solo_contactables: true } }, { count: 'exact' }).limit(1),
    session.supabase.rpc('crm_segment', { p_filters: { ...base, solo_contactables: false } }, { count: 'exact' }).limit(1),
  ]);
  if (contactable.error || everyone.error) return { error: 'No se pudo calcular el segmento.' };
  return { contactable: contactable.count ?? 0, withoutConsent: Math.max(0, (everyone.count ?? 0) - (contactable.count ?? 0)) };
}

function startErrorMessage(message: string) {
  if (/aprobada/.test(message)) return 'La plantilla todavía no está aprobada por WhatsApp.';
  if (/Ningún cliente/.test(message)) return 'Ningún cliente con consentimiento cumple los filtros.';
  if (/ya fue enviada/.test(message)) return 'Esta campaña ya fue enviada.';
  return 'No se pudo iniciar la campaña.';
}

export async function saveCampaign(campaignId: string | null, _previous: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const name = String(formData.get('name') ?? '').trim();
  const templateId = String(formData.get('template_id') ?? '');
  const intent = formData.get('intent') === 'send' ? 'send' : 'draft';
  if (name.length < 2 || name.length > 120) return { error: 'Ponle un nombre a la campaña (2 a 120 caracteres).' };
  if (!templateId) return { error: 'Elige una plantilla.' };

  let rawFilters: unknown;
  try {
    rawFilters = JSON.parse(String(formData.get('filters') ?? '{}'));
  } catch {
    return { error: 'Filtros inválidos.' };
  }
  const parsed = SegmentFiltersSchema.safeParse(rawFilters);
  if (!parsed.success) return { error: 'Revisa los filtros: hay valores fuera de rango.' };
  const filters = compactFilters(parsed.data);

  let id = campaignId;
  if (id) {
    const { data, error } = await session.supabase.from('campaigns').update({ name, template_id: templateId, filters }).eq('id', id).eq('status', 'draft').select('id');
    if (error || !data.length) return { error: 'Solo se pueden editar campañas en borrador.' };
  } else {
    const { data, error } = await session.supabase.from('campaigns').insert({ name, template_id: templateId, filters, created_by: session.userId }).select('id').single();
    if (error) return { error: 'No se pudo guardar la campaña.' };
    id = data.id;
  }

  if (intent === 'send') {
    const { error } = await session.supabase.rpc('start_campaign', { p_campaign_id: id });
    if (error) {
      revalidatePath('/admin/campanas');
      if (!campaignId) redirect(`/admin/campanas/${id}?error=${encodeURIComponent(startErrorMessage(error.message))}`);
      return { error: startErrorMessage(error.message) };
    }
    after(() => processCampaign(id));
  }
  revalidatePath('/admin/campanas');
  redirect(`/admin/campanas/${id}`);
}

export async function continueCampaign(campaignId: string) {
  const session = await getAdminSession();
  if (!session) return;
  after(() => processCampaign(campaignId));
  revalidatePath(`/admin/campanas/${campaignId}`);
}

export async function cancelCampaign(campaignId: string) {
  const session = await getAdminSession();
  if (!session) return;
  const { data } = await session.supabase.from('campaigns').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', campaignId).in('status', ['draft', 'sending']).select('id');
  if (data?.length) {
    await createServiceClient().from('campaign_recipients').update({ status: 'skipped', error: 'Campaña cancelada' }).eq('campaign_id', campaignId).eq('status', 'pending');
  }
  revalidatePath(`/admin/campanas/${campaignId}`);
  revalidatePath('/admin/campanas');
}

export async function deleteCampaign(campaignId: string) {
  const session = await getAdminSession();
  if (!session) return;
  await session.supabase.from('campaigns').delete().eq('id', campaignId).eq('status', 'draft');
  revalidatePath('/admin/campanas');
  redirect('/admin/campanas');
}
