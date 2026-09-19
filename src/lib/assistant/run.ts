import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';
import { getCatalog, getStoreSettings } from '@/lib/catalog';
import { createServiceClient } from '@/lib/supabase/clients';
import type { Database } from '@/lib/supabase/database.types';
import { isWindowOpen, sendWhatsAppMessage } from '@/lib/whatsapp/messaging';
import { whatsappImageUrl } from '@/lib/whatsapp/media';
import { generateAssistantReply, isAssistantConfigured, type AssistantModel, type ModelResult } from './model';
import { conversationContextPrompt, stableSystemPrompt } from './prompt';
import { renderReply, type AssistantReply } from './reply';
import { siteUrl as appSiteUrl } from '@/lib/env';

type AssistantSettings = Database['public']['Tables']['assistant_settings']['Row'];
type MessageRow = Database['public']['Tables']['wa_messages']['Row'];

// Espera antes de responder: los clientes suelen mandar "hola" y la pregunta en mensajes seguidos.
const DEBOUNCE_MS = Number(process.env.ASSISTANT_DEBOUNCE_MS ?? 2500);
const LOCK_SECONDS = 180;
const HISTORY_LIMIT = 40;
const MAX_PASSES = 3;

export type AssistantDependencies = {
  generate: (request: Parameters<typeof generateAssistantReply>[0]) => Promise<ModelResult>;
  sleep: (ms: number) => Promise<void>;
  configured: () => boolean;
};

const defaultDependencies: AssistantDependencies = {
  generate: generateAssistantReply,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  configured: isAssistantConfigured,
};

export type AssistantRunResult = { status: 'disabled' | 'busy' | 'human' | 'window_closed' | 'up_to_date' | 'replied' | 'handoff' | 'error'; reason?: string };

export async function getAssistantSettings(): Promise<AssistantSettings> {
  const { data, error } = await createServiceClient().from('assistant_settings').select('*').single();
  if (error) throw error;
  return data;
}

async function acquireLock(conversationId: string) {
  const until = new Date(Date.now() + LOCK_SECONDS * 1000).toISOString();
  const { data, error } = await createServiceClient()
    .from('wa_conversations')
    .update({ ai_lock_until: until })
    .eq('id', conversationId)
    .or(`ai_lock_until.is.null,ai_lock_until.lt.${new Date().toISOString()}`)
    .select('id');
  if (error) throw error;
  return data.length === 1;
}

async function releaseLock(conversationId: string) {
  await createServiceClient().from('wa_conversations').update({ ai_lock_until: null }).eq('id', conversationId);
}

export async function flagForTeam(conversationId: string, reason: string) {
  await createServiceClient()
    .from('wa_conversations')
    .update({ mode: 'human', human_since: new Date().toISOString(), human_by: null, needs_attention: true, attention_reason: reason })
    .eq('id', conversationId);
}

// Historial para el modelo: cliente → user; asistente, equipo, campañas → assistant.
function toModelMessages(history: MessageRow[]): Anthropic.Beta.BetaMessageParam[] {
  const turns: { role: 'user' | 'assistant'; lines: string[] }[] = [];
  for (const message of history) {
    const role = message.direction === 'in' ? 'user' : 'assistant';
    let line: string;
    if (message.direction === 'in') {
      line = message.type === 'text' && message.body ? message.body : message.type === 'image' ? '[El cliente envió una imagen]' : '[Mensaje no compatible]';
    } else if (message.type === 'image') {
      line = message.body ? `[Foto enviada] ${message.body}` : '[Foto de producto enviada]';
    } else {
      const author = message.sender === 'agent' ? '(Persona del equipo) ' : message.sender === 'campaign' ? '(Mensaje de campaña) ' : '';
      line = `${author}${message.body ?? ''}`;
    }
    const last = turns.at(-1);
    if (last && last.role === role) last.lines.push(line);
    else turns.push({ role, lines: [line] });
  }
  if (turns[0]?.role === 'assistant') turns.unshift({ role: 'user', lines: ['[Inicio de la conversación]'] });
  return turns.map((turn) => ({ role: turn.role, content: turn.lines.join('\n') }));
}

function hasUnansweredMessage(history: MessageRow[]) {
  return history.at(-1)?.direction === 'in';
}

const todayInLima = () => new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'America/Lima' }).format(new Date());

