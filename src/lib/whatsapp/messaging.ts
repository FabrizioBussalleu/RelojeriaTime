import 'server-only';

import { createServiceClient } from '@/lib/supabase/clients';
import { getWhatsAppProvider, type OutgoingMessage } from './provider';

// Regla de WhatsApp: los mensajes libres (texto, imágenes, enlaces) solo se pueden enviar dentro de
// las 24 horas siguientes al último mensaje del cliente. Fuera de esa ventana solo sale una plantilla aprobada.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt: string | null | undefined, now = Date.now()) {
  return Boolean(lastInboundAt) && now - Date.parse(lastInboundAt!) < SERVICE_WINDOW_MS;
}

export type Sender = 'ai' | 'agent' | 'campaign' | 'system';

export class WindowClosedError extends Error {
  constructor() {
    super('La ventana de 24 horas está cerrada: solo se puede enviar una plantilla aprobada.');
    this.name = 'WindowClosedError';
  }
}

export async function getOrCreateConversation(customerId: string) {
  const supabase = createServiceClient();
  const { data: existing, error } = await supabase.from('wa_conversations').select('*').eq('customer_id', customerId).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data: created, error: insertError } = await supabase
    .from('wa_conversations')
    .upsert({ customer_id: customerId }, { onConflict: 'customer_id', ignoreDuplicates: false })
    .select('*')
    .single();
  if (insertError) throw insertError;
  return created;
}

type SendOptions = {
  conversationId: string;
  to: string;
  message: DistributiveOmit<OutgoingMessage, 'to'>;
  sender: Sender;
  // Texto que se guarda en el historial (para plantillas: el cuerpo ya renderizado).
  displayBody?: string;
  agentId?: string | null;
  productId?: string | null;
  campaignId?: string | null;
};

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type SendOutcome = { ok: true; messageId: string; waMessageId: string } | { ok: false; messageId: string | null; error: string };

// Registra el mensaje, lo envía y deja el resultado (id de WhatsApp o error) en wa_messages.
export async function sendWhatsAppMessage(options: SendOptions): Promise<SendOutcome> {
  const supabase = createServiceClient();

  if (options.message.type !== 'template') {
    const { data: conversation, error } = await supabase
      .from('wa_conversations')
      .select('last_inbound_at')
      .eq('id', options.conversationId)
      .single();
    if (error) throw error;
    if (!isWindowOpen(conversation.last_inbound_at)) throw new WindowClosedError();
  }

  const body =
    options.displayBody ??
    (options.message.type === 'text' ? options.message.body : options.message.type === 'image' ? options.message.caption ?? null : null);
  const { data: record, error: insertError } = await supabase
    .from('wa_messages')
    .insert({
      conversation_id: options.conversationId,
      direction: 'out',
      sender: options.sender,
      type: options.message.type,
      body,
      media_url: options.message.type === 'image' ? options.message.link : null,
      status: 'queued',
      agent_id: options.agentId ?? null,
      product_id: options.productId ?? null,
      campaign_id: options.campaignId ?? null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  try {
    const { id } = await getWhatsAppProvider().send({ ...options.message, to: options.to } as OutgoingMessage);
    const now = new Date().toISOString();
    await supabase.from('wa_messages').update({ wa_message_id: id, status: 'sent' }).eq('id', record.id);
    await supabase
      .from('wa_conversations')
      .update({ last_message_at: now, ...(options.sender === 'agent' ? { last_human_message_at: now } : {}) })
      .eq('id', options.conversationId);
    return { ok: true, messageId: record.id, waMessageId: id };
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    await supabase.from('wa_messages').update({ status: 'failed', error: message }).eq('id', record.id);
    return { ok: false, messageId: record.id, error: message };
  }
}
