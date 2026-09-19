import 'server-only';

import type { ProductFormInitial } from '@/components/admin/products/ProductForm';
import type { ProductStatus } from '@/lib/admin/labels';
import type { ImageCrop } from '@/lib/cloudinary/url';
import type { createSessionClient } from '@/lib/supabase/clients';

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  price: number;
  compareAtPrice: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  brand: string | null;
  brandId: string | null;
  category: string | null;
  categoryId: string | null;
  stock: number;
  variants: number;
  skus: string[];
  imageCount: number;
  primaryImage: { public_id: string; crop: ImageCrop | null; brightness: number; contrast: number } | null;
};

type Row = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  price: number;
  compare_at_price: number | null;
  position: number;
  created_at: string;
  updated_at: string;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  images: { public_id: string; is_primary: boolean; position: number; crop: unknown; brightness: number; contrast: number }[];
  variants: { stock: number; sku: string | null }[];
};

// Todos los productos (cualquier estado) con stock total y foto principal. Una boutique maneja
// cientos, no miles: se filtra y ordena en el servidor sobre la lista completa.
export async function getAdminProducts(supabase: SessionClient): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, slug, name, status, price, compare_at_price, position, created_at, updated_at, brand:brands(id, name), category:categories(id, name), images:product_images(public_id, is_primary, position, crop, brightness, contrast), variants:product_variants(stock, sku)'
    )
    .order('position')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data as unknown as Row[]).map((row) => {
    const primary = [...row.images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)[0];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      price: Number(row.price),
      compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      brand: row.brand?.name ?? null,
      brandId: row.brand?.id ?? null,
      category: row.category?.name ?? null,
      categoryId: row.category?.id ?? null,
      stock: row.variants.reduce((sum, variant) => sum + variant.stock, 0),
      variants: row.variants.length,
      skus: row.variants.map((variant) => variant.sku).filter((sku): sku is string => Boolean(sku)),
      imageCount: row.images.length,
      primaryImage: primary ? { public_id: primary.public_id, crop: primary.crop as ImageCrop | null, brightness: primary.brightness, contrast: primary.contrast } : null,
    };
  });
}

export type ProductEditData = {
  initial: ProductFormInitial;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  updatedAt: string;
  sales: number;
};

// Datos para editar un producto (página propia o desplegable de la lista).
export async function getProductEditData(supabase: SessionClient, id: string): Promise<ProductEditData | null> {
  const [{ data: product }, { data: brands }, { data: categories }, { count: sales }] = await Promise.all([
    supabase
      .from('products')
      .select('*, images:product_images(public_id, width, height, position, is_primary, crop, brightness, contrast), variants:product_variants(id, label, sku, stock, price_override, position)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('brands').select('id, name').order('name'),
    supabase.from('categories').select('id, name').order('name'),
    supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
  ]);
  if (!product) return null;
  return {
    brands: brands ?? [],
    categories: categories ?? [],
    updatedAt: product.updated_at,
    sales: sales ?? 0,
    initial: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brand_id: product.brand_id,
      category_id: product.category_id,
      gender: product.gender,
      movement: product.movement,
      price: Number(product.price),
      compare_at_price: product.compare_at_price === null ? null : Number(product.compare_at_price),
      status: product.status as ProductStatus,
      specs: Array.isArray(product.specs) ? (product.specs as { label: string; value: string }[]) : [],
      variants: [...product.variants]
        .sort((a, b) => a.position - b.position)
        .map((variant) => ({ id: variant.id, label: variant.label, sku: variant.sku, stock: variant.stock, price_override: variant.price_override === null ? null : Number(variant.price_override) })),
      images: [...product.images]
        .sort((a, b) => a.position - b.position)
        .map((image) => ({
          public_id: image.public_id,
          width: image.width,
          height: image.height,
          is_primary: image.is_primary,
          crop: image.crop as ImageCrop | null,
          brightness: image.brightness,
          contrast: image.contrast,
        })),
    },
  };
}
