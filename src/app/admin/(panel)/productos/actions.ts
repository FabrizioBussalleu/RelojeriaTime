'use server';

import { revalidatePath } from 'next/cache';
import { issuesToFieldErrors, ProductInputSchema, slugify, type ProductInput } from '@/lib/admin/product-input';
import { deleteProductWithImages } from '@/lib/admin/products';
import { getProductEditData } from '@/lib/admin/products-query';
import { getAdminSession } from '@/lib/auth';
import { processDeletionQueue } from '@/lib/cloudinary/maintenance';
import { destroyAssets, productFolder } from '@/lib/cloudinary/server';
import type { ProductStatus } from '@/lib/admin/labels';

export type SaveProductResult = { ok: true; id: string; slug: string; created: boolean } | { ok: false; error: string; fieldErrors?: Record<string, string> };

// La tienda y la ficha del producto se regeneran al momento (ISR).
function revalidateStore(slug?: string) {
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
  if (slug) revalidatePath(`/producto/${slug}`);
  revalidatePath('/admin/productos');
  revalidatePath('/admin/organizador');
}

const DB_ERRORS: [RegExp, string][] = [
  [/product_variants_sku_key/, 'Ese SKU ya lo usa otro producto.'],
  [/compare_at_price/, 'El precio anterior debe ser mayor que el precio actual.'],
  [/pertenece a otro producto/, 'Una de las fotos pertenece a otro producto.'],
];

export async function saveProduct(input: ProductInput): Promise<SaveProductResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  const product = parsed.data;

  const { data: previous } = await session.supabase.from('products').select('slug').eq('id', product.id).maybeSingle();
  const { data, error } = await session.supabase.rpc('save_product', {
    p_product: {
      ...product,
      slug: previous?.slug ?? (slugify(product.slug) || 'reloj'),
      variants: product.variants.map((variant) => ({ ...variant, label: variant.label || undefined })),
    },
  });
  if (error) {
    const friendly = DB_ERRORS.find(([pattern]) => pattern.test(error.message))?.[1];
    if (!friendly) console.error('save_product', error);
    return { ok: false, error: friendly ?? 'No se pudo guardar el producto. Intenta de nuevo.' };
  }
  const result = data as { id: string; slug: string; created: boolean; removed_images: string[] };

  // Las fotos quitadas ya están en la cola de borrado: se destruyen ahora (si falla, reintenta el cron).
  if (result.removed_images.length) {
    await processDeletionQueue({ publicIds: result.removed_images }).catch((queueError) => console.error('Cola de Cloudinary', queueError));
  }
  revalidateStore(result.slug);
  if (previous?.slug && previous.slug !== result.slug) revalidatePath(`/producto/${previous.slug}`);
  return { ok: true, id: result.id, slug: result.slug, created: result.created };
}

// Fotos subidas en un formulario que no se guardó (cancelar o quitar antes de guardar). Solo se
// borran las de la carpeta del producto que ningún producto guardado usa.
export async function discardUploads(productId: string, publicIds: string[]) {
  const session = await getAdminSession();
  if (!session || !publicIds.length) return;
  const prefix = `${productFolder(productId)}/`;
  const candidates = publicIds.filter((id) => id.startsWith(prefix)).slice(0, 50);
  if (!candidates.length) return;
  const { data: used } = await session.supabase.from('product_images').select('public_id').in('public_id', candidates);
  const inUse = new Set((used ?? []).map((row) => row.public_id));
  const orphans = candidates.filter((id) => !inUse.has(id));
  if (orphans.length) await destroyAssets(orphans).catch((destroyError) => console.error('Descartar subidas', destroyError));
}

export async function deleteProduct(productId: string): Promise<{ ok: boolean; error?: string; images?: number }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const { data: product } = await session.supabase.from('products').select('slug').eq('id', productId).maybeSingle();
  try {
    const result = await deleteProductWithImages(session.supabase, productId);
    revalidateStore(product?.slug);
    return { ok: true, images: result.images };
  } catch (error) {
    console.error('Eliminar producto', error);
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo eliminar.' };
  }
}

