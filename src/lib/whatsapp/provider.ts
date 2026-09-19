import 'server-only';

import { randomUUID } from 'node:crypto';
import { requireEnv } from '@/lib/env';

// Un solo formato de mensajes (el de la Cloud API de Meta) sirve para los tres modos:
//   meta      → Cloud API directa (graph.facebook.com), sin intermediario.
//   360dialog → proveedor intermedio con el mismo formato; permite coexistencia con la app del celular.
//   sandbox   → no envía nada: registra los mensajes para probar el CRM y el asistente sin WhatsApp.
export type ProviderKind = 'meta' | '360dialog' | 'sandbox';

export type OutgoingMessage =
  | { type: 'text'; to: string; body: string; previewUrl?: boolean }
  | { type: 'image'; to: string; link: string; caption?: string }
  | { type: 'template'; to: string; name: string; language: string; bodyParams: string[] };

export type TemplateDefinition = {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  body: string;
  bodyExample: string[];
  footer?: string | null;
  button?: { text: string; url: string } | null;
};

export type TemplateStatus = { status: string; rejectedReason: string | null };

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number
  ) {
    super(message);
    this.name = 'WhatsAppApiError';
  }
}

export interface WhatsAppProvider {
  readonly kind: ProviderKind;
  send(message: OutgoingMessage): Promise<{ id: string }>;
  createTemplate(definition: TemplateDefinition): Promise<TemplateStatus>;
  getTemplateStatus(name: string): Promise<TemplateStatus | null>;
}

function messagePayload(message: OutgoingMessage) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: message.to };
  switch (message.type) {
    case 'text':
      return { ...base, type: 'text', text: { body: message.body, preview_url: message.previewUrl ?? false } };
    case 'image':
      return { ...base, type: 'image', image: { link: message.link, ...(message.caption ? { caption: message.caption } : {}) } };
    case 'template':
      return {
        ...base,
        type: 'template',
        template: {
          name: message.name,
          language: { code: message.language },
          components: message.bodyParams.length
            ? [{ type: 'body', parameters: message.bodyParams.map((text) => ({ type: 'text', text })) }]
            : [],
        },
      };
  }
}

function templatePayload(definition: TemplateDefinition) {
  const components: Record<string, unknown>[] = [
    {
      type: 'BODY',
      text: definition.body,
      ...(definition.bodyExample.length ? { example: { body_text: [definition.bodyExample] } } : {}),
    },
  ];
  if (definition.footer) components.push({ type: 'FOOTER', text: definition.footer });
  if (definition.button) {
    components.push({ type: 'BUTTONS', buttons: [{ type: 'URL', text: definition.button.text, url: definition.button.url }] });
  }
  return { name: definition.name, language: definition.language, category: definition.category, components };
}

type ApiErrorBody = { error?: { message?: string; code?: number; error_data?: { details?: string } } };

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok || body.error) {
    const detail = body.error?.error_data?.details ?? body.error?.message ?? `HTTP ${response.status}`;
    throw new WhatsAppApiError(detail, body.error?.code ?? null, response.status);
  }
  return body;
}

class CloudApiProvider implements WhatsAppProvider {
  constructor(
    readonly kind: 'meta' | '360dialog',
    private readonly endpoints: { messages: string; templates: string },
    private readonly headers: Record<string, string>
  ) {}

  async send(message: OutgoingMessage) {
    const body = await request<{ messages?: { id: string }[] }>(this.endpoints.messages, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(messagePayload(message)),
    });
    const id = body.messages?.[0]?.id;
    if (!id) throw new WhatsAppApiError('WhatsApp no devolvió el id del mensaje.', null, 200);
    return { id };
  }

  async createTemplate(definition: TemplateDefinition) {
    const body = await request<{ status?: string }>(this.endpoints.templates, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(templatePayload(definition)),
    });
    return { status: (body.status ?? 'PENDING').toLowerCase(), rejectedReason: null };
  }

  async getTemplateStatus(name: string) {
    const url = new URL(this.endpoints.templates);
    if (this.kind === 'meta') {
      url.searchParams.set('name', name);
      url.searchParams.set('fields', 'name,status,rejected_reason');
    }
    const body = await request<{ data?: { name: string; status: string; rejected_reason?: string }[]; waba_templates?: { name: string; status: string; rejected_reason?: string }[] }>(
      url.toString(),
      { headers: this.headers }
    );
    const match = (body.data ?? body.waba_templates ?? []).find((template) => template.name === name);
    if (!match) return null;
    const reason = match.rejected_reason && match.rejected_reason !== 'NONE' ? match.rejected_reason : null;
    return { status: match.status.toLowerCase(), rejectedReason: reason };
  }
}

class SandboxProvider implements WhatsAppProvider {
  readonly kind = 'sandbox' as const;

  async send() {
    return { id: `sandbox.${randomUUID()}` };
  }

  // En sandbox las plantillas se aprueban al instante para poder probar campañas completas.
  async createTemplate() {
    return { status: 'approved', rejectedReason: null };
  }

  async getTemplateStatus() {
    return { status: 'approved', rejectedReason: null };
  }
}

export function providerKind(): ProviderKind {
  const kind = process.env.WHATSAPP_PROVIDER?.trim();
  return kind === 'meta' || kind === '360dialog' ? kind : 'sandbox';
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const kind = providerKind();
  if (kind === 'meta') {
    const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v25.0';
    const base = `https://graph.facebook.com/${version}`;
    return new CloudApiProvider(
      'meta',
      {
        messages: `${base}/${requireEnv('WHATSAPP_PHONE_NUMBER_ID')}/messages`,
        templates: `${base}/${requireEnv('WHATSAPP_WABA_ID')}/message_templates`,
      },
      { Authorization: `Bearer ${requireEnv('WHATSAPP_ACCESS_TOKEN')}` }
    );
  }
  if (kind === '360dialog') {
    const base = process.env.D360_BASE_URL?.trim() || 'https://waba-v2.360dialog.io';
    return new CloudApiProvider(
      '360dialog',
      { messages: `${base}/messages`, templates: `${base}/v1/configs/templates` },
      { 'D360-API-KEY': requireEnv('D360_API_KEY') }
    );
  }
  return new SandboxProvider();
}
