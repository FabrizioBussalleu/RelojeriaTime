import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, Bot, Check, CheckCheck, Clock, UserRound } from 'lucide-react';
import { SubmitButton } from '@/components/admin/ClientBits';
import { AutoRefresh, MessageComposer, SimulatorForm, TemplateSender } from '@/components/admin/ConversationComposer';
import { Badge, Card, formatDateTime, Notice, PageHeader } from '@/components/admin/ui';
import { isAssistantConfigured } from '@/lib/assistant/model';
import { requireAdmin } from '@/lib/auth';
import { renderTemplateMessage } from '@/lib/crm/campaigns';
import { MESSAGE_SENDER_LABELS } from '@/lib/crm/labels';
import { displayPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { isWindowOpen, SERVICE_WINDOW_MS } from '@/lib/whatsapp/messaging';
import { providerKind } from '@/lib/whatsapp/provider';
import { markResolved, releaseToAssistant, sendAgentMessage, sendTemplateMessage, simulateCustomerMessage, takeOverConversation } from '../actions';

export const metadata = { title: 'Conversación' };
// Las acciones de esta página disparan al asistente en segundo plano (after()).
export const maxDuration = 300;

const MESSAGE_LIMIT = 150;

function StatusIcon({ status, error }: { status: string; error: string | null }) {
  if (status === 'failed') return <AlertTriangle className="h-3.5 w-3.5 text-red-400" aria-label={`No enviado: ${error ?? ''}`} />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Leído" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregado" />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5" aria-label="Enviado" />;
  return <Clock className="h-3.5 w-3.5" aria-label="En cola" />;
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: conversation } = await supabase
    .from('wa_conversations')
    .select('*, customer:customers(id, name, whatsapp_name, phone, whatsapp_opt_in, opt_out_at)')
    .eq('id', id)
    .maybeSingle();
  if (!conversation || !conversation.customer) notFound();

  const [{ data: recent }, { data: templates }] = await Promise.all([
    supabase.from('wa_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT),
    supabase.from('message_templates').select('*').order('name'),
  ]);
  if (conversation.unread_count > 0) await supabase.from('wa_conversations').update({ unread_count: 0 }).eq('id', id);

  const messages = [...(recent ?? [])].reverse();
  const customer = conversation.customer;
  const name = customer.name ?? customer.whatsapp_name;
  const windowOpen = isWindowOpen(conversation.last_inbound_at);
  const windowEndsAt = conversation.last_inbound_at ? new Date(Date.parse(conversation.last_inbound_at) + SERVICE_WINDOW_MS).toISOString() : null;
  const aiMode = conversation.mode === 'ai';
  const sandbox = providerKind() === 'sandbox';
  const chatTemplates = (templates ?? []).filter((template) => template.kind === 'chat');
  const approved = (templates ?? []).filter((template) => template.wa_status === 'approved' && template.wa_template_name);

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title={name ?? displayPhone(customer.phone)}
        back={{ href: '/admin/conversaciones', label: 'Conversaciones' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/clientes/${customer.id}`} className="underline underline-offset-4">
              {displayPhone(customer.phone)}
            </Link>
            {aiMode ? (
              <Badge tone="info">
                <Bot className="h-3 w-3" aria-hidden /> Atiende la IA
              </Badge>
            ) : (
              <Badge tone="strong">
                <UserRound className="h-3 w-3" aria-hidden /> Atiende el equipo
              </Badge>
            )}
            {conversation.needs_attention ? <Badge tone="warning">Requiere atención</Badge> : null}
            {windowOpen ? <Badge tone="success">Ventana abierta hasta {formatDateTime(windowEndsAt)}</Badge> : <Badge>Ventana de 24 h cerrada</Badge>}
          </span>
        }
        actions={
          <>
            {aiMode ? (
              <form action={takeOverConversation.bind(null, id)}>
                <SubmitButton variant="secondary">Tomar conversación</SubmitButton>
              </form>
            ) : (
              <form action={releaseToAssistant.bind(null, id)}>
                <SubmitButton variant="secondary">
                  <Bot className="h-4 w-4" aria-hidden />
                  Devolver a la IA
                </SubmitButton>
              </form>
            )}
            {conversation.needs_attention ? (
              <form action={markResolved.bind(null, id)}>
                <SubmitButton variant="primary">Marcar resuelta</SubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      {conversation.needs_attention && conversation.attention_reason ? (
        <div className="mb-4">
          <Notice tone="warning">Motivo: {conversation.attention_reason}</Notice>
        </div>
      ) : null}
      {aiMode && !isAssistantConfigured() ? (
        <div className="mb-4">
          <Notice tone="warning">La IA no puede responder hasta configurar la clave de Anthropic; los mensajes nuevos quedan para el equipo.</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-0 sm:p-0">
            <ol className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto p-4" aria-label="Mensajes">
              {messages.length === MESSAGE_LIMIT ? (
                <li className="text-center text-xs text-muted-foreground">Se muestran los últimos {MESSAGE_LIMIT} mensajes.</li>
              ) : null}
              {messages.length ? (
                messages.map((message) => {
                  const inbound = message.direction === 'in';
                  return (
                    <li key={message.id} className={cn('flex max-w-[85%] flex-col gap-1', inbound ? 'self-start' : 'self-end items-end')}>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {MESSAGE_SENDER_LABELS[message.sender]} · {formatDateTime(message.created_at)}
                      </span>
                      <div
                        className={cn(
                          'border px-3 py-2 text-sm',
                          inbound ? 'border-border bg-card' : message.sender === 'ai' ? 'border-sky-500/40 bg-sky-500/10' : message.sender === 'campaign' ? 'border-amber-500/40 bg-amber-500/5' : 'border-foreground/40 bg-muted/40'
                        )}
                      >
                        {message.type === 'image' && message.media_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto ya optimizada por Cloudinary para WhatsApp
                          <img src={message.media_url} alt="" className="mb-2 max-h-60 w-auto" loading="lazy" />
                        ) : null}
                        {message.body ? <p className="whitespace-pre-line break-words">{message.body}</p> : message.type !== 'image' ? <p className="text-muted-foreground">[Mensaje de tipo no compatible]</p> : null}
                      </div>
                      {!inbound ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <StatusIcon status={message.status} error={message.error} />
                          {message.status === 'failed' ? <span className="text-red-400">No enviado: {message.error}</span> : null}
                        </span>
                      ) : null}
                    </li>
                  );
                })
              ) : (
                <li className="py-10 text-center text-sm text-muted-foreground">Todavía no hay mensajes.</li>
              )}
            </ol>
          </Card>

          {windowOpen ? (
            <MessageComposer
              action={sendAgentMessage.bind(null, id)}
              windowOpen={windowOpen}
              customerName={name}
              chatTemplates={chatTemplates.map((template) => ({ id: template.id, name: template.name, body: template.body }))}
              aiActive={aiMode}
            />
          ) : (
            <TemplateSender
              action={sendTemplateMessage.bind(null, id)}
              templates={approved.map((template) => ({ id: template.id, name: template.name, preview: renderTemplateMessage(template, name) }))}
            />
          )}

          {sandbox ? <SimulatorForm action={simulateCustomerMessage.bind(null, id)} /> : null}
        </div>

        <aside aria-label="Detalles de la conversación" className="space-y-4">
          <Card title="Cómo funciona">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">IA:</strong> responde sola con el stock real y deriva al equipo cuando el cliente quiere comprar, pagar o reclamar.
              </li>
              <li>
                <strong className="text-foreground">Equipo:</strong> al escribir o tomar la conversación la IA se pausa. Vuelve sola tras las horas configuradas sin mensajes del equipo, o con &quot;Devolver a la IA&quot;.
              </li>
              <li>
                <strong className="text-foreground">24 horas:</strong> se puede escribir libremente hasta 24 h después del último mensaje del cliente; luego solo con plantilla aprobada.
              </li>
            </ul>
          </Card>
          <Card title="Cliente">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Novedades</dt>
                <dd>{customer.whatsapp_opt_in && !customer.opt_out_at ? 'Acepta' : customer.opt_out_at ? 'Se dio de baja' : 'Sin consentimiento'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Último mensaje</dt>
                <dd>{formatDateTime(conversation.last_inbound_at)}</dd>
              </div>
            </dl>
            <Link href={`/admin/clientes/${customer.id}`} className="mt-3 inline-block text-sm underline underline-offset-4">
              Ver ficha y compras
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
