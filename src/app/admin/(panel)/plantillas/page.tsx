import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, buttonClass, Card, EmptyState, PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { TEMPLATE_STATUS_LABELS, TEMPLATE_STATUS_TONES } from '@/lib/crm/labels';

export const metadata = { title: 'Plantillas' };

export default async function TemplatesPage() {
  const { supabase } = await requireAdmin();
  const { data: templates } = await supabase.from('message_templates').select('*').order('kind').order('name');
  const chat = (templates ?? []).filter((template) => template.kind === 'chat');
  const campaign = (templates ?? []).filter((template) => template.kind === 'campaign');

  const list = (items: typeof chat, empty: string) =>
    items.length ? (
      <ul className="divide-y divide-border">
        {items.map((template) => (
          <li key={template.id}>
            <Link href={`/admin/plantillas/${template.id}`} className="flex items-start justify-between gap-3 py-3 hover:text-muted-foreground">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{template.name}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{template.body}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {template.kind === 'campaign' ? <Badge tone={TEMPLATE_STATUS_TONES[template.wa_status]}>{TEMPLATE_STATUS_LABELS[template.wa_status]}</Badge> : null}
                {template.is_default ? <Badge tone="strong">Por defecto</Badge> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState title="Sin plantillas">{empty}</EmptyState>
    );

  return (
    <>
      <PageHeader
        title="Plantillas"
        description="Textos editables con el nombre del cliente ({{nombre}}). Los mensajes rápidos se usan en chats abiertos; las plantillas de WhatsApp, para escribir primero."
        actions={
          <Link href="/admin/plantillas/nueva" className={buttonClass.primary}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva plantilla
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Plantillas de WhatsApp (campañas)">{list(campaign, 'Crea una para poder enviar campañas.')}</Card>
        <Card title="Mensajes rápidos">{list(chat, 'Crea una para “Abrir en WhatsApp” desde la ficha del cliente.')}</Card>
      </div>
    </>
  );
}
