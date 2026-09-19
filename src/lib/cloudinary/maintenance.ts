import 'server-only';

import { createServiceClient } from '@/lib/supabase/clients';
import { destroyAssets, listPendingUploads } from './server';

const MAX_ATTEMPTS = 10;

// Procesa la cola que llena la base al eliminar o reemplazar imágenes (trigger enqueue_image_deletion).
// Lo borrado sale de la cola; lo que falla queda con el error para el próximo intento.
export async function processDeletionQueue({ publicIds, limit = 500 }: { publicIds?: string[]; limit?: number } = {}) {
  const supabase = createServiceClient();
  let query = supabase
    .from('asset_deletion_queue')
    .select('id, public_id, attempts')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(limit);
  if (publicIds) query = query.in('public_id', publicIds);

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows.length) return { removed: 0, failed: 0 };

  let result: Awaited<ReturnType<typeof destroyAssets>>;
  try {
    result = await destroyAssets(rows.map((row) => row.public_id));
  } catch (destroyError) {
    const message = destroyError instanceof Error ? destroyError.message : String(destroyError);
    result = { removed: [], failed: Object.fromEntries(rows.map((row) => [row.public_id, message])) };
  }

  if (result.removed.length) {
    const { error: deleteError } = await supabase.from('asset_deletion_queue').delete().in('public_id', result.removed);
    if (deleteError) throw deleteError;
  }
  for (const row of rows.filter((candidate) => candidate.public_id in result.failed)) {
    await supabase
      .from('asset_deletion_queue')
      .update({ attempts: row.attempts + 1, last_error: result.failed[row.public_id] })
      .eq('id', row.id);
  }
  return { removed: result.removed.length, failed: Object.keys(result.failed).length };
}

// Subidas que nunca llegaron a un producto guardado (formulario cancelado, pestaña cerrada).
// Solo se borran si pasaron `maxAgeHours` y ninguna fila de product_images las referencia.
export async function cleanupOrphanUploads({ maxAgeHours = 24 } = {}) {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const candidates = (await listPendingUploads()).filter((resource) => Date.parse(resource.created_at) < cutoff);
  if (!candidates.length) return { removed: 0 };

  const supabase = createServiceClient();
  const ids = candidates.map((resource) => resource.public_id);
  const { data: referenced, error } = await supabase.from('product_images').select('public_id').in('public_id', ids);
  if (error) throw error;

  const inUse = new Set(referenced.map((row) => row.public_id));
  const orphans = ids.filter((id) => !inUse.has(id));
  if (!orphans.length) return { removed: 0 };
  const { removed } = await destroyAssets(orphans);
  return { removed: removed.length };
}