async function buildContext(customerId: string, history: MessageRow[], siteUrl: string) {
  const supabase = createServiceClient();
  const { data: customer } = await supabase.from('customer_overview').select('display_name, paid_orders_count').eq('id', customerId).single();
  const { data: lastOrder } = await supabase
    .from('orders')
    .select('paid_at, order_items(product_name, brand_name)')
    .eq('customer_id', customerId)
    .not('paid_at', 'is', null)
    .neq('status', 'cancelled')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return conversationContextPrompt({
    customerName: customer?.display_name ?? null,
    paidOrders: customer?.paid_orders_count ?? 0,
    lastPurchase: lastOrder?.paid_at
      ? {
          date: new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(new Date(lastOrder.paid_at)),
          items: lastOrder.order_items.map((item) => [item.brand_name, item.product_name].filter(Boolean).join(' ')),
        }
      : null,
    startedByCampaign: history.some((message) => message.sender === 'campaign'),
    siteUrl,
    today: todayInLima(),
  });
}

async function deliver(conversationId: string, phone: string, reply: AssistantReply, settings: AssistantSettings, catalog: Awaited<ReturnType<typeof getCatalog>>, siteUrl: string) {
  const { parts, droppedIds } = renderReply(reply, new Map(catalog.map((product) => [product.id, product])), {
    maxProducts: settings.max_products,
    maxPhotosPerProduct: settings.max_photos_per_product,
    photosMode: settings.photos_mode as 'caption' | 'separate',
    siteUrl,
  });
  if (droppedIds.length) console.warn('Asistente: ids descartados (inexistentes o agotados)', droppedIds);

  // Se envían en orden y de a uno: WhatsApp no garantiza el orden de mensajes enviados en paralelo.
  for (const part of parts) {
    const outcome =
      part.kind === 'text'
        ? await sendWhatsAppMessage({ conversationId, to: phone, sender: 'ai', message: { type: 'text', body: part.body, previewUrl: false } })
        : await sendWhatsAppMessage({
            conversationId,
            to: phone,
            sender: 'ai',
            productId: part.productId,
            message: { type: 'image', link: whatsappImageUrl(part.src), ...(part.caption ? { caption: part.caption } : {}) },
          });
    if (!outcome.ok) throw new Error(`No se pudo enviar un mensaje: ${outcome.error}`);
  }
}

// Responde los mensajes pendientes de una conversación. Se llama después de responder 200 al webhook.
export async function runAssistant(conversationId: string, dependencies: AssistantDependencies = defaultDependencies): Promise<AssistantRunResult> {
  const result = await runLocked(conversationId, dependencies, true);
  // Un mensaje que llegó justo mientras se liberaba el bloqueo encontró la conversación ocupada y no
  // se atendió: se revisa una vez más ya sin bloqueo.
  if (result.status === 'replied' || result.status === 'up_to_date') {
    const { data: last } = await createServiceClient()
      .from('wa_messages')
      .select('direction')
      .eq('conversation_id', conversationId)
      .neq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.direction === 'in') return runLocked(conversationId, dependencies, false);
  }
  return result;
}

