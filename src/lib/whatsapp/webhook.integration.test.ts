import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssistant, type AssistantDependencies } from '@/lib/assistant/run';
import type { ModelResult } from '@/lib/assistant/model';
import { getCatalog } from '@/lib/catalog';
import { createServiceClient } from '@/lib/supabase/clients';
import { handleWebhookPayload, verifyWebhookRequest, type WebhookPayload } from './webhook';

const supabase = createServiceClient();
const PHONE_PREFIX = '5190000';
let sequence = 0;
const nextPhone = () => `${PHONE_PREFIX}${String(sequence++).padStart(4, '0')}`;
const nextWaId = () => `wamid.test.${crypto.randomUUID()}`;
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

function inbound(from: string, text: string, options: { id?: string; name?: string } = {}): WebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: from, profile: { name: options.name ?? 'Cliente Prueba' } }],
              messages: [{ from, id: options.id ?? nextWaId(), timestamp: nowSeconds(), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

const statusPayload = (id: string, status: string): WebhookPayload => ({
  entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id, status, timestamp: nowSeconds() }] } }] }],
});

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 1 };
function stubDependencies(result: ModelResult | (() => ModelResult)) {
  const generate = vi.fn<AssistantDependencies['generate']>(async () => (typeof result === 'function' ? result() : result));
  const dependencies: AssistantDependencies = { generate, sleep: async () => {}, configured: () => true };
  return { generate, dependencies };
}

async function conversationFor(phone: string) {
  const { data } = await supabase.from('customers').select('id, whatsapp_name, source, whatsapp_opt_in, opt_out_at, wa_conversations(*)').eq('phone', phone).single();
  return data!;
}

async function messagesFor(conversationId: string) {
  const { data } = await supabase.from('wa_messages').select('*').eq('conversation_id', conversationId).order('created_at').order('id');
  return data!;
}

async function cleanup() {
  await supabase.from('customers').delete().like('phone', `${PHONE_PREFIX}%`);
}

let productId: string;
let productPhotos: number;

beforeAll(async () => {
  await cleanup();
  const catalog = await getCatalog();
  const product = catalog.find((item) => item.stock > 0 && item.images.length > 0);
  if (!product) throw new Error('Se necesita al menos un producto activo con stock y fotos (npm run demo:seed).');
  productId = product.id;
  productPhotos = product.images.length;
});
afterAll(cleanup);

describe('firma del webhook', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('acepta la firma HMAC de Meta y rechaza una alterada', () => {
    vi.stubEnv('META_APP_SECRET', 'secreto-de-prueba');
    const body = JSON.stringify({ hola: 'mundo' });
    const signature = `sha256=${createHmac('sha256', 'secreto-de-prueba').update(body).digest('hex')}`;
    expect(verifyWebhookRequest(body, signature, null)).toBe(true);
    expect(verifyWebhookRequest(`${body} `, signature, null)).toBe(false);
    expect(verifyWebhookRequest(body, null, null)).toBe(false);
  });

  it('sin App Secret usa el token de la URL (360dialog) y sin configuración rechaza todo', () => {
    vi.stubEnv('META_APP_SECRET', '');
    vi.stubEnv('WHATSAPP_WEBHOOK_SECRET', 'token-largo');
    expect(verifyWebhookRequest('{}', null, 'token-largo')).toBe(true);
    expect(verifyWebhookRequest('{}', null, 'otro')).toBe(false);
    vi.stubEnv('WHATSAPP_WEBHOOK_SECRET', '');
    expect(verifyWebhookRequest('{}', null, 'token-largo')).toBe(false);
  });
});

