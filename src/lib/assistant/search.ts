// Búsqueda del asistente sobre el catálogo real. Funciones puras: reciben los productos ya leídos
// de la base para que sean fáciles de probar y para que el modelo nunca vea datos inventados.
import type { CatalogProduct } from '@/lib/catalog';
import { GENDER_LABELS, MOVEMENT_LABELS, visibleVariantLabel, type WatchGender, type WatchMovement } from '@/lib/store';

export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export type SearchFilters = {
  marca?: string | null;
  genero?: WatchGender | null;
  movimiento?: WatchMovement | null;
  precio_min?: number | null;
  precio_max?: number | null;
  texto?: string | null;
  incluir_agotados?: boolean | null;
};

// Precio "desde": la variante más barata con stock (o la más barata si todo está agotado).
export function startingPrice(product: CatalogProduct) {
  const available = product.variants.filter((variant) => variant.stock > 0);
  const pool = available.length ? available : product.variants;
  return pool.length ? Math.min(...pool.map((variant) => variant.price)) : product.price;
}

export function searchCatalog(products: CatalogProduct[], filters: SearchFilters, limit = 8) {
  const brand = filters.marca ? normalizeText(filters.marca) : null;
  const words = filters.texto ? normalizeText(filters.texto).split(/\s+/).filter((word) => word.length > 1) : [];

  const matches = products.filter((product) => {
    if (!filters.incluir_agotados && product.stock <= 0) return false;
    if (brand && !normalizeText(product.brand ?? '').includes(brand)) return false;
    if (filters.genero && product.gender !== filters.genero && product.gender !== 'unisex') return false;
    if (filters.movimiento && product.movement !== filters.movimiento) return false;
    const price = startingPrice(product);
    if (filters.precio_min != null && price < filters.precio_min) return false;
    if (filters.precio_max != null && price > filters.precio_max) return false;
    if (words.length) {
      const haystack = normalizeText(
        [
          product.brand,
          product.name,
          product.category,
          product.gender ? GENDER_LABELS[product.gender] : '',
          product.movement ? MOVEMENT_LABELS[product.movement] : '',
          ...product.variants.map((variant) => variant.label),
        ].join(' ')
      );
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });

  const sorted = matches.sort((a, b) => a.position - b.position || startingPrice(a) - startingPrice(b));
  return { total: sorted.length, products: sorted.slice(0, limit) };
}

// Lo que ve el modelo de cada reloj: datos reales y el id para referenciarlo en su respuesta.
export function productForModel(product: CatalogProduct, siteUrl: string) {
  return {
    id: product.id,
    marca: product.brand,
    nombre: product.name,
    precio_desde: startingPrice(product),
    precio_anterior: product.compareAtPrice,
    genero: product.gender ? GENDER_LABELS[product.gender] : null,
    movimiento: product.movement ? MOVEMENT_LABELS[product.movement] : null,
    stock_total: product.stock,
    variantes: product.variants
      .filter((variant) => visibleVariantLabel(variant.label))
      .map((variant) => ({ etiqueta: variant.label, precio: variant.price, stock: variant.stock })),
    fotos: product.images.length,
    enlace: `${siteUrl}/producto/${product.slug}`,
  };
}

export function brandSummary(products: CatalogProduct[]) {
  const byBrand = new Map<string, { marca: string; relojes_disponibles: number; precio_min: number; precio_max: number }>();
  for (const product of products) {
    if (!product.brand || product.stock <= 0) continue;
    const price = startingPrice(product);
    const entry = byBrand.get(product.brand) ?? { marca: product.brand, relojes_disponibles: 0, precio_min: price, precio_max: price };
    entry.relojes_disponibles += 1;
    entry.precio_min = Math.min(entry.precio_min, price);
    entry.precio_max = Math.max(entry.precio_max, price);
    byBrand.set(product.brand, entry);
  }
  return [...byBrand.values()].sort((a, b) => a.marca.localeCompare(b.marca, 'es'));
}