async function runLocked(conversationId: string, dependencies: AssistantDependencies, debounce: boolean): Promise<AssistantRunResult> {
  const settings = await getAssistantSettings();
  if (!settings.enabled || !dependencies.configured()) {
    await createServiceClient()
      .from('wa_conversations')
      .update({ needs_attention: true, attention_reason: settings.enabled ? 'Falta configurar la clave de Anthropic' : 'Asistente desactivado' })
      .eq('id', conversationId)
      .eq('mode', 'ai');
    return { status: 'disabled' };
  }
  if (!(await acquireLock(conversationId))) return { status: 'busy' };

  const supabase = createServiceClient();
  const siteUrl = appSiteUrl();
  try {
    if (debounce) await dependencies.sleep(DEBOUNCE_MS);
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const { data: conversation, error } = await supabase
        .from('wa_conversations')
        .select('*, customer:customers(id, phone)')
        .eq('id', conversationId)
        .single();
      if (error) throw error;

      if (conversation.mode === 'human') {
        const lastHuman = conversation.last_human_message_at ?? conversation.human_since;
        const expired = lastHuman && Date.now() - Date.parse(lastHuman) > settings.resume_ai_after_hours * 3600_000;
        if (!expired) {
          // La conversación es del equipo: el mensaje nuevo se avisa en el panel en lugar de responderlo.
          if (!conversation.needs_attention) {
            await supabase.from('wa_conversations').update({ needs_attention: true, attention_reason: 'Mensaje nuevo en una conversación a cargo del equipo' }).eq('id', conversationId);
          }
          return { status: 'human' };
        }
        await supabase.from('wa_conversations').update({ mode: 'ai', human_since: null, human_by: null }).eq('id', conversationId);
      }
      if (!isWindowOpen(conversation.last_inbound_at)) return { status: 'window_closed' };

      const { data: recent, error: historyError } = await supabase
        .from('wa_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .neq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (historyError) throw historyError;
      const history = recent.reverse();
      if (!hasUnansweredMessage(history)) return { status: 'up_to_date' };

      // Último mensaje del cliente que ve el modelo (hora de la base, no la del servidor: pueden diferir).
      const lastInboundAt = history.findLast((message) => message.direction === 'in')!.created_at;
      const [catalog, store, context] = await Promise.all([getCatalog(), getStoreSettings(), buildContext(conversation.customer!.id, history, siteUrl)]);
      const result = await dependencies.generate({
        model: settings.model as AssistantModel,
        effort: settings.effort as 'low' | 'medium' | 'high',
        system: { stable: stableSystemPrompt({ maxProducts: settings.max_products, teamInstructions: settings.instructions }), context },
        messages: toModelMessages(history),
        catalog,
        store,
        siteUrl,
      });
      console.info('Asistente: uso de tokens', { conversationId, ...result.usage });

      if (!result.ok) {
        await sendWhatsAppMessage({ conversationId, to: conversation.customer!.phone, sender: 'system', message: { type: 'text', body: settings.handoff_message } });
        await flagForTeam(conversationId, `El asistente no pudo responder: ${result.reason}`);
        return { status: 'handoff', reason: result.reason };
      }

      await deliver(conversationId, conversation.customer!.phone, result.reply, settings, catalog, siteUrl);
      if (result.reply.derivar_a_humano) {
        await flagForTeam(conversationId, result.reply.motivo_derivacion || 'El cliente quiere hablar con una persona');
        return { status: 'handoff', reason: result.reply.motivo_derivacion };
      }

      // Si el cliente escribió mientras se generaba la respuesta, se responde también eso.
      const { count } = await supabase
        .from('wa_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('direction', 'in')
        .gt('created_at', lastInboundAt);
      if (!count) return { status: 'replied' };
    }
    return { status: 'replied' };
  } catch (error) {
    console.error('Asistente: error', error);
    await flagForTeam(conversationId, `Error del asistente: ${error instanceof Error ? error.message : String(error)}`);
    return { status: 'error' };
  } finally {
    await releaseLock(conversationId);
  }
}

// Prueba desde el panel: genera la respuesta a un mensaje sin enviar nada por WhatsApp.
export async function previewAssistant(customerText: string, dependencies: Pick<AssistantDependencies, 'generate'> = defaultDependencies) {
  const settings = await getAssistantSettings();
  const siteUrl = appSiteUrl();
  const [catalog, store] = await Promise.all([getCatalog(), getStoreSettings()]);
  const result = await dependencies.generate({
    model: settings.model as AssistantModel,
    effort: settings.effort as 'low' | 'medium' | 'high',
    system: {
      stable: stableSystemPrompt({ maxProducts: settings.max_products, teamInstructions: settings.instructions }),
      context: conversationContextPrompt({ customerName: 'Cliente de prueba', paidOrders: 0, lastPurchase: null, startedByCampaign: false, siteUrl, today: todayInLima() }),
    },
    messages: [{ role: 'user', content: customerText }],
    catalog,
    store,
    siteUrl,
  });
  if (!result.ok) return { ok: false as const, reason: result.reason, usage: result.usage, model: settings.model };
  const { parts, droppedIds } = renderReply(result.reply, new Map(catalog.map((product) => [product.id, product])), {
    maxProducts: settings.max_products,
    maxPhotosPerProduct: settings.max_photos_per_product,
    photosMode: settings.photos_mode as 'caption' | 'separate',
    siteUrl,
  });
  return {
    ok: true as const,
    reply: result.reply,
    parts: parts.map((part) => (part.kind === 'image' ? { ...part, src: whatsappImageUrl(part.src, 600) } : part)),
    droppedIds,
    usage: result.usage,
    model: settings.model,
  };
}
