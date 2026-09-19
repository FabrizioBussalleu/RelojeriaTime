import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, buttonClass, EmptyState, formatDateTime, PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { CAMPAIGN_STATUS_LABELS } from '@/lib/crm/labels';

export const metadata = { title: 'Campañas' };

export default async function CampaignsPage() {
  const { supabase } = await requireAdmin();
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, recipients_count, created_at, started_at, finished_at, template:message_templates(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader
        title="Campañas"
        description="Envíos masivos por WhatsApp a clientes que aceptaron recibir novedades. El primer mensaje es una plantilla aprobada; si el cliente responde, sigue la conversación con la IA."
        actions={
          <Link href="/admin/campanas/nueva" className={buttonClass.primary}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva campaña
          </Link>
        }
      />
      {campaigns?.length ? (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Campaña</th>
                <th className="px-3 py-2 font-medium">Plantilla</th>
                <th className="px-3 py-2 text-right font-medium">Destinatarios</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/campanas/${campaign.id}`} className="font-medium hover:underline">
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{campaign.template?.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{campaign.status === 'draft' ? '—' : campaign.recipients_count}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDateTime(campaign.started_at ?? campaign.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={campaign.status === 'sent' ? 'success' : campaign.status === 'sending' ? 'info' : campaign.status === 'draft' ? 'neutral' : 'danger'}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Sin campañas">Crea una plantilla de WhatsApp, espera su aprobación y arma tu primera campaña.</EmptyState>
      )}
    </>
  );
}
