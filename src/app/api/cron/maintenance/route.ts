import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cleanupOrphanUploads, processDeletionQueue } from '@/lib/cloudinary/maintenance';
import { refreshTemplateStatus, resumeSendingCampaigns } from '@/lib/crm/campaigns';
import { createServiceClient } from '@/lib/supabase/clients';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Mantenimiento diario (Vercel Cron, ver vercel.json): cada tarea corre aunque otra falle.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const run = async <T,>(task: () => Promise<T>) => {
    try {
      return { ok: true as const, result: await task() };
    } catch (error) {
      console.error('Tarea de mantenimiento fallida', error);
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const expiredOrders = await run(async () => {
    const { data, error } = await createServiceClient().rpc('expire_pending_orders');
    if (error) throw error;
    return data;
  });
  const deletionQueue = await run(() => processDeletionQueue());
  const orphanUploads = await run(() => cleanupOrphanUploads());
  // Plantillas en revisión (por si se perdió el aviso del webhook) y campañas que quedaron a medias.
  const templates = await run(async () => {
    const { data, error } = await createServiceClient().from('message_templates').select('*').eq('wa_status', 'pending');
    if (error) throw error;
    return Promise.all(data.map((template) => refreshTemplateStatus(template)));
  });
  const campaigns = await run(() => resumeSendingCampaigns());

  const ok = expiredOrders.ok && deletionQueue.ok && orphanUploads.ok && templates.ok && campaigns.ok;
  return NextResponse.json({ ok, expiredOrders, deletionQueue, orphanUploads, templates, campaigns }, { status: ok ? 200 : 500 });
}
