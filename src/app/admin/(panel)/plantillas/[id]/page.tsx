import { notFound } from 'next/navigation';
import { SubmitButton } from '@/components/admin/ClientBits';
import { ActionForm, TemplateEditor } from '@/components/admin/TemplateEditor';
import { Badge, Card, formatDateTime, Notice, PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { siteUrl } from '@/lib/crm/campaigns';
import { TEMPLATE_STATUS_LABELS, TEMPLATE_STATUS_TONES } from '@/lib/crm/labels';
import { providerKind } from '@/lib/whatsapp/provider';
import { deleteTemplate, refreshTemplate, saveTemplate, submitTemplateForReview } from '../actions';

export const metadata = { title: 'Plantilla' };

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: template } = await supabase.from('message_templates').select('*').eq('id', id).maybeSingle();
  if (!template) notFound();
  const { count: campaigns } = await supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('template_id', id);
  const campaign = template.kind === 'campaign';
  const sandbox = providerKind() === 'sandbox';

  return (
    <>
      <PageHeader
        title={template.name}
        back={{ href: '/admin/plantillas', label: 'Plantillas' }}
        description={
          campaign ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={TEMPLATE_STATUS_TONES[template.wa_status]}>{TEMPLATE_STATUS_LABELS[template.wa_status]}</Badge>
              <span>
                Nombre en WhatsApp: <code>{template.wa_template_name}</code> · actualizada {formatDateTime(template.updated_at)}
              </span>
            </span>
          ) : (
            'Mensaje rápido: no necesita aprobación de WhatsApp.'
          )
        }
      />

      {error === 'en-uso' ? (
        <div className="mb-4">
          <Notice tone="danger">No se puede eliminar: la usan {campaigns} campaña(s). Se conserva para el historial.</Notice>
        </div>
      ) : null}

      {campaign ? (
        <Card title="Revisión de WhatsApp" className="mb-6">
          {template.wa_status === 'rejected' ? (
            <div className="mb-3">
              <Notice tone="danger">
                WhatsApp la rechazó{template.wa_rejection_reason ? `: ${template.wa_rejection_reason}` : ''}. Ajusta el texto (evita que parezca spam, no empieces ni termines con {'{{nombre}}'}) y guárdala: se enviará como versión nueva.
              </Notice>
            </div>
          ) : null}
          {template.wa_status === 'approved' ? (
            <p className="text-sm text-muted-foreground">Lista para campañas y para escribir a clientes con la ventana de 24 h cerrada.</p>
          ) : template.wa_status === 'pending' ? (
            <p className="text-sm text-muted-foreground">En revisión. El estado se actualiza solo cuando WhatsApp responde; también puedes consultarlo ahora.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              WhatsApp debe aprobarla antes de usarla. Suele tardar minutos, a veces hasta 48 horas.{sandbox ? ' En modo prueba se aprueba al instante.' : ''}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {template.wa_status === 'draft' || template.wa_status === 'rejected' ? <ActionForm action={submitTemplateForReview.bind(null, id)} label="Enviar a revisión" variant="primary" /> : null}
            {template.wa_status === 'pending' || template.wa_status === 'paused' ? <ActionForm action={refreshTemplate.bind(null, id)} label="Consultar estado" /> : null}
          </div>
        </Card>
      ) : null}

      <TemplateEditor
        action={saveTemplate.bind(null, id)}
        siteUrl={siteUrl()}
        locked={Boolean(campaigns)}
        initial={{
          name: template.name,
          kind: campaign ? 'campaign' : 'chat',
          body: template.body,
          footer: template.footer ?? '',
          buttonText: template.button_text ?? '',
          buttonUrl: template.button_url ?? '',
          category: template.wa_category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
          isDefault: template.is_default,
        }}
      />

      <Card title="Eliminar" className="mt-8 max-w-xl">
        <p className="mb-3 text-xs text-muted-foreground">
          {campaigns ? 'Esta plantilla se usó en campañas: se conserva para el historial.' : 'Se borra del panel. Si ya estaba aprobada en WhatsApp, allá queda registrada pero sin uso.'}
        </p>
        {campaigns ? null : (
          <form action={deleteTemplate.bind(null, id)}>
            <SubmitButton variant="danger" confirm="¿Eliminar esta plantilla?">
              Eliminar plantilla
            </SubmitButton>
          </form>
        )}
      </Card>
    </>
  );
}
