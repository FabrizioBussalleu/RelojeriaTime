'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isAssistantConfigured } from '@/lib/assistant/model';
import { previewAssistant } from '@/lib/assistant/run';
import { getAdminSession } from '@/lib/auth';

export type SettingsState = { error: string | null; saved?: boolean };

const SettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.enum(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']),
  effort: z.enum(['low', 'medium', 'high']),
  max_products: z.coerce.number().int().min(1).max(6),
  max_photos_per_product: z.coerce.number().int().min(1).max(10),
  photos_mode: z.enum(['caption', 'separate']),
  resume_ai_after_hours: z.coerce.number().int().min(1).max(168),
  instructions: z.string().trim().max(4000),
  handoff_message: z.string().trim().min(5).max(500),
  daily_campaign_limit: z.coerce.number().int().min(1).max(100000),
});

export async function saveAssistantSettings(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const parsed = SettingsSchema.safeParse({
    enabled: formData.get('enabled') === 'on',
    model: formData.get('model'),
    effort: formData.get('effort'),
    max_products: formData.get('max_products'),
    max_photos_per_product: formData.get('max_photos_per_product'),
    photos_mode: formData.get('photos_mode'),
    resume_ai_after_hours: formData.get('resume_ai_after_hours'),
    instructions: formData.get('instructions') ?? '',
    handoff_message: formData.get('handoff_message') ?? '',
    daily_campaign_limit: formData.get('daily_campaign_limit'),
  });
  if (!parsed.success) return { error: 'Revisa los valores: alguno está fuera de rango.' };
  const { error } = await session.supabase.from('assistant_settings').update(parsed.data).eq('id', true);
  if (error) return { error: 'No se pudo guardar.' };
  revalidatePath('/admin/asistente');
  return { error: null, saved: true };
}

export type PreviewState = { error: string | null; result?: Awaited<ReturnType<typeof previewAssistant>> };

export async function testAssistant(_previous: PreviewState, formData: FormData): Promise<PreviewState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  if (!isAssistantConfigured()) return { error: 'Falta configurar ANTHROPIC_API_KEY.' };
  const text = String(formData.get('message') ?? '').trim();
  if (!text) return { error: 'Escribe un mensaje de cliente.' };
  if (text.length > 1000) return { error: 'El mensaje es demasiado largo.' };
  try {
    return { error: null, result: await previewAssistant(text) };
  } catch (error) {
    console.error('Prueba del asistente', error);
    return { error: error instanceof Error ? `Error: ${error.message}` : 'No se pudo generar la respuesta.' };
  }
}
