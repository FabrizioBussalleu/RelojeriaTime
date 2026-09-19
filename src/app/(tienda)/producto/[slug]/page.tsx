import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProductGallery from '@/components/product/ProductGallery';
import ProductPurchase from '@/components/product/ProductPurchase';
import { getProductBySlug, getProductSlugs, getStoreSettings } from '@/lib/catalog';
import { cloudinaryLoaderUrl, cloudinaryShareUrl } from '@/lib/cloudinary/url';
import { formatPEN, GENDER_LABELS, MOVEMENT_LABELS } from '@/lib/store';
import { siteUrl as getSiteUrl } from '@/lib/env';

export const revalidate = 60;

export async function generateStaticParams() {
  try {
    return (await getProductSlugs()).map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

type PageProps = { params: Promise<{ slug: string }> };

function summary(description: string, fallback: string) {
  const text = description.replace(/\s+/g, ' ').trim();
  return text ? (text.length > 160 ? `${text.slice(0, 157)}…` : text) : fallback;
}

// Lo que se ve al compartir el enlace (WhatsApp, Facebook): nombre con precio, datos clave y la foto
// principal en 1200×630.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const title = [product.brand, product.name].filter(Boolean).join(' ');
  const price = Math.min(...product.variants.map((variant) => variant.price));
  // El precio va en el título al compartir; la descripción no lo repite.
  const facts = [
    product.stock > 0 ? null : 'Agotado',
    product.gender === 'unisex' ? 'Unisex' : product.gender ? `Para ${GENDER_LABELS[product.gender].toLowerCase()}` : null,
    product.movement ? MOVEMENT_LABELS[product.movement] : null,
  ].filter(Boolean);
  const description = summary([facts.join(' · '), product.description].filter(Boolean).join('. '), `${title} en Time Relojería.`);
  const path = `/producto/${product.slug}`;
  const image = product.images[0]?.src;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: product.stock > 0 ? `${title} · ${formatPEN(price)}` : title,
      description,
      url: path,
      siteName: 'Time Relojería',
      locale: 'es_PE',
      type: 'website',
      images: image ? [{ url: cloudinaryShareUrl(image), width: 1200, height: 630, alt: title, type: 'image/jpeg' }] : undefined,
    },
    other: { 'product:price:amount': price.toFixed(2), 'product:price:currency': 'PEN' },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProductBySlug(slug), getStoreSettings().catch(() => null)]);
  // Archivado, eliminado o con otro enlace: al inicio con un aviso, en vez de la página 404.
  if (!product) redirect('/?aviso=no-disponible');

  const soldOut = product.stock <= 0;
  const details = [
    product.brand ? { label: 'Marca', value: product.brand } : null,
    product.gender ? { label: 'Género', value: GENDER_LABELS[product.gender] } : null,
    product.movement ? { label: 'Movimiento', value: MOVEMENT_LABELS[product.movement] } : null,
    product.category ? { label: 'Categoría', value: product.category } : null,
    ...product.specs,
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail));

  const siteUrl = getSiteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: product.images.map((image) => cloudinaryLoaderUrl(image.src, 1200)),
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers: {
      '@type': 'Offer',
      url: `${siteUrl}/producto/${product.slug}`,
      priceCurrency: 'PEN',
      price: Math.min(...product.variants.map((variant) => variant.price)).toFixed(2),
      availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    },
  };

  return (
    <div className="container mx-auto px-4 md:px-8 py-8 md:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <nav aria-label="Ruta de navegación" className="mb-8 text-xs font-body uppercase tracking-[0.2em] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">Inicio</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/#catalogo" className="hover:text-foreground">Relojes</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">{product.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
        <ProductGallery images={product.images} soldOut={soldOut} />

        <div className="space-y-8">
          <div className="space-y-2">
            {product.brand ? <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{product.brand}</p> : null}
            <h1 className="text-3xl md:text-4xl font-display tracking-tight">{product.name}</h1>
            {soldOut ? <p className="badge-sold-out inline-block">Agotado</p> : null}
          </div>

          <ProductPurchase
            product={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              brand: product.brand,
              compareAtPrice: product.compareAtPrice,
              variants: product.variants,
              images: product.images,
            }}
            whatsappNumber={settings?.whatsappNumber ?? null}
          />

          {product.description ? (
            <section aria-labelledby="descripcion">
              <h2 id="descripcion" className="mb-3 text-sm font-display tracking-[0.2em]">Descripción</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            </section>
          ) : null}

          {details.length ? (
            <section aria-labelledby="especificaciones">
              <h2 id="especificaciones" className="mb-3 text-sm font-display tracking-[0.2em]">Especificaciones</h2>
              <dl className="divide-y divide-border border-y border-border text-sm">
                {details.map((detail) => (
                  <div key={detail.label} className="grid grid-cols-2 gap-4 py-3">
                    <dt className="text-muted-foreground">{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
