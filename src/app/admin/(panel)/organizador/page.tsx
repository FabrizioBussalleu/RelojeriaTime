import Link from 'next/link';
import { OrganizerTabs } from '@/components/admin/organizer/OrganizerTabs';
import { buttonClass, EmptyState, PageHeader } from '@/components/admin/ui';
import { getAdminProducts } from '@/lib/admin/products-query';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Organizador' };

type AdminRow = Awaited<ReturnType<typeof getAdminProducts>>[number];

const toOrganizerProduct = (product: AdminRow) => ({
  id: product.id,
  name: product.name,
  brand: product.brand,
  category: product.category,
  price: product.price,
  stock: product.stock,
  status: product.status,
  wholesaleOnly: product.wholesaleOnly,
  createdAt: product.createdAt,
  image: product.primaryImage,
});

export default async function OrganizerPage() {
  const { supabase } = await requireAdmin();
  const products = await getAdminProducts(supabase);

  return (
    <>
      <PageHeader
        title="Organizador"
        description="Agarra un reloj y suéltalo donde quieras que aparezca. Una pestaña para la tienda y otra para “Compras al por mayor”, cada una con su propio orden. En el celular: mantén presionado y arrastra."
      />
      {products.length ? (
        <OrganizerTabs
          tienda={products.map(toOrganizerProduct)}
          porMayor={[...products].sort((a, b) => a.wholesalePosition - b.wholesalePosition).map(toOrganizerProduct)}
        />
      ) : (
        <EmptyState title="Aún no hay productos">
          <Link href="/admin/productos/nuevo" className={buttonClass.primary}>
            Crear el primero
          </Link>
        </EmptyState>
      )}
    </>
  );
}
