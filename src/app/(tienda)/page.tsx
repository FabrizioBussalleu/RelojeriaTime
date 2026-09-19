import CatalogSection from '@/components/catalog/CatalogSection';
import HeroSection from '@/components/home/HeroSection';
import HowToBuy from '@/components/home/HowToBuy';
import { getCatalog, getStoreSettings, type CatalogProduct } from '@/lib/catalog';

export const revalidate = 60;

export default async function HomePage() {
  let products: CatalogProduct[] = [];
  let error: string | null = null;
  let soldOutLast = true;
  try {
    const [catalog, settings] = await Promise.all([getCatalog(), getStoreSettings()]);
    products = catalog;
    soldOutLast = settings.soldOutLast;
  } catch (fetchError) {
    console.error('No se pudo cargar el catálogo', fetchError);
    error = 'No se pudo cargar el catálogo. Intenta más tarde.';
  }

  return (
    <>
      <HeroSection />
      <CatalogSection products={products} error={error} soldOutLast={soldOutLast} />
      <HowToBuy />
    </>
  );
}
