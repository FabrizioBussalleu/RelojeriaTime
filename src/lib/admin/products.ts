import 'server-only';

import { processDeletionQueue } from '@/lib/cloudinary/maintenance';
import { destroyProductFolder } from '@/lib/cloudinary/server';
import type { createSessionClient } from '@/lib/supabase/clients';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

// ELIMINAR un producto (no agotar ni archivar): la fila se borra con la sesión del admin (RLS),
// el trigger encola todas sus imágenes y aquí mismo se destruyen en Cloudinary junto con su carpeta.
// Si Cloudinary falla, las imágenes quedan en la cola y el cron diario las reintenta.
export async function deleteProductWithImages(supabase: SessionClient, productId: string) {
  const { data: images, error: imagesError } = await supabase.from('product_images').select('public_id').eq('product_id', productId);
  if (imagesError) throw imagesError;

  const { error: deleteError, count } = await supabase.from('products').delete({ count: 'exact' }).eq('id', productId);
  if (deleteError) throw deleteError;
  if (!count) throw new Error('El producto no existe o no tienes permiso para eliminarlo.');

  const publicIds = images.map((image) => image.public_id);
  const cloudinary = publicIds.length ? await processDeletionQueue({ publicIds }) : { removed: 0, failed: 0 };
  try {
    await destroyProductFolder(productId);
  } catch {
    // Queda cubierto por la cola: la carpeta vacía no afecta a la tienda.
  }
  return { images: publicIds.length, ...cloudinary };
}
