import 'server-only';

import { cache } from 'react';
import { cloudinaryImageSrc, type ImageCrop } from '@/lib/cloudinary/url';
import type { WatchGender, WatchMovement } from '@/lib/store';
import { createPublicClient } from '@/lib/supabase/clients';

export type CatalogImage = { src: string; alt: string };

export type CatalogVariant = { id: string; label: string; stock: number; price: number };

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  gender: WatchGender | null;
  movement: WatchMovement | null;
  price: number;
  compareAtPrice: number | null;
  position: number;
  wholesalePosition: number;
  // Solo al por mayor: no aparece en el catálogo de la tienda, únicamente en /por-mayor.
  wholesaleOnly: boolean;
  createdAt: string;
  stock: number;
  images: CatalogImage[];
  variants: CatalogVariant[];
};

export type ProductDetail = CatalogProduct & {
  description: string;
  specs: { label: string; value: string }[];
};

type ImageRow = { public_id: string; is_primary: boolean; position: number; crop: unknown; brightness: number; contrast: number };

const PRODUCT_FIELDS = `id, slug, name, description, price, compare_at_price, position, wholesale_position, wholesale_only, created_at, gender, movement, specs,
  brand:brands(name), category:categories(name),
  images:product_images(public_id, is_primary, position, crop, brightness, contrast),
  variants:product_variants(id, label, stock, price_override, position)`;

function toImages(rows: ImageRow[], name: string): CatalogImage[] {
  return [...rows]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)
    .map((image, index) => ({
      src: cloudinaryImageSrc(image.public_id, {
        crop: image.crop as ImageCrop | null,
        brightness: image.brightness,
        contrast: image.contrast,
      }),
      alt: index === 0 ? name : `${name} — vista ${index + 1}`,
    }));
}

function toSpecs(value: unknown): ProductDetail['specs'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry && typeof entry.label === 'string' && typeof entry.value === 'string' && entry.label.trim() && entry.value.trim()
      ? [{ label: entry.label.trim(), value: entry.value.trim() }]
      : []
  );
}

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  compare_at_price: number | null;
  position: number;
  wholesale_position: number;
  wholesale_only: boolean;
  created_at: string;
  gender: WatchGender | null;
  movement: WatchMovement | null;
  specs: unknown;
  brand: { name: string } | null;
  category: { name: string } | null;
  images: ImageRow[];
  variants: { id: string; label: string; stock: number; price_override: number | null; position: number }[];
};

function toProduct(row: ProductRow): ProductDetail {
  const variants = [...row.variants]
    .sort((a, b) => a.position - b.position)
    .map((variant) => ({ id: variant.id, label: variant.label, stock: variant.stock, price: variant.price_override ?? row.price }));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    brand: row.brand?.name ?? null,
    category: row.category?.name ?? null,
    gender: row.gender,
    movement: row.movement,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    position: row.position,
    wholesalePosition: row.wholesale_position,
    wholesaleOnly: row.wholesale_only,
    createdAt: row.created_at,
    stock: variants.reduce((total, variant) => total + variant.stock, 0),
    images: toImages(row.images, row.name),
    variants,
    specs: toSpecs(row.specs),
  };
}

// Sin descripción ni especificaciones: los listados no las usan y así viajan menos datos al navegador.
function toCatalogProduct(row: ProductRow): CatalogProduct {
  const product = toProduct(row);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    gender: product.gender,
    movement: product.movement,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    position: product.position,
    wholesalePosition: product.wholesalePosition,
    wholesaleOnly: product.wholesaleOnly,
    createdAt: product.createdAt,
    stock: product.stock,
    images: product.images,
    variants: product.variants,
  };
}

// Catálogo completo de la tienda (solo activos; RLS ya lo garantiza para la clave pública).
// Los agotados se incluyen: se muestran en gris al final.
export async function getCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await createPublicClient()
    .from('products')
    .select(PRODUCT_FIELDS)
    .eq('status', 'active')
    .eq('wholesale_only', false)
    .order('position')
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Sin descripción ni especificaciones: la home no las usa y así viajan menos datos al navegador.
  return (data as unknown as ProductRow[]).map(toCatalogProduct);
}

// Catálogo de por mayor: todo lo publicado (tienda + exclusivos de por mayor) con su propio orden.
// No se usan precios en esa página: el cliente arma una lista y pide cotización.
export async function getWholesaleCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await createPublicClient()
    .from('products')
    .select(PRODUCT_FIELDS)
    .eq('status', 'active')
    .order('wholesale_position')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as ProductRow[]).map(toCatalogProduct);
}

// cache(): generateMetadata y la página comparten la misma consulta dentro de un request.
export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  const { data, error } = await createPublicClient()
    .from('products')
    .select(PRODUCT_FIELDS)
    .eq('status', 'active')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ? toProduct(data as unknown as ProductRow) : null;
});

// Ficha completa por id (el asistente de WhatsApp referencia productos por id, no por slug).
export async function getProductDetailById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await createPublicClient()
    .from('products')
    .select(PRODUCT_FIELDS)
    .eq('status', 'active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProduct(data as unknown as ProductRow) : null;
}

export async function getProductSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const { data, error } = await createPublicClient().from('products').select('slug, updated_at').eq('status', 'active');
  if (error) throw error;
  return data.map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

export type SocialLink = { brand: 'instagram' | 'tiktok' | 'facebook'; label: string; url: string };

export type StoreSettings = {
  whatsappNumber: string | null;
  yapeNumber: string | null;
  plinNumber: string | null;
  paymentHolderName: string | null;
  bankAccounts: { bank: string; holder: string; account: string; cci: string }[];
  contactEmail: string | null;
  pendingOrderTtlHours: number;
  soldOutLast: boolean;
  socialLinks: SocialLink[];
};

export async function getStoreSettings(): Promise<StoreSettings> {
  const { data, error } = await createPublicClient().from('store_settings').select('*').single();
  if (error) throw error;
  const bankAccounts = Array.isArray(data.bank_accounts) ? (data.bank_accounts as StoreSettings['bankAccounts']) : [];
  return {
    whatsappNumber: data.whatsapp_number,
    yapeNumber: data.yape_number,
    plinNumber: data.plin_number,
    paymentHolderName: data.payment_holder_name,
    bankAccounts,
    contactEmail: data.contact_email,
    pendingOrderTtlHours: data.pending_order_ttl_hours,
    soldOutLast: data.sold_out_last,
    socialLinks: (
      [
        { brand: 'instagram', label: 'Instagram', url: data.instagram_url },
        { brand: 'tiktok', label: 'TikTok', url: data.tiktok_url },
        { brand: 'facebook', label: 'Facebook', url: data.facebook_url },
      ] satisfies (Omit<SocialLink, 'url'> & { url: string | null })[]
    ).filter((link): link is SocialLink => Boolean(link.url)),
  };
}
