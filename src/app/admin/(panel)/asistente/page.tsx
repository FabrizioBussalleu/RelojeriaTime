import { AssistantPlayground, AssistantSettingsForm } from '@/components/admin/AssistantForms';
import { Badge, Card, PageHeader } from '@/components/admin/ui';
import { isAssistantConfigured } from '@/lib/assistant/model';
import { requireAdmin } from '@/lib/auth';
import { siteUrl } from '@/lib/crm/campaigns';
import { providerKind } from '@/lib/whatsapp/provider';
import { saveAssistantSettings, testAssistant } from './actions';

export const metadata = { title: 'Asistente IA' };
export const maxDuration = 120;

const REQUIRED_ENV = {
  meta: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_WABA_ID', 'META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
  '360dialog': ['D360_API_KEY', 'WHATSAPP_WEBHOOK_SECRET'],
  sandbox: [],
} as const;

const PROVIDER_LABELS = { meta: 'API oficial de Meta (Cloud API)', '360dialog': '360dialog', sandbox: 'Modo prueba (sin WhatsApp real)' };

export default async function AssistantPage() {
  const { supabase } = await requireAdmin();
  const { data: settings } = await supabase.from('assistant_settings').select('*').single();
  const provider = providerKind();
  const missing = REQUIRED_ENV[provider].filter((name) => !process.env[name]?.trim());
  const configured = isAssistantConfigured();
  const webhook = `${siteUrl()}/api/whatsapp/webhook`;

  return (
    <>
      <PageHeader
        title="Asistente IA"
        description="Responde por WhatsApp con el stock real: consulta la base, envía nombre, precio y fotos de Cloudinary de cada reloj, y deriva al equipo cuando el cliente quiere comprar."
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Ajustes">
            {settings ? (
              <AssistantSettingsForm
                action={saveAssistantSettings}
                initial={{
                  enabled: settings.enabled,
                  model: settings.model,
                  effort: settings.effort,
                  max_products: settings.max_products,
                  max_photos_per_product: settings.max_photos_per_product,
                  photos_mode: settings.photos_mode,
                  resume_ai_after_hours: settings.resume_ai_after_hours,
                  instructions: settings.instructions,
                  handoff_message: settings.handoff_message,
                  daily_campaign_limit: settings.daily_campaign_limit,
                }}
              />
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Conexiones">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">WhatsApp</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  {PROVIDER_LABELS[provider]}
                  {provider === 'sandbox' ? <Badge tone="warning">Prueba</Badge> : missing.length ? <Badge tone="danger">Incompleto</Badge> : <Badge tone="success">Configurado</Badge>}
                </dd>
                {missing.length ? <dd className="mt-1 text-xs text-red-300">Faltan variables: {missing.join(', ')}</dd> : null}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Modelo de IA (Anthropic)</dt>
                <dd className="mt-1 flex items-center gap-2">
                  {settings?.model}
                  {configured ? <Badge tone="success">Clave configurada</Badge> : <Badge tone="danger">Falta ANTHROPIC_API_KEY</Badge>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">URL del webhook</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {webhook}
                  {provider === '360dialog' ? '?token=<WHATSAPP_WEBHOOK_SECRET>' : ''}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  {provider === 'meta'
                    ? 'En Meta: suscribe los campos messages, message_template_status_update y, si usas coexistencia, smb_message_echoes.'
                    : provider === '360dialog'
                      ? 'Regístrala en 360dialog con el token secreto al final.'
                      : 'Se usa al conectar un proveedor real.'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Probar el asistente">
            <p className="mb-3 text-xs text-muted-foreground">Genera la respuesta a un mensaje con el catálogo real, sin enviar nada por WhatsApp. Cada prueba consume tokens de la API.</p>
            <AssistantPlayground action={testAssistant} configured={configured} />
          </Card>
        </div>
      </div>
    </>
  );
}
