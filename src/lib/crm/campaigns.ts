import 'server-only';

import { siteUrl as appSiteUrl } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/clients';
import type { Database } from '@/lib/supabase/database.types';
import { getOrCreateConversation, sendWhatsAppMessage } from '@/lib/whatsapp/messaging';
import { getWhatsAppProvider } from '@/lib/whatsapp/provider';
import { firstName, renderTemplate, TEMPLATE_EXAMPLE_VALUES, toPositionalTemplate, type TemplateVariable } from './templates';

type TemplateRow = Database['public']['Tables']['message_templates']['Row'];

const LOCK_SECONDS = 290;
const CONCURRENCY = 5;
// Horario de envío de campañas (hora de Lima): nadie quiere una promoción de madrugada.
export const SENDING_HOURS = { from: 9, to: 21 };

export function isWithinSendingHours(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Lima' }).format(date));
  return hour >= SENDING_HOURS.from && hour < SENDING_HOURS.to;
}

export { siteUrl } from '@/lib/env';

// Texto completo de la plantilla tal como lo verá el cliente (para el historial y la vista previa).
export function renderTemplateMessage(template: Pick<TemplateRow, 'body' | 'footer'>, customerName: string | null) {
  const body = renderTemplate(template.body, { nombre: firstName(customerName) });
  return template.footer ? `${body}\n\n${template.footer}` : body;
}

// Parámetros posicionales ({{1}}, {{2}}…) en el orden en que se registró la plantilla.
// WhatsApp no acepta parámetros vacíos: sin nombre no se puede enviar esta plantilla.
export function templateParams(template: Pick<TemplateRow, 'body'>, customerName: string | null) {
  const values: Record<TemplateVariable, string> = { nombre: firstName(customerName) };
  const { variables } = toPositionalTemplate(template.body);
  const params = variables.map((name) => values[name as TemplateVariable] ?? '');
  return params.some((value) => !value) ? null : params;
}

// Registra la plantilla en WhatsApp para su revisión. Meta suele responder en minutos (hasta 48 h).
export async function submitTemplate(template: TemplateRow) {
  if (!template.wa_template_name) throw new Error('La plantilla no tiene nombre técnico para WhatsApp.');
  const { text, variables } = toPositionalTemplate(template.body);
  const buttonUrl = template.button_url || appSiteUrl();
  const status = await getWhatsAppProvider().createTemplate({
    name: template.wa_template_name,
    language: template.wa_language,
    category: template.wa_category as 'MARKETING' | 'UTILITY',
    body: text,
    bodyExample: variables.map((name) => TEMPLATE_EXAMPLE_VALUES[name as TemplateVariable] ?? 'Ana'),
    footer: template.footer,
    button: template.button_text ? { text: template.button_text, url: buttonUrl } : null,
  });
  const waStatus = normalizeTemplateStatus(status.status);
  await createServiceClient()
    .from('message_templates')
    .update({ wa_status: waStatus, wa_rejection_reason: status.rejectedReason, ...(template.button_text ? { button_url: buttonUrl } : {}) })
    .eq('id', template.id);
  return waStatus;
}

export async function refreshTemplateStatus(template: TemplateRow) {
  if (!template.wa_template_name || template.wa_status === 'draft') return template.wa_status;
  const status = await getWhatsAppProvider().getTemplateStatus(template.wa_template_name);
  if (!status) return template.wa_status;
  const waStatus = normalizeTemplateStatus(status.status);
  await createServiceClient()
    .from('message_templates')
    .update({ wa_status: waStatus, wa_rejection_reason: status.rejectedReason })
    .eq('id', template.id);
  return waStatus;
}

function normalizeTemplateStatus(status: string): TemplateRow['wa_status'] {
  const value = status.toLowerCase();
  if (value === 'approved' || value === 'rejected' || value === 'paused' || value === 'disabled') return value;
  return 'pending';
}

