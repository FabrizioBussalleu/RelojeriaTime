import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAssistant } from '@/lib/assistant/run';
import { createServiceClient } from '@/lib/supabase/clients';
import { handleWebhookPayload } from '@/lib/whatsapp/webhook';
import { processCampaign, submitTemplate, templateParams } from './campaigns';

const supabase = createServiceClient();
const PHONE_PREFIX = '5190001';
const TEMPLATE_NAME = `prueba_integracion_${Date.now()}`;
let templateId: string;
const campaignIds: string[] = [];

async function cleanup() {
  if (campaignIds.length) await supabase.from('campaigns').delete().in('id', campaignIds);
  await supabase.from('message_templates').delete().like('wa_template_name', 'prueba_integracion_%');
  await supabase.from('customers').delete().like('phone', `${PHONE_PREFIX}%`);
}

beforeAll(async () => {
  await cleanup();
  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      name: 'Prueba integración',
      kind: 'campaign',
      body: 'Hola {{nombre}}, llegaron relojes nuevos a Time. ¿Te mostramos?',
      footer: 'Responde BAJA para no recibir novedades.',
      button_text: 'Ver catálogo',
      wa_template_name: TEMPLATE_NAME,
      wa_category: 'MARKETING',
    })
    .select('*')
    .single();
  if (error) throw error;
  templateId = data.id;
});
afterAll(cleanup);

describe('parámetros de plantilla', () => {
  it('usa solo el primer nombre y no envía sin nombre', () => {
    expect(templateParams({ body: 'Hola {{nombre}}, mira esto' }, 'Ana María Torres')).toEqual(['Ana']);
    expect(templateParams({ body: 'Hola {{nombre}}, mira esto' }, null)).toBeNull();
    expect(templateParams({ body: 'Novedades de la semana' }, null)).toEqual([]);
  });
});

describe('campañas', () => {
  it('registra la plantilla, envía solo a quienes dieron consentimiento y la respuesta abre la conversación con la IA', async () => {
    expect(await submitTemplate((await supabase.from('message_templates').select('*').eq('id', templateId).single()).data!)).toBe('approved');

    const phones = [`${PHONE_PREFIX}0001`, `${PHONE_PREFIX}0002`, `${PHONE_PREFIX}0003`];
    await supabase.rpc('upsert_customer', { p_phone: phones[0], p_name: 'Ana Torres', p_source: 'registro', p_opt_in: true, p_opt_in_source: 'registro', p_interests: ['Prueba Integración'] });
    await supabase.rpc('upsert_customer', { p_phone: phones[1], p_name: 'Bruno Díaz', p_source: 'registro', p_opt_in: true, p_opt_in_source: 'registro', p_interests: ['Prueba Integración'] });
    await supabase.rpc('upsert_customer', { p_phone: phones[2], p_name: 'Sin Permiso', p_source: 'registro', p_interests: ['Prueba Integración'] });

    const { data: campaign } = await supabase
      .from('campaigns')
      .insert({ name: 'Prueba integración', template_id: templateId, filters: { marcas: ['Prueba Integración'] } })
      .select('id')
      .single();
    campaignIds.push(campaign!.id);

    const { data: count, error } = await supabase.rpc('start_campaign', { p_campaign_id: campaign!.id });
    expect(error).toBeNull();
    expect(count).toBe(2);

    // Bruno se da de baja después de iniciada la campaña: no se le envía.
    await supabase.from('customers').update({ whatsapp_opt_in: false, opt_out_at: new Date().toISOString() }).eq('phone', phones[1]);

    const result = await processCampaign(campaign!.id, { respectSendingHours: false });
    expect(result).toMatchObject({ status: 'done', sent: 1, skipped: 1, failed: 0, pending: 0 });

    const { data: finished } = await supabase.from('campaigns').select('status, finished_at').eq('id', campaign!.id).single();
    expect(finished!.status).toBe('sent');
    expect(finished!.finished_at).not.toBeNull();

    const { data: recipients } = await supabase.from('campaign_recipients').select('phone, status, error, wa_message_id').eq('campaign_id', campaign!.id).order('phone');
    expect(recipients!.map((recipient) => [recipient.phone, recipient.status])).toEqual([
      [phones[0], 'sent'],
      [phones[1], 'skipped'],
    ]);

    const { data: ana } = await supabase.from('customers').select('id, wa_conversations(id, last_inbound_at)').eq('phone', phones[0]).single();
    const conversationId = ana!.wa_conversations!.id;
    expect(ana!.wa_conversations!.last_inbound_at).toBeNull();
    const { data: messages } = await supabase.from('wa_messages').select('sender, type, body, campaign_id').eq('conversation_id', conversationId);
    expect(messages).toEqual([
      {
        sender: 'campaign',
        type: 'template',
        body: 'Hola Ana, llegaron relojes nuevos a Time. ¿Te mostramos?\n\nResponde BAJA para no recibir novedades.',
        campaign_id: campaign!.id,
      },
    ]);

    // Sin respuesta del cliente la ventana está cerrada: la IA no puede escribir.
    const stub = {
      generate: async () => ({ ok: true as const, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 1 }, reply: { apertura: 'Claro, mira estos.', producto_ids: [], cierre: '', derivar_a_humano: false, motivo_derivacion: '' } }),
      sleep: async () => {},
      configured: () => true,
    };
    expect((await runAssistant(conversationId, stub)).status).toBe('window_closed');

    // Ana responde: se marca la respuesta de la campaña y la IA contesta dentro de la ventana.
    await handleWebhookPayload({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ wa_id: phones[0], profile: { name: 'Ana' } }],
                messages: [{ from: phones[0], id: `wamid.test.${crypto.randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Sí, muéstrame' } }],
              },
            },
          ],
        },
      ],
    });
    const { data: replied } = await supabase.from('campaign_recipients').select('replied_at').eq('campaign_id', campaign!.id).eq('phone', phones[0]).single();
    expect(replied!.replied_at).not.toBeNull();

    let contextSeen = '';
    const result2 = await runAssistant(conversationId, {
      ...stub,
      generate: async (request) => {
        contextSeen = request.system.context;
        return stub.generate();
      },
    });
    expect(result2.status).toBe('replied');
    expect(contextSeen).toContain('empezó con un mensaje de campaña: sí');
  });

  it('una campaña ya enviada no se reinicia', async () => {
    const { error } = await supabase.rpc('start_campaign', { p_campaign_id: campaignIds[0] });
    expect(error?.message).toMatch(/ya fue enviada/);
  });
});
