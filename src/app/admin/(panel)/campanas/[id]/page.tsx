import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SubmitButton } from '@/components/admin/ClientBits';
import { CampaignForm } from '@/components/admin/CampaignForm';
import { AutoRefresh } from '@/components/admin/ConversationComposer';
import { Badge, Card, formatDateTime, Notice, PageHeader, StatCard } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { campaignQuota, isWithinSendingHours, renderTemplateMessage, SENDING_HOURS } from '@/lib/crm/campaigns';
import { CAMPAIGN_STATUS_LABELS, RECIPIENT_STATUS_LABELS, TEMPLATE_STATUS_LABELS } from '@/lib/crm/labels';
import { describeFilters, SegmentFiltersSchema } from '@/lib/crm/segments';
import { displayPhone } from '@/lib/phone';
import { formatPEN } from '@/lib/store';
import { cancelCampaign, continueCampaign, countSegment, deleteCampaign, saveCampaign } from '../actions';

export const metadata = { title: 'Campaña' };
export const maxDuration = 300;

const ATTRIBUTION_DAYS = 7;
const RECIPIENTS_SHOWN = 200;

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: campaign } = await supabase.from('campaigns').select('*, template:message_templates(*)').eq('id', id).maybeSingle();
  if (!campaign || !campaign.template) notFound();
  const filters = SegmentFiltersSchema.safeParse(campaign.filters).data ?? { audiencia: 'todos' as const };

  if (campaign.status === 'draft') {
    const [{ data: templates }, { data: brands }, { data: tagRows }, quota] = await Promise.all([
      supabase.from('message_templates').select('*').eq('kind', 'campaign').order('name'),
      supabase.from('brands').select('name').order('name'),
      supabase.from('customers').select('tags').not('tags', 'eq', '{}').limit(1000),
      campaignQuota(),
    ]);
    return (
      <>
        <PageHeader
          title={campaign.name}
          back={{ href: '/admin/campanas', label: 'Campañas' }}
          description="Borrador: ajusta los filtros y envíala cuando esté lista."
          actions={
            <form action={deleteCampaign.bind(null, id)}>
              <SubmitButton variant="danger" confirm="¿Eliminar este borrador?">
                Eliminar borrador
              </SubmitButton>
            </form>
          }
        />
        {error ? (
          <div className="mb-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : null}
        <CampaignForm
          action={saveCampaign.bind(null, id)}
          countAction={countSegment}
          templates={(templates ?? []).map((template) => ({
            id: template.id,
            name: template.name,
            body: template.body,
            footer: template.footer,
            buttonText: template.button_text,
            approved: template.wa_status === 'approved',
            status: TEMPLATE_STATUS_LABELS[template.wa_status].toLowerCase(),
          }))}
          brands={(brands ?? []).map((brand) => brand.name)}
          tags={[...new Set((tagRows ?? []).flatMap((row) => row.tags))].sort()}
          quota={quota}
          initial={{ name: campaign.name, templateId: campaign.template_id, filters }}
        />
      </>
    );
  }

  const [{ data: recipients }, quota] = await Promise.all([
    supabase
      .from('campaign_recipients')
      .select('id, customer_id, phone, status, error, sent_at, delivered_at, read_at, replied_at, customer:customers(name, whatsapp_name)')
      .eq('campaign_id', id)
      .order('id')
      .limit(10_000),
    campaignQuota(),
  ]);
  const rows = recipients ?? [];
  const count = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;
  const sent = count((row) => Boolean(row.sent_at));
  const delivered = count((row) => ['delivered', 'read'].includes(row.status));
  const read = count((row) => row.status === 'read');
  const replied = count((row) => Boolean(row.replied_at));
  const failed = count((row) => row.status === 'failed');
  const skipped = count((row) => row.status === 'skipped');
  const pending = count((row) => row.status === 'pending');
  const percent = (value: number) => (sent ? `${Math.round((value / sent) * 100)}%` : '—');

  // Ventas atribuidas: pedidos pagados por destinatarios dentro de los 7 días siguientes al envío.
  const sentAt = new Map(rows.filter((row) => row.sent_at).map((row) => [row.customer_id, Date.parse(row.sent_at!)]));
  const { data: orders } = sentAt.size
    ? await supabase
        .from('orders')
        .select('customer_id, total, created_at')
        .in('customer_id', [...sentAt.keys()].slice(0, 1000))
        .not('paid_at', 'is', null)
        .neq('status', 'cancelled')
        .gte('created_at', campaign.started_at ?? campaign.created_at)
    : { data: [] };
  const attributed = (orders ?? []).filter((order) => {
    const at = sentAt.get(order.customer_id!);
    const created = Date.parse(order.created_at);
    return at !== undefined && created >= at && created <= at + ATTRIBUTION_DAYS * 86_400_000;
  });
  const revenue = attributed.reduce((sum, order) => sum + order.total, 0);

  return (
    <>
      {campaign.status === 'sending' ? <AutoRefresh intervalMs={8000} /> : null}
      <PageHeader
        title={campaign.name}
        back={{ href: '/admin/campanas', label: 'Campañas' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={campaign.status === 'sent' ? 'success' : campaign.status === 'sending' ? 'info' : 'danger'}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
            <span>
              Iniciada {formatDateTime(campaign.started_at)}
              {campaign.finished_at ? ` · terminada ${formatDateTime(campaign.finished_at)}` : ''}
            </span>
          </span>
        }
        actions={
          campaign.status === 'sending' ? (
            <>
              <form action={continueCampaign.bind(null, id)}>
                <SubmitButton variant="secondary">Continuar envío</SubmitButton>
              </form>
              <form action={cancelCampaign.bind(null, id)}>
                <SubmitButton variant="danger" confirm={`¿Cancelar? Los ${pending} envíos pendientes no saldrán.`}>
                  Cancelar
                </SubmitButton>
              </form>
            </>
          ) : null
        }
      />

      {campaign.status === 'sending' && pending ? (
        <div className="mb-4">
          <Notice tone="info">
            Quedan {pending} por enviar.{' '}
            {!isWithinSendingHours()
              ? `Fuera del horario de envío (${SENDING_HOURS.from}:00–${SENDING_HOURS.to}:00): continúa en el próximo horario, con "Continuar envío" o con la tarea diaria.`
              : quota.remaining === 0
                ? `Se alcanzó el límite diario (${quota.limit}); sigue mañana automáticamente.`
                : 'Se están enviando en tandas.'}
          </Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Enviados" value={sent} hint={`de ${campaign.recipients_count}`} />
        <StatCard label="Entregados" value={delivered} hint={percent(delivered)} />
        <StatCard label="Leídos" value={read} hint={percent(read)} />
        <StatCard label="Respondieron" value={replied} hint={percent(replied)} />
        <StatCard label="Fallidos / omitidos" value={`${failed} / ${skipped}`} />
        <StatCard label={`Ventas (${ATTRIBUTION_DAYS} días)`} value={attributed.length} hint={revenue ? formatPEN(revenue) : 'Sin ventas atribuidas'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card title="Destinatarios">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Enviado</th>
                  <th className="py-2 font-medium">Respuesta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, RECIPIENTS_SHOWN).map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/clientes/${row.customer_id}`} className="hover:underline">
                        {row.customer?.name ?? row.customer?.whatsapp_name ?? displayPhone(row.phone)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.status === 'failed' ? 'danger' : row.status === 'read' ? 'success' : row.status === 'skipped' ? 'neutral' : 'info'}>{RECIPIENT_STATUS_LABELS[row.status]}</Badge>
                      {row.error ? <span className="mt-1 block text-xs text-muted-foreground">{row.error}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(row.sent_at)}</td>
                    <td className="py-2 text-muted-foreground">{row.replied_at ? formatDateTime(row.replied_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > RECIPIENTS_SHOWN ? <p className="mt-3 text-xs text-muted-foreground">Se muestran {RECIPIENTS_SHOWN} de {rows.length}.</p> : null}
        </Card>

        <div className="space-y-6">
          <Card title="Mensaje">
            <p className="whitespace-pre-line text-sm">{renderTemplateMessage(campaign.template, 'Ana')}</p>
            <Link href={`/admin/plantillas/${campaign.template.id}`} className="mt-3 inline-block text-xs text-muted-foreground underline">
              Plantilla: {campaign.template.name}
            </Link>
          </Card>
          <Card title="Segmento">
            <ul className="space-y-1 text-sm text-muted-foreground">
              {describeFilters(filters).map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
