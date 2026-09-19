import type { MetadataRoute } from 'next';
import { getProductSlugs } from '@/lib/catalog';
import { siteUrl } from '@/lib/env';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = ['', '/seguimiento', '/registro', '/envios-y-cambios', '/terminos', '/privacidad', '/libro-de-reclamaciones'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path ? ('monthly' as const) : ('daily' as const),
    priority: path ? 0.3 : 1,
  }));
  const products = await getProductSlugs().catch(() => []);
  return [
    ...pages,
    ...products.map((product) => ({
      url: `${base}/producto/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
