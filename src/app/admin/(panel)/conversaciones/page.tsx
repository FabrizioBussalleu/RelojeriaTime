import Link from 'next/link';
import { Bot, UserRound } from 'lucide-react';
import { AutoRefresh } from '@/components/admin/ConversationComposer';
import { NewSimulationForm } from '@/components/admin/NewSimulationForm';
import { Badge, daysAgoIso, EmptyState, PageHeader, timeAgo } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { displayPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { isWindowOpen } from '@/lib/whatsapp/messaging';
import { providerKind } from '@/lib/whatsapp/provider';
import { simulateNewCustomer } from './actions';

export const metadata = { title: 'Conversaciones' };
export const maxDuration = 300;

const VIEWS = {
  todas: 'Todas',
  atencion: 'Requieren atención',
  ia: 'Atiende la IA',
  equipo: 'Atiende el equipo',
  abiertas: 'Ventana abierta',
} as const;

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ vista?: string; q?: string }> }) {
  const { supabase } = await requireAdmin();
  const { vista, q } = await searchParams;
  const view = vista && vista in VIEWS ? (vista as keyof typeof VIEWS) : 'todas';

  let query = supabase
    .from('wa_conversations')
    .select('id, mode, needs_attention, attention_reason, unread_count, last_inbound_at, last_message_at, customer:customers!inner(id, name, whatsapp_name, phone)')
    .not('last_message_at', 'is', null);
  if (view === 'atencion') query = query.eq('needs_attention', true);
  if (view === 'ia') query = query.eq('mode', 'ai');
  if (view === 'equipo') query = query.eq('mode', 'human');
  if (view === 'abiertas') query = query.gte('last_inbound_at', daysAgoIso(1));
  const term = q?.replace(/[,()*%\\]/g, ' ').trim();
  if (term) {
    const digits = term.replace(/\D/g, '');
    query = query.or([`name.ilike.*${term}*`, `whatsapp_name.ilike.*${term}*`, ...(digits.length >= 3 ? [`phone.like.*${digits}*`] : [])].join(','), { referencedTable: 'customers' });
  }
  const { data: conversations } = await query.order('needs_attention', { ascending: false }).order('last_message_at', { ascending: false }).limit(100);

  const ids = (conversations ?? []).map((conversation) => conversation.id);
  const { data: lastMessages } = ids.length
    ? await supabase.from('wa_messages').select('conversation_id, body, type, sender, created_at').in('conversation_id', ids).order('created_at', { ascending: false }).limit(ids.length * 3)
    : { data: [] };
  const preview = new Map<string, { body: string | null; type: string; sender: string }>();
  for (const message of lastMessages ?? []) if (!preview.has(message.conversation_id)) preview.set(message.conversation_id, message);

  return (
    <>
      <AutoRefresh intervalMs={10_000} />
      <PageHeader title="Conversaciones" description="Mensajes de WhatsApp. La IA responde primero; lo que deriva aparece como “requiere atención”." />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="Vistas">
          {Object.entries(VIEWS).map(([key, label]) => (
            <Link
              key={key}
              href={key === 'todas' ? '/admin/conversaciones' : `/admin/conversaciones?vista=${key}`}
              aria-current={view === key ? 'page' : undefined}
              className={cn('border px-3 py-1.5 text-xs uppercase tracking-wider', view === key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex gap-2">
          {view !== 'todas' ? <input type="hidden" name="vista" value={view} /> : null}
          <input name="q" defaultValue={q} placeholder="Buscar cliente o número" aria-label="Buscar conversaciones" className="w-full border border-border bg-background px-3 py-1.5 text-sm lg:w-64" />
        </form>
      </div>

      {conversations?.length ? (
        <ul className="divide-y divide-border border border-border">
          {conversations.map((conversation) => {
            const last = preview.get(conversation.id);
            const customer = conversation.customer;
            return (
              <li key={conversation.id}>
                <Link href={`/admin/conversaciones/${conversation.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                  <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>
                    {conversation.mode === 'ai' ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate text-sm', conversation.unread_count ? 'font-semibold' : '')}>{customer.name ?? customer.whatsapp_name ?? displayPhone(customer.phone)}</span>
                      {conversation.needs_attention ? <Badge tone="warning">Atención</Badge> : null}
                      {isWindowOpen(conversation.last_inbound_at) ? null : <Badge>24 h cerrada</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {conversation.needs_attention && conversation.attention_reason
                        ? conversation.attention_reason
                        : last
                          ? `${last.sender === 'customer' ? '' : last.sender === 'ai' ? 'IA: ' : last.sender === 'campaign' ? 'Campaña: ' : 'Tú: '}${last.body ?? (last.type === 'image' ? 'Foto' : 'Mensaje')}`
                          : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{timeAgo(conversation.last_message_at)}</span>
                    {conversation.unread_count ? <span className="min-w-5 bg-foreground px-1.5 text-center text-xs font-semibold text-background">{conversation.unread_count}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={view === 'todas' && !term ? 'Sin conversaciones todavía' : 'Nada por aquí'}>
          {view === 'todas' && !term ? 'Cuando un cliente escriba al WhatsApp de la tienda o responda una campaña, la conversación aparecerá aquí.' : 'Prueba con otra vista o búsqueda.'}
        </EmptyState>
      )}

      {providerKind() === 'sandbox' ? (
        <div className="mt-6 max-w-2xl">
          <NewSimulationForm action={simulateNewCustomer} />
        </div>
      ) : null}
    </>
  );
}
