import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '@/lib/phone';
import { createServiceClient } from '@/lib/supabase/clients';
import { getOrCreateConversation, sendWhatsAppMessage } from './messaging';

// Formato de webhook de la Cloud API (Meta y 360dialog envían el mismo).
type InboundMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
};
type StatusUpdate = { id: string; status: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
type MessageEcho = { to: string; id: string; timestamp: string; type: string; text?: { body?: string } };
type ChangeValue = {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
  message_echoes?: MessageEcho[];
  event?: string;
  message_template_name?: string;
  reason?: string;
};
export type WebhookPayload = { object?: string; entry?: { changes?: { field?: string; value?: ChangeValue }[] }[] };

const OPT_OUT = /^(baja|stop|parar|darme de baja|no (?:quiero|deseo) (?:recibir )?(?:mas|más) mensajes)[.!¡\s]*$/i;
const OPT_IN = /^(alta|suscribirme)[.!\s]*$/i;
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

// Firma de Meta (X-Hub-Signature-256 con el App Secret) o, con 360dialog, un token secreto en la URL.
export function verifyWebhookRequest(rawBody: string, signature: string | null, urlToken: string | null) {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (appSecret) {
    if (!signature?.startsWith('sha256=')) return false;
    const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!secret || !urlToken) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(urlToken);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function messageText(message: InboundMessage) {
  return (
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    message.image?.caption ??
    null
  );
}

async function customerConversation(rawPhone: string, whatsappName: string | null) {
  const supabase = createServiceClient();
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const { data: customerId, error } = await supabase.rpc('upsert_customer', {
    p_phone: phone,
    p_source: 'whatsapp',
    ...(whatsappName ? { p_whatsapp_name: whatsappName } : {}),
  });
  if (error) throw error;
  if (!customerId) return null;
  const conversation = await getOrCreateConversation(customerId);
  return { phone, customerId, conversation };
}

async function handleInbound(message: InboundMessage, whatsappName: string | null) {
  const supabase = createServiceClient();
  const target = await customerConversation(message.from, whatsappName);
  if (!target) return null;
  // Hora en que el cliente escribió según WhatsApp: con ella se calcula la ventana de 24 horas.
  const receivedAt = new Date(Number(message.timestamp) * 1000 || Date.now()).toISOString();
  const body = messageText(message);
  const type = message.type === 'text' || message.type === 'button' || message.type === 'interactive' ? 'text' : message.type === 'image' ? 'image' : 'other';

  const { error } = await supabase.from('wa_messages').insert({
    conversation_id: target.conversation.id,
    direction: 'in',
    sender: 'customer',
    type,
    body,
    wa_message_id: message.id,
    status: 'received',
    // created_at queda con la hora de recepción: la hora de WhatsApp tiene precisión de segundos y
    // podría ordenar el mensaje antes de una respuesta nuestra enviada en ese mismo segundo.
  });
  // Meta reintenta webhooks: un id ya guardado significa que este mensaje ya se procesó.
  if (error?.code === '23505') return null;
  if (error) throw error;

  await supabase
    .from('wa_conversations')
    .update({ last_inbound_at: receivedAt, last_message_at: new Date().toISOString(), unread_count: target.conversation.unread_count + 1 })
    .eq('id', target.conversation.id);

  // Respuesta a una campaña de los últimos 7 días.
  await supabase
    .from('campaign_recipients')
    .update({ replied_at: receivedAt })
    .eq('customer_id', target.customerId)
    .is('replied_at', null)
    .gte('sent_at', new Date(Date.now() - 7 * 86_400_000).toISOString());

  const text = body?.trim() ?? '';
  if (OPT_OUT.test(text)) {
    await supabase.from('customers').update({ whatsapp_opt_in: false, opt_out_at: receivedAt }).eq('id', target.customerId);
    await sendWhatsAppMessage({
      conversationId: target.conversation.id,
      to: target.phone,
      sender: 'system',
      message: { type: 'text', body: 'Listo, ya no te enviaremos novedades. Si nos escribes, te seguiremos atendiendo por aquí. Responde ALTA si cambias de opinión.' },
    });
    return null;
  }
  if (OPT_IN.test(text)) {
    await supabase.rpc('upsert_customer', { p_phone: target.phone, p_source: 'whatsapp', p_opt_in: true, p_opt_in_source: 'whatsapp' });
    await sendWhatsAppMessage({
      conversationId: target.conversation.id,
      to: target.phone,
      sender: 'system',
      message: { type: 'text', body: 'Gracias, te enviaremos novedades de Time Relojería. Responde BAJA cuando quieras dejar de recibirlas.' },
    });
    return null;
  }
  return target.conversation.id;
}

// Mensaje que alguien del equipo envió desde la app WhatsApp Business (coexistencia): la IA se pausa.
async function handleEcho(echo: MessageEcho) {
  const supabase = createServiceClient();
  const target = await customerConversation(echo.to, null);
  if (!target) return;
  const sentAt = new Date(Number(echo.timestamp) * 1000 || Date.now()).toISOString();
  const { error } = await supabase.from('wa_messages').insert({
    conversation_id: target.conversation.id,
    direction: 'out',
    sender: 'agent',
    type: echo.type === 'text' ? 'text' : echo.type === 'image' ? 'image' : 'other',
    body: echo.text?.body ?? null,
    wa_message_id: echo.id,
    status: 'sent',
  });
  if (error?.code === '23505') return;
  if (error) throw error;
  await supabase
    .from('wa_conversations')
    .update({
      mode: 'human',
      human_since: target.conversation.mode === 'human' ? target.conversation.human_since : sentAt,
      last_human_message_at: sentAt,
      last_message_at: sentAt,
      needs_attention: false,
      unread_count: 0,
    })
    .eq('id', target.conversation.id);
}

async function handleStatus(update: StatusUpdate) {
  const supabase = createServiceClient();
  const at = new Date(Number(update.timestamp) * 1000 || Date.now()).toISOString();
  const errorText = update.errors?.map((item) => [item.code, item.title ?? item.message, item.error_data?.details].filter(Boolean).join(' · ')).join('; ') || null;

  const { data: message } = await supabase.from('wa_messages').select('id, status').eq('wa_message_id', update.id).maybeSingle();
  if (message) {
    if (update.status === 'failed') {
      await supabase.from('wa_messages').update({ status: 'failed', error: errorText }).eq('id', message.id);
    } else if ((STATUS_RANK[update.status] ?? -1) > (STATUS_RANK[message.status] ?? -1)) {
      await supabase.from('wa_messages').update({ status: update.status as 'sent' | 'delivered' | 'read' }).eq('id', message.id);
    }
  }

  const recipientUpdate =
    update.status === 'failed'
      ? { status: 'failed' as const, error: errorText }
      : update.status === 'delivered'
        ? { status: 'delivered' as const, delivered_at: at }
        : update.status === 'read'
          ? { status: 'read' as const, read_at: at }
          : null;
  if (recipientUpdate) {
    const { data: recipient } = await supabase.from('campaign_recipients').select('id, status').eq('wa_message_id', update.id).maybeSingle();
    if (recipient && (update.status === 'failed' || (STATUS_RANK[update.status] ?? -1) > (STATUS_RANK[recipient.status] ?? -1))) {
      await supabase.from('campaign_recipients').update(recipientUpdate).eq('id', recipient.id);
    }
  }
}

const TEMPLATE_EVENTS: Record<string, 'approved' | 'rejected' | 'paused' | 'disabled' | 'pending'> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  DISABLED: 'disabled',
  PENDING: 'pending',
  FLAGGED: 'paused',
};

export async function handleWebhookPayload(payload: WebhookPayload) {
  const supabase = createServiceClient();
  const conversationsToProcess = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (change.field === 'messages') {
        const names = new Map((value.contacts ?? []).map((contact) => [contact.wa_id ?? '', contact.profile?.name ?? null]));
        for (const message of value.messages ?? []) {
          const conversationId = await handleInbound(message, names.get(message.from) ?? null);
          if (conversationId) conversationsToProcess.add(conversationId);
        }
        for (const status of value.statuses ?? []) await handleStatus(status);
      } else if (change.field === 'smb_message_echoes') {
        for (const echo of value.message_echoes ?? []) await handleEcho(echo);
      } else if (change.field === 'message_template_status_update' && value.message_template_name && value.event) {
        const status = TEMPLATE_EVENTS[value.event];
        if (status) {
          await supabase
            .from('message_templates')
            .update({ wa_status: status, wa_rejection_reason: status === 'rejected' ? value.reason ?? null : null })
            .eq('wa_template_name', value.message_template_name);
        }
      }
    }
  }
  return { conversationIds: [...conversationsToProcess] };
}
