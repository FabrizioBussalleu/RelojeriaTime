import { CampaignForm } from '@/components/admin/CampaignForm';
import { PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { campaignQuota } from '@/lib/crm/campaigns';
import { TEMPLATE_STATUS_LABELS } from '@/lib/crm/labels';
import { countSegment, saveCampaign } from '../actions';

export const metadata = { title: 'Nueva campaña' };
export const maxDuration = 300;

export default async function NewCampaignPage() {
  const { supabase } = await requireAdmin();
  const [{ data: templates }, { data: brands }, { data: tagRows }, quota] = await Promise.all([
    supabase.from('message_templates').select('*').eq('kind', 'campaign').order('name'),
    supabase.from('brands').select('name').order('name'),
    supabase.from('customers').select('tags').not('tags', 'eq', '{}').limit(1000),
    campaignQuota(),
  ]);
  const tags = [...new Set((tagRows ?? []).flatMap((row) => row.tags))].sort();

  return (
    <>
      <PageHeader title="Nueva campaña" back={{ href: '/admin/campanas', label: 'Campañas' }} description="Solo reciben la campaña los clientes con consentimiento vigente. El conteo se actualiza con cada filtro." />
      <CampaignForm
        action={saveCampaign.bind(null, null)}
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
        tags={tags}
        quota={quota}
        initial={{ name: '', templateId: '', filters: { audiencia: 'todos', excluir_campana_dias: 7 } }}
      />
    </>
  );
}