export async function setProductStatus(productId: string, status: ProductStatus): Promise<{ ok: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  if (status === 'active') {
    const { count } = await session.supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', productId);
    if (!count) return { ok: false, error: 'Agrega al menos una foto antes de publicarlo.' };
  }
  const { data, error } = await session.supabase.from('products').update({ status }).eq('id', productId).select('slug').single();
  if (error) return { ok: false, error: 'No se pudo cambiar el estado.' };
  revalidateStore(data.slug);
  return { ok: true };
}

// Agotar: stock en cero en todas las variantes. Las fotos no se tocan.
export async function markSoldOut(productId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const { error } = await session.supabase.from('product_variants').update({ stock: 0 }).eq('product_id', productId);
  if (error) return { ok: false, error: 'No se pudo actualizar el stock.' };
  const { data } = await session.supabase.from('products').select('slug').eq('id', productId).single();
  revalidateStore(data?.slug);
  return { ok: true };
}

async function createTaxonomy(table: 'brands' | 'categories', rawName: string) {
  const session = await getAdminSession();
  if (!session) return { ok: false as const, error: 'Tu sesión expiró.' };
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 80) return { ok: false as const, error: 'Escribe un nombre de hasta 80 caracteres.' };
  const { data: existing } = await session.supabase.from(table).select('id, name').ilike('name', name).maybeSingle();
  if (existing) return { ok: true as const, id: existing.id, name: existing.name };
  let slug = slugify(name);
  const { count } = await session.supabase.from(table).select('id', { count: 'exact', head: true }).like('slug', `${slug}%`);
  if (count) slug = `${slug}-${count + 1}`;
  const { data, error } = await session.supabase.from(table).insert({ name, slug }).select('id, name').single();
  if (error) return { ok: false as const, error: 'No se pudo crear.' };
  return { ok: true as const, id: data.id, name: data.name };
}

export async function createBrand(name: string) {
  return createTaxonomy('brands', name);
}

export async function createCategory(name: string) {
  return createTaxonomy('categories', name);
}

// Datos para abrir el desplegable de edición en la lista.
export async function loadProductForEdit(productId: string) {
  const session = await getAdminSession();
  if (!session) return { ok: false as const, error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const data = await getProductEditData(session.supabase, productId);
  if (!data) return { ok: false as const, error: 'El producto ya no existe.' };
  return { ok: true as const, ...data };
}

type BulkResult = { ok: true; changed: number; skipped: string[] } | { ok: false; error: string };

// Cambios en bloque desde la lista (varios productos seleccionados).
export async function bulkSetStatus(productIds: string[], status: ProductStatus): Promise<BulkResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const ids = [...new Set(productIds)].slice(0, 500);
  let allowed = ids;
  let skipped: string[] = [];
  if (status === 'active') {
    // Publicar exige al menos una foto: los que no tienen quedan como están.
    const { data: withPhotos } = await session.supabase.from('product_images').select('product_id').in('product_id', ids);
    const ok = new Set((withPhotos ?? []).map((row) => row.product_id));
    allowed = ids.filter((id) => ok.has(id));
    const { data: names } = await session.supabase.from('products').select('name').in('id', ids.filter((id) => !ok.has(id)));
    skipped = (names ?? []).map((row) => row.name);
  }
  if (!allowed.length) return { ok: true, changed: 0, skipped };
  const { data, error } = await session.supabase.from('products').update({ status }).in('id', allowed).select('slug');
  if (error) return { ok: false, error: 'No se pudieron actualizar los productos.' };
  revalidateStore();
  for (const row of data) revalidatePath(`/producto/${row.slug}`);
  return { ok: true, changed: data.length, skipped };
}

export async function bulkMarkSoldOut(productIds: string[]): Promise<BulkResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const ids = [...new Set(productIds)].slice(0, 500);
  const { error } = await session.supabase.from('product_variants').update({ stock: 0 }).in('product_id', ids);
  if (error) return { ok: false, error: 'No se pudo actualizar el stock.' };
  revalidateStore();
  revalidatePath('/producto/[slug]', 'page');
  return { ok: true, changed: ids.length, skipped: [] };
}