describe('mensajes entrantes', () => {
  it('crea el cliente con su nombre de WhatsApp, guarda el mensaje una sola vez y pide respuesta', async () => {
    const phone = nextPhone();
    const payload = inbound(phone, 'Hola, ¿tienen Bulova?', { name: 'Ana Prueba' });
    const first = await handleWebhookPayload(payload);
    const retry = await handleWebhookPayload(payload);

    const customer = await conversationFor(phone);
    expect(customer.source).toBe('whatsapp');
    expect(customer.whatsapp_name).toBe('Ana Prueba');
    expect(customer.whatsapp_opt_in).toBe(false);
    const conversation = customer.wa_conversations!;
    expect(first.conversationIds).toEqual([conversation.id]);
    expect(retry.conversationIds).toEqual([]);
    expect(conversation.last_inbound_at).not.toBeNull();
    expect(conversation.unread_count).toBe(1);
    expect(await messagesFor(conversation.id)).toHaveLength(1);
  });

  it('el mismo número escrito de otra forma es el mismo cliente', async () => {
    const phone = nextPhone();
    await handleWebhookPayload(inbound(phone, 'hola'));
    await supabase.rpc('upsert_customer', { p_phone: `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`, p_source: 'manual', p_name: 'Ana' });
    const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('phone', phone);
    expect(count).toBe(1);
  });

  it('BAJA da de baja las novedades, confirma y no pasa por la IA', async () => {
    const phone = nextPhone();
    await supabase.rpc('upsert_customer', { p_phone: phone, p_source: 'registro', p_opt_in: true, p_opt_in_source: 'registro' });
    const result = await handleWebhookPayload(inbound(phone, 'BAJA'));
    expect(result.conversationIds).toEqual([]);
    const customer = await conversationFor(phone);
    expect(customer.whatsapp_opt_in).toBe(false);
    expect(customer.opt_out_at).not.toBeNull();
    const messages = await messagesFor(customer.wa_conversations!.id);
    expect(messages.map((message) => [message.direction, message.sender])).toEqual([
      ['in', 'customer'],
      ['out', 'system'],
    ]);
  });
});

