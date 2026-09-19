'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { runAssistant } from '@/lib/assistant/run';
import { getAdminSession } from '@/lib/auth';
import { renderTemplateMessage, templateParams } from '@/lib/crm/campaigns';
import { normalizePhone } from '@/lib/phone';
import { createServiceClient } from '@/lib/supabase/clients';
import { isWindowOpen, sendWhatsAppMessage } from '@/lib/whatsapp/messaging';
import { providerKind } from '@/lib/whatsapp/provider';
import { handleWebhookPayload } from '@/lib/whatsapp/webhook';

export type ComposerState = { error: string | null; sentAt?: number };

async function loadConversation(conversationId: string) {
  const { data, error } = await createServiceClient()
    .from('wa_conversations')
    .select('*, customer:customers(id, phone, name, whatsapp_name)')
    .eq('id', conversationId)
    .single();
  if (error) throw error;
  return data;
}

// Cuando alguien del equipo escribe, la IA se pausa en esa conversación para no pisarle la respuesta.
async function markHandledByAgent(conversationId: string, userId: string, alreadyHuman: boolean) {
  const now = new Date().toISOString();
  await createServiceClient()
    .from('wa_conversations')
    .update({ mode: 'human', human_by: userId, ...(alreadyHuman ? {} : { human_since: now }), needs_attention: false, attention_reason: null, unread_count: 0 })
    .eq('id', conversationId);
}

export async function sendAgentMessage(conversationId: string, _previous: ComposerState, formData: FormData): Promise<ComposerState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Escribe un mensaje.' };
  if (body.length > 4096) return { error: 'El mensaje supera los 4096 caracteres de WhatsApp.' };

  const conversation = await loadConversation(conversationId);
  if (!isWindowOpen(conversation.last_inbound_at)) {
    return { error: 'Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede enviar una plantilla aprobada.' };
  }
  const outcome = await sendWhatsAppMessage({
    conversationId,
    to: conversation.customer!.phone,
    sender: 'agent',
    agentId: session.userId,
    message: { type: 'text', body, previewUrl: true },
  });
  await markHandledByAgent(conversationId, session.userId, conversation.mode === 'human');
  revalidatePath(`/admin/conversaciones/${conversationId}`);
  return outcome.ok ? { error: null, sentAt: Date.now() } : { error: `WhatsApp no aceptó el mensaje: ${outcome.error}` };
}

export async function sendTemplateMessage(conversationId: string, _previous: ComposerState, formData: FormData): Promise<ComposerState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const templateId = String(formData.get('template_id') ?? '');
  const { data: template } = await session.supabase.from('message_templates').select('*').eq('id', templateId).maybeSingle();
  if (!template || template.wa_status !== 'approved' || !template.wa_template_name) return { error: 'Elige una plantilla aprobada por WhatsApp.' };

  const conversation = await loadConversation(conversationId);
  const name = conversation.customer!.name ?? conversation.customer!.whatsapp_name;
  const params = templateParams(template, name);
  if (!params) return { error: 'El cliente no tiene nombre registrado y la plantilla usa {{nombre}}. Complétalo en su ficha.' };

  const outcome = await sendWhatsAppMessage({
    conversationId,
    to: conversation.customer!.phone,
    sender: 'agent',
    agentId: session.userId,
    displayBody: renderTemplateMessage(template, name),
    message: { type: 'template', name: template.wa_template_name, language: template.wa_language, bodyParams: params },
  });
  await markHandledByAgent(conversationId, session.userId, conversation.mode === 'human');
  revalidatePath(`/admin/conversaciones/${conversationId}`);
  return outcome.ok ? { error: null, sentAt: Date.now() } : { error: `WhatsApp no aceptó la plantilla: ${outcome.error}` };
}

export async function takeOverConversation(conversationId: string) {
  const session = await getAdminSession();
  if (!session) return;
  await markHandledByAgent(conversationId, session.userId, false);
  revalidatePath(`/admin/conversaciones/${conversationId}`);
}

// Devuelve la conversación a la IA; si el cliente quedó esperando respuesta, la IA contesta.
export async function releaseToAssistant(conversationId: string) {
  const session = await getAdminSession();
  if (!session) return;
  await createServiceClient()
    .from('wa_conversations')
    .update({ mode: 'ai', human_by: null, human_since: null, needs_attention: false, attention_reason: null })
    .eq('id', conversationId);
  after(() => runAssistant(conversationId));
  revalidatePath(`/admin/conversaciones/${conversationId}`);
}

export async function markResolved(conversationId: string) {
  const session = await getAdminSession();
  if (!session) return;
  await session.supabase.from('wa_conversations').update({ needs_attention: false, attention_reason: null, unread_count: 0 }).eq('id', conversationId);
  revalidatePath(`/admin/conversaciones/${conversationId}`);
  revalidatePath('/admin/conversaciones');
}

// Modo prueba: simula el webhook de WhatsApp con un mensaje del cliente, igual que uno real.
function simulatedPayload(phone: string, name: string | null, text: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: phone, profile: { name: name ?? undefined } }],
              messages: [{ from: phone, id: `sandbox.in.${crypto.randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

export async function simulateCustomerMessage(conversationId: string, _previous: ComposerState, formData: FormData): Promise<ComposerState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  if (providerKind() !== 'sandbox') return { error: 'La simulación solo está disponible en modo prueba.' };
  const text = String(formData.get('body') ?? '').trim();
  if (!text) return { error: 'Escribe el mensaje del cliente.' };
  const conversation = await loadConversation(conversationId);
  const { conversationIds } = await handleWebhookPayload(simulatedPayload(conversation.customer!.phone, conversation.customer!.whatsapp_name, text));
  for (const id of conversationIds) after(() => runAssistant(id));
  revalidatePath(`/admin/conversaciones/${conversationId}`);
  return { error: null, sentAt: Date.now() };
}

export async function simulateNewCustomer(_previous: ComposerState, formData: FormData): Promise<ComposerState> {
  const session = await getAdminSession();
  if (!session) return { error: 'Tu sesión expiró. Vuelve a ingresar.' };
  if (providerKind() !== 'sandbox') return { error: 'La simulación solo está disponible en modo prueba.' };
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const name = String(formData.get('name') ?? '').trim() || null;
  const text = String(formData.get('body') ?? '').trim();
  if (!phone) return { error: 'Número no válido.' };
  if (!text) return { error: 'Escribe el mensaje del cliente.' };
  const { conversationIds } = await handleWebhookPayload(simulatedPayload(phone, name, text));
  for (const id of conversationIds) after(() => runAssistant(id));
  const { data } = await createServiceClient().from('customers').select('wa_conversations(id)').eq('phone', phone).single();
  redirect(`/admin/conversaciones/${data?.wa_conversations?.id ?? ''}`);
}
