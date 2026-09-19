// Datos del formulario de producto del panel. El mismo esquema valida en el navegador (mensajes al
// instante) y en el servidor (antes de llamar a save_product).
import { z } from 'zod';
import { DEFAULT_VARIANT_LABEL } from '@/lib/store';

export const MAX_PRODUCT_IMAGES = 12;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];

export const CropSchema = z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() });

export const ProductImageSchema = z.object({
  public_id: z.string().min(1).max(300),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  is_primary: z.boolean(),
  crop: CropSchema.nullable(),
  brightness: z.number().int().min(-99).max(100),
  contrast: z.number().int().min(-100).max(100),
});

const money = z.number({ error: 'Escribe un monto.' }).min(0, 'El monto no puede ser negativo.').max(1_000_000, 'Monto demasiado alto.');

export const ProductVariantSchema = z.object({
  id: z.string().uuid().nullable(),
  label: z.string().trim().max(60, 'Máximo 60 caracteres.'),
  sku: z.string().trim().max(60, 'Máximo 60 caracteres.'),
  stock: z.number({ error: 'Escribe el stock.' }).int('El stock es un número entero.').min(0, 'El stock no puede ser negativo.').max(100_000),
  price_override: money.nullable(),
});

export const ProductInputSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Nombre inválido para la dirección web.').max(160),
    name: z.string().trim().min(1, 'Escribe el nombre del reloj.').max(160, 'Máximo 160 caracteres.'),
    description: z.string().trim().max(5000, 'Máximo 5000 caracteres.'),
    brand_id: z.string().uuid().nullable(),
    category_id: z.string().uuid().nullable(),
    gender: z.enum(['hombre', 'mujer', 'unisex']).nullable(),
    movement: z.enum(['cuarzo', 'automatico', 'mecanico', 'solar', 'smartwatch']).nullable(),
    price: money,
    compare_at_price: money.nullable(),
    status: z.enum(['draft', 'active', 'archived']),
    specs: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) })).max(30),
    variants: z.array(ProductVariantSchema).min(1, 'Agrega al menos una variante.').max(40),
    images: z.array(ProductImageSchema).max(MAX_PRODUCT_IMAGES, `Máximo ${MAX_PRODUCT_IMAGES} fotos.`),
  })
  .superRefine((product, context) => {
    if (product.compare_at_price !== null && product.compare_at_price <= product.price) {
      context.addIssue({ code: 'custom', path: ['compare_at_price'], message: 'El precio anterior debe ser mayor que el precio actual.' });
    }
    const labels = product.variants.map((variant) => (variant.label || DEFAULT_VARIANT_LABEL).toLowerCase());
    labels.forEach((label, index) => {
      if (labels.indexOf(label) !== index) context.addIssue({ code: 'custom', path: ['variants', index, 'label'], message: 'Nombre repetido.' });
    });
    if (product.variants.length > 1) {
      product.variants.forEach((variant, index) => {
        if (!variant.label) context.addIssue({ code: 'custom', path: ['variants', index, 'label'], message: 'Ponle nombre (ej.: 40 mm).' });
      });
    }
    const skus = product.variants.map((variant) => variant.sku.toLowerCase()).filter(Boolean);
    skus.forEach((sku, index) => {
      if (skus.indexOf(sku) !== index) context.addIssue({ code: 'custom', path: ['variants'], message: `SKU repetido: ${sku}.` });
    });
    if (product.status === 'active' && product.images.length === 0) {
      context.addIssue({ code: 'custom', path: ['images'], message: 'Agrega al menos una foto para publicarlo.' });
    }
  });

export type ProductInput = z.infer<typeof ProductInputSchema>;
export type ProductImageInput = z.infer<typeof ProductImageSchema>;
export type ProductVariantInput = z.infer<typeof ProductVariantSchema>;

// "Casio Edifice EFR-526" → "casio-edifice-efr-526".
export function slugify(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
      .replace(/-+$/g, '') || 'reloj'
  );
}

// Errores de zod como mapa "ruta → mensaje" para mostrarlos junto a cada campo.
export function issuesToFieldErrors(issues: z.core.$ZodIssue[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}

// Sugerencias para la ficha técnica de un reloj.
export const SPEC_SUGGESTIONS = [
  'Diámetro de la caja',
  'Material de la caja',
  'Material de la correa',
  'Cristal',
  'Resistencia al agua',
  'Funciones',
  'Color del dial',
  'Grosor',
  'Garantía',
];