describe('asistente', () => {
  const reply = (overrides: Partial<Extract<ModelResult, { ok: true }>['reply']> = {}): ModelResult => ({
    ok: true,
    usage,
    reply: { apertura: '¡Hola Ana! Mira estas opciones.', producto_ids: [], cierre: '¿Te gustó alguno?', derivar_a_humano: false, motivo_derivacion: '', ...overrides },
  });

  it('responde con apertura, cada reloj con sus fotos reales y cierre; descarta ids inventados', async () => {
    const phone = nextPhone();
    const { conversationIds } = await handleWebhookPayload(inbound(phone, '¿Qué relojes tienes?'));
    const { generate, dependencies } = stubDependencies(reply({ producto_ids: [productId, '00000000-0000-4000-8000-000000000000'] }));

    const result = await runAssistant(conversationIds[0], dependencies);
    expect(result.status).toBe('replied');
    expect(generate).toHaveBeenCalledTimes(1);
    const request = generate.mock.calls[0][0];
    expect(request.messages.at(-1)).toMatchObject({ role: 'user', content: '¿Qué relojes tienes?' });

    const outgoing = (await messagesFor(conversationIds[0])).filter((message) => message.direction === 'out');
    const photos = Math.min(productPhotos, 3);
    expect(outgoing).toHaveLength(2 + photos);
    expect(outgoing[0]).toMatchObject({ sender: 'ai', type: 'text', body: '¡Hola Ana! Mira estas opciones.', status: 'sent' });
    const images = outgoing.slice(1, 1 + photos);
    expect(images.every((message) => message.type === 'image' && message.product_id === productId)).toBe(true);
    expect(images[0].body).toMatch(/S\/\s?[\d,.]+/);
    expect(images[0].media_url).toMatch(/^https:\/\/res\.cloudinary\.com\/.+\.jpg$/);
    expect(outgoing.at(-1)).toMatchObject({ type: 'text', body: '¿Te gustó alguno?' });

    const { data: conversation } = await supabase.from('wa_conversations').select('ai_lock_until, mode').eq('id', conversationIds[0]).single();
    expect(conversation).toEqual({ ai_lock_until: null, mode: 'ai' });

    // Sin mensajes nuevos del cliente no vuelve a responder.
    expect((await runAssistant(conversationIds[0], dependencies)).status).toBe('up_to_date');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('deriva al equipo cuando el cliente quiere comprar', async () => {
    const phone = nextPhone();
    const { conversationIds } = await handleWebhookPayload(inbound(phone, 'Quiero comprarlo, ¿cómo pago?'));
    const { dependencies } = stubDependencies(
      reply({ apertura: 'Perfecto, una persona del equipo te escribe por aquí.', cierre: '', derivar_a_humano: true, motivo_derivacion: 'Quiere pagar' }),
    );
    expect((await runAssistant(conversationIds[0], dependencies)).status).toBe('handoff');
    const { data: conversation } = await supabase.from('wa_conversations').select('mode, needs_attention, attention_reason').eq('id', conversationIds[0]).single();
    expect(conversation).toEqual({ mode: 'human', needs_attention: true, attention_reason: 'Quiere pagar' });

    // Con la conversación en manos del equipo, la IA no contesta los mensajes siguientes: los avisa.
    await supabase.from('wa_conversations').update({ needs_attention: false, attention_reason: null }).eq('id', conversationIds[0]);
    await handleWebhookPayload(inbound(phone, '¿Sigues ahí?'));
    const second = stubDependencies(reply());
    expect((await runAssistant(conversationIds[0], second.dependencies)).status).toBe('human');
    expect(second.generate).not.toHaveBeenCalled();
    const { data: flagged } = await supabase.from('wa_conversations').select('needs_attention').eq('id', conversationIds[0]).single();
    expect(flagged!.needs_attention).toBe(true);
  });

  it('si el modelo falla envía el mensaje de derivación y avisa al equipo', async () => {
    const phone = nextPhone();
    const { conversationIds } = await handleWebhookPayload(inbound(phone, 'hola'));
    const { dependencies } = stubDependencies({ ok: false, reason: 'prueba', usage });
    expect((await runAssistant(conversationIds[0], dependencies)).status).toBe('handoff');
    const outgoing = (await messagesFor(conversationIds[0])).filter((message) => message.direction === 'out');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].sender).toBe('system');
  });

  it('no responde fuera de la ventana de 24 horas', async () => {
    const phone = nextPhone();
    const { conversationIds } = await handleWebhookPayload(inbound(phone, 'hola'));
    await supabase
      .from('wa_conversations')
      .update({ last_inbound_at: new Date(Date.now() - 25 * 3600_000).toISOString() })
      .eq('id', conversationIds[0]);
    const { generate, dependencies } = stubDependencies(reply());
    expect((await runAssistant(conversationIds[0], dependencies)).status).toBe('window_closed');
    expect(generate).not.toHaveBeenCalled();
  });

  it('un mensaje enviado desde la app del teléfono (coexistencia) pausa la IA', async () => {
    const phone = nextPhone();
    const { conversationIds } = await handleWebhookPayload(inbound(phone, 'hola'));
    await handleWebhookPayload({
      entry: [
        {
          changes: [
            { field: 'smb_message_echoes', value: { message_echoes: [{ to: phone, id: nextWaId(), timestamp: nowSeconds(), type: 'text', text: { body: 'Hola, soy Carla de Time' } }] } },
          ],
        },
      ],
    });
    const { data: conversation } = await supabase.from('wa_conversations').select('mode, unread_count').eq('id', conversationIds[0]).single();
    expect(conversation).toEqual({ mode: 'human', unread_count: 0 });
    const messages = await messagesFor(conversationIds[0]);
    expect(messages.at(-1)).toMatchObject({ direction: 'out', sender: 'agent', body: 'Hola, soy Carla de Time' });
  });
});

describe('estados de entrega', () => {
  it('avanzan sent → delivered → read y no retroceden', async () => {
    const phone = nextPhone();
    const { conversationIds } = await handleWebhookPayload(inbound(phone, 'hola'));
    const { dependencies } = stubDependencies({ ok: true, usage, reply: { apertura: 'Hola', producto_ids: [], cierre: '', derivar_a_humano: false, motivo_derivacion: '' } });
    await runAssistant(conversationIds[0], dependencies);
    const sent = (await messagesFor(conversationIds[0])).find((message) => message.direction === 'out')!;

    await handleWebhookPayload(statusPayload(sent.wa_message_id!, 'read'));
    await handleWebhookPayload(statusPayload(sent.wa_message_id!, 'delivered'));
    const { data } = await supabase.from('wa_messages').select('status').eq('id', sent.id).single();
    expect(data!.status).toBe('read');

    await handleWebhookPayload({
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: sent.wa_message_id!, status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }] } }] }],
    });
    const { data: failed } = await supabase.from('wa_messages').select('status, error').eq('id', sent.id).single();
    expect(failed).toEqual({ status: 'failed', error: '131047 · Re-engagement message' });
  });
});
