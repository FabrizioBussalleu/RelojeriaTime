import CatalogSection from '@/components/catalog/CatalogSection';
import HeroSection from '@/components/home/HeroSection';
import HowToBuy from '@/components/home/HowToBuy';
import { getCatalog, type CatalogProduct } from '@/lib/catalog';

export const revalidate = 60;

export default async function HomePage() {
  let products: CatalogProduct[] = [];
  let error: string | null = null;
  try {
    // Los agotados no se listan: ver un reloj que ya no está desanima la compra. Siguen llegando por
    // su enlace directo (con el cartel de agotado) y en “Compras al por mayor”, que no los filtra.
    products = (await getCatalog()).filter((product) => product.stock > 0);
  } catch (fetchError) {
    console.error('No se pudo cargar el catálogo', fetchError);
    error = 'No se pudo cargar el catálogo. Intenta más tarde.';
  }

  return (
    <>
      <HeroSection />
      <CatalogSection products={products} error={error} />
      <HowToBuy />
    </>
  );
}
