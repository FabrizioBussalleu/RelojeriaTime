// Respuesta estructurada del asistente y su conversión a mensajes de WhatsApp.
// El modelo solo decide QUÉ decir y QUÉ productos mostrar (por id); nombres, precios, stock, enlaces
// y fotos salen de la base. Así no puede inventar un reloj ni un precio.
import { z } from 'zod';
import type { CatalogProduct } from '@/lib/catalog';
import { formatPEN, visibleVariantLabel } from '@/lib/store';
import { startingPrice } from './search';

export const AssistantReplySchema = z.object({
  apertura: z.string().describe('Primer mensaje al cliente. Sin precios ni stock: esos datos los agrega el sistema.'),
  producto_ids: z
    .array(z.string())
    .describe('Ids de relojes devueltos por las herramientas en esta conversación, en el orden a mostrar. Vacío si no aplica.'),
  cierre: z.string().describe('Mensaje final (invitación a ver el catálogo, a reservar, o pregunta). Puede ser vacío.'),
  derivar_a_humano: z.boolean().describe('true si el cliente quiere comprar, reservar, pagar, coordinar envío, reclamar o hablar con una persona.'),
  motivo_derivacion: z.string().describe('Motivo breve para el equipo si derivar_a_humano es true; vacío si no.'),
});

export type AssistantReply = z.infer<typeof AssistantReplySchema>;

export type ReplyPart =
  | { kind: 'text'; body: string }
  | { kind: 'image'; src: string; caption: string | null; productId: string };

export type RenderSettings = { maxProducts: number; maxPhotosPerProduct: number; photosMode: 'caption' | 'separate'; siteUrl: string };

const TEXT_LIMIT = 4096;
const CAPTION_LIMIT = 1024;
const LOW_STOCK = 3;

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

function productText(product: CatalogProduct, siteUrl: string) {
  const lines = [`*${[product.brand, product.name].filter(Boolean).join(' ')}*`];
  const price = startingPrice(product);
  const options = product.variants.filter((variant) => visibleVariantLabel(variant.label) && variant.stock > 0);
  const priceLine = options.length > 1 && options.some((option) => option.price !== price) ? `Desde ${formatPEN(price)}` : formatPEN(price);
  lines.push(product.compareAtPrice && product.compareAtPrice > price ? `${priceLine} ~${formatPEN(product.compareAtPrice)}~` : priceLine);
  if (options.length > 1) {
    lines.push(`Opciones: ${options.map((option) => `${option.label} (${formatPEN(option.price)})`).join(' · ')}`);
  }
  if (product.stock > 0 && product.stock <= LOW_STOCK) {
    lines.push(product.stock === 1 ? 'Última unidad disponible' : `Últimas ${product.stock} unidades`);
  }
  lines.push(`Ver en la web: ${siteUrl}/producto/${product.slug}`);
  return lines.join('\n');
}

const PRICE_PATTERN = /(?:S\/\.?\s*|\bsoles?\s+)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*soles\b/gi;

function parseAmount(raw: string) {
  const normalized = /[.,]\d{1,2}$/.test(raw) ? raw.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.') : raw.replace(/[.,]/g, '');
  return Number(normalized);
}

// Quita del texto libre las oraciones con precios que no coinciden con ningún producto mostrado
// y cualquier enlace que no sea de la tienda.
export function sanitizeFreeText(text: string, allowedPrices: number[], siteUrl: string) {
  const siteHost = new URL(siteUrl).host;
  const withoutForeignLinks = text.replace(/\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi, (url) => {
    try {
      const host = new URL(url.startsWith('http') ? url : `https://${url}`).host;
      return host === siteHost ? url : '';
    } catch {
      return '';
    }
  });
  const sentences = withoutForeignLinks.split(/(?<=[.!?\n])\s+/);
  const kept = sentences.filter((sentence) => {
    const amounts = [...sentence.matchAll(PRICE_PATTERN)].map((match) => parseAmount(match[1] ?? match[2]));
    return amounts.every((amount) => allowedPrices.some((allowed) => Math.abs(allowed - amount) < 0.01));
  });
  return kept.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
}

export function renderReply(reply: AssistantReply, catalog: Map<string, CatalogProduct>, settings: RenderSettings) {
  const products = [...new Set(reply.producto_ids)]
    .map((id) => catalog.get(id))
    .filter((product): product is CatalogProduct => Boolean(product && product.stock > 0))
    .slice(0, settings.maxProducts);
  const droppedIds = reply.producto_ids.filter((id) => !products.some((product) => product.id === id));

  const allowedPrices = products.flatMap((product) => [
    ...product.variants.map((variant) => variant.price),
    ...(product.compareAtPrice ? [product.compareAtPrice] : []),
  ]);

  const parts: ReplyPart[] = [];
  const opening = sanitizeFreeText(reply.apertura, allowedPrices, settings.siteUrl);
  if (opening) parts.push({ kind: 'text', body: clip(opening, TEXT_LIMIT) });

  for (const product of products) {
    const text = productText(product, settings.siteUrl);
    const photos = product.images.slice(0, settings.maxPhotosPerProduct);
    if (settings.photosMode === 'separate' || photos.length === 0) {
      parts.push({ kind: 'text', body: clip(text, TEXT_LIMIT) });
    }
    photos.forEach((photo, index) => {
      const caption = settings.photosMode === 'caption' && index === 0 ? clip(text, CAPTION_LIMIT) : null;
      parts.push({ kind: 'image', src: photo.src, caption, productId: product.id });
    });
  }

  const closing = sanitizeFreeText(reply.cierre, allowedPrices, settings.siteUrl);
  if (closing) parts.push({ kind: 'text', body: clip(closing, TEXT_LIMIT) });

  return { parts, products, droppedIds };
}
