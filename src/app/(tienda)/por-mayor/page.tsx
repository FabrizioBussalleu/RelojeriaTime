import type { Metadata } from 'next';
import { WholesaleCatalog } from '@/components/wholesale/WholesaleCatalog';
import { getStoreSettings, getWholesaleCatalog, type CatalogProduct } from '@/lib/catalog';
import { siteUrl } from '@/lib/env';

const TITULO = 'Relojes al por mayor en Perú';
const DESCRIPCION =
  'Compra relojes al por mayor en Perú: precios por volumen para tiendas, distribuidores y revendedores. Arma tu lista de modelos y recibe una cotización por WhatsApp, sin mínimo de compra.';

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  keywords: ['relojes al por mayor', 'relojería al por mayor', 'relojes por mayor Perú', 'distribuidor de relojes', 'comprar relojes al por mayor', 'relojes mayorista Lima'],
  alternates: { canonical: '/por-mayor' },
  openGraph: { title: `${TITULO} | Time Relojería`, description: DESCRIPCION, url: '/por-mayor', siteName: 'Time Relojería', locale: 'es_PE', type: 'website' },
};

export const revalidate = 300;

const PASOS = [
  { titulo: 'Arma tu lista', texto: 'Elige los modelos y cuántas unidades necesitas de cada uno. Sin mínimo ni máximo.' },
  { titulo: 'Pide la cotización', texto: 'Nos llega tu lista por WhatsApp y te respondemos con precios por volumen y plazos.' },
  { titulo: 'Coordinamos la entrega', texto: 'Acordamos el pago (adelantado o contra entrega) y el envío a tu tienda en todo el Perú.' },
];

export default async function WholesalePage() {
  // Sin base disponible, la página igual carga: se muestra el texto y el contacto.
  const [products, settings] = await Promise.all([getWholesaleCatalog().catch((): CatalogProduct[] => []), getStoreSettings().catch(() => null)]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WholesaleStore',
    name: 'Time Relojería — Venta al por mayor',
    description: DESCRIPCION,
    url: `${siteUrl()}/por-mayor`,
    areaServed: 'PE',
    currenciesAccepted: 'PEN',
    paymentAccepted: 'Yape, Plin, transferencia bancaria, contra entrega',
    ...(settings?.whatsappNumber ? { telephone: `+${settings.whatsappNumber}` } : {}),
  };

  return (
    <div className="container mx-auto px-4 py-10 md:px-8 md:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <header className="max-w-3xl space-y-4">
        <p className="text-xs font-display uppercase tracking-[0.3em] text-muted-foreground">Compras al por mayor</p>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-5xl">{TITULO}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
          Vendemos relojes al por mayor a tiendas, distribuidores y revendedores de todo el Perú. Arma tu lista con los modelos y las cantidades que
          necesitas y te enviamos una cotización con precios por volumen. Aquí no verás precios unitarios: cada cotización depende del volumen.
        </p>
      </header>

      <section aria-labelledby="como-funciona-titulo" className="mt-12 border-y border-border py-10">
        <h2 id="como-funciona-titulo" className="mb-6 font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Cómo funciona
        </h2>
        <ol className="grid gap-8 md:grid-cols-3">
          {PASOS.map((paso, index) => (
            <li key={paso.titulo} className="space-y-2">
              <p className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground">Paso {index + 1}</p>
              <h3 className="font-display text-lg tracking-wide">{paso.titulo}</h3>
              <p className="text-sm text-muted-foreground">{paso.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {products.length ? (
        <WholesaleCatalog products={products} whatsappNumber={settings?.whatsappNumber ?? null} />
      ) : (
        <p className="mt-12 border border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Estamos actualizando el catálogo al por mayor. Escríbenos por WhatsApp y te contamos qué modelos hay disponibles.
        </p>
      )}
    </div>
  );
}
