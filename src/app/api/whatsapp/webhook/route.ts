import { after, NextResponse } from 'next/server';
import { runAssistant } from '@/lib/assistant/run';
import { handleWebhookPayload, verifyWebhookRequest, type WebhookPayload } from '@/lib/whatsapp/webhook';

export const dynamic = 'force-dynamic';
// El asistente corre después de responder 200: WhatsApp exige una respuesta rápida al webhook.
export const maxDuration = 300;

// Verificación del webhook que hace Meta al configurarlo.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (verifyToken && params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === verifyToken) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Verificación inválida.' }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const url = new URL(request.url);
  if (!verifyWebhookRequest(rawBody, request.headers.get('x-hub-signature-256'), url.searchParams.get('token'))) {
    return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // Los mensajes se guardan antes de responder (si algo falla, WhatsApp reintenta);
  // las respuestas del asistente se generan después.
  const { conversationIds } = await handleWebhookPayload(payload);
  if (conversationIds.length) {
    after(async () => {
      for (const conversationId of conversationIds) await runAssistant(conversationId);
    });
  }
  return NextResponse.json({ ok: true });
}
