import { TemplateEditor } from '@/components/admin/TemplateEditor';
import { PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { siteUrl } from '@/lib/crm/campaigns';
import { saveTemplate } from '../actions';

export const metadata = { title: 'Nueva plantilla' };

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireAdmin();
  const { tipo } = await searchParams;
  const campaign = tipo !== 'chat';
  return (
    <>
      <PageHeader title="Nueva plantilla" back={{ href: '/admin/plantillas', label: 'Plantillas' }} />
      <TemplateEditor
        action={saveTemplate.bind(null, null)}
        siteUrl={siteUrl()}
        initial={{
          name: '',
          kind: campaign ? 'campaign' : 'chat',
          body: campaign ? 'Hola {{nombre}}, llegaron relojes nuevos a Time Relojería. Mira el catálogo y escríbenos si alguno te gusta.' : 'Hola {{nombre}}, ',
          footer: campaign ? 'Responde BAJA para no recibir novedades.' : '',
          buttonText: campaign ? 'Ver catálogo' : '',
          buttonUrl: '',
          category: 'MARKETING',
          isDefault: false,
        }}
      />
    </>
  );
}