// Envíos de campaña hechos en las últimas 24 horas (todas las campañas).
export async function campaignQuota() {
  const supabase = createServiceClient();
  const [{ data: settings }, { count }] = await Promise.all([
    supabase.from('assistant_settings').select('daily_campaign_limit').single(),
    supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  const limit = settings?.daily_campaign_limit ?? 250;
  return { limit, used: count ?? 0, remaining: Math.max(0, limit - (count ?? 0)) };
}

async function acquireCampaignLock(campaignId: string) {
  const { data, error } = await createServiceClient()
    .from('campaigns')
    .update({ processing_until: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() })
    .eq('id', campaignId)
    .eq('status', 'sending')
    .or(`processing_until.is.null,processing_until.lt.${new Date().toISOString()}`)
    .select('id');
  if (error) throw error;
  return data.length === 1;
}

type RecipientRow = { id: number; customer_id: string; phone: string; customer: { name: string | null; whatsapp_name: string | null; whatsapp_opt_in: boolean; opt_out_at: string | null } | null };

async function sendToRecipient(recipient: RecipientRow, template: TemplateRow, campaignId: string) {
  const supabase = createServiceClient();
  const customer = recipient.customer;
  // Pudo darse de baja después de iniciada la campaña.
  if (!customer?.whatsapp_opt_in || customer.opt_out_at) {
    await supabase.from('campaign_recipients').update({ status: 'skipped', error: 'Se dio de baja' }).eq('id', recipient.id);
    return 'skipped' as const;
  }
  const name = customer.name ?? customer.whatsapp_name;
  const params = templateParams(template, name);
  if (!params) {
    await supabase.from('campaign_recipients').update({ status: 'skipped', error: 'Sin nombre para la plantilla' }).eq('id', recipient.id);
    return 'skipped' as const;
  }

  const conversation = await getOrCreateConversation(recipient.customer_id);
  const outcome = await sendWhatsAppMessage({
    conversationId: conversation.id,
    to: recipient.phone,
    sender: 'campaign',
    campaignId,
    displayBody: renderTemplateMessage(template, name),
    message: { type: 'template', name: template.wa_template_name!, language: template.wa_language, bodyParams: params },
  });
  if (outcome.ok) {
    await supabase
      .from('campaign_recipients')
      .update({ status: 'sent', wa_message_id: outcome.waMessageId, sent_at: new Date().toISOString(), error: null })
      .eq('id', recipient.id);
    return 'sent' as const;
  }
  await supabase.from('campaign_recipients').update({ status: 'failed', error: outcome.error }).eq('id', recipient.id);
  return 'failed' as const;
}

export type CampaignRunResult = {
  status: 'locked' | 'done' | 'quota' | 'time' | 'not_sending' | 'quiet_hours';
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
};

// Envía los destinatarios pendientes por tandas, respetando el límite diario. Si se acaba el tiempo o
// el cupo, la campaña queda en "enviando" y continúa en la siguiente llamada (panel o cron diario).
export async function processCampaign(
  campaignId: string,
  { timeBudgetMs = 240_000, respectSendingHours = true } = {}
): Promise<CampaignRunResult> {
  const supabase = createServiceClient();
  const totals = { sent: 0, failed: 0, skipped: 0 };
  const deadline = Date.now() + timeBudgetMs;
  if (respectSendingHours && !isWithinSendingHours()) return { status: 'quiet_hours', ...totals, pending: -1 };
  if (!(await acquireCampaignLock(campaignId))) return { status: 'locked', ...totals, pending: -1 };

  let status: CampaignRunResult['status'] = 'done';
  try {
    const { data: campaign, error } = await supabase.from('campaigns').select('*, template:message_templates(*)').eq('id', campaignId).single();
    if (error) throw error;
    if (campaign.status !== 'sending') return { status: 'not_sending', ...totals, pending: 0 };
    const template = campaign.template!;
    if (template.wa_status !== 'approved' || !template.wa_template_name) {
      await supabase.from('campaigns').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', campaignId);
      throw new Error('La plantilla dejó de estar aprobada por WhatsApp.');
    }

    for (;;) {
      if (Date.now() > deadline) {
        status = 'time';
        break;
      }
      const quota = await campaignQuota();
      if (quota.remaining === 0) {
        status = 'quota';
        break;
      }
      const { data: batch, error: batchError } = await supabase
        .from('campaign_recipients')
        .select('id, customer_id, phone, customer:customers(name, whatsapp_name, whatsapp_opt_in, opt_out_at)')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .order('id')
        .limit(Math.min(quota.remaining, 25));
      if (batchError) throw batchError;
      if (!batch.length) break;

      for (let index = 0; index < batch.length; index += CONCURRENCY) {
        const results = await Promise.allSettled(batch.slice(index, index + CONCURRENCY).map((recipient) => sendToRecipient(recipient, template, campaignId)));
        for (const result of results) {
          if (result.status === 'fulfilled') totals[result.value] += 1;
          else {
            totals.failed += 1;
            console.error('Campaña: error al enviar', result.reason);
          }
        }
      }
    }

    const { count: pending } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');
    if (!pending) {
      await supabase.from('campaigns').update({ status: 'sent', finished_at: new Date().toISOString() }).eq('id', campaignId);
      status = 'done';
    }
    return { status, ...totals, pending: pending ?? 0 };
  } finally {
    await supabase.from('campaigns').update({ processing_until: null }).eq('id', campaignId);
  }
}

// Continúa las campañas que quedaron a medias (llamado por el cron diario).
export async function resumeSendingCampaigns() {
  const { data, error } = await createServiceClient().from('campaigns').select('id').eq('status', 'sending').order('started_at');
  if (error) throw error;
  const results: Record<string, CampaignRunResult> = {};
  for (const campaign of data) results[campaign.id] = await processCampaign(campaign.id, { timeBudgetMs: 60_000 });
  return results;
}
