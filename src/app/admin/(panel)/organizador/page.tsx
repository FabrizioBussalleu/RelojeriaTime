import Link from 'next/link';
import { Organizer } from '@/components/admin/organizer/Organizer';
import { buttonClass, EmptyState, PageHeader } from '@/components/admin/ui';
import { getAdminProducts } from '@/lib/admin/products-query';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Organizador' };

export default async function OrganizerPage() {
  const { supabase } = await requireAdmin();
  const [products, { data: settings }] = await Promise.all([getAdminProducts(supabase), supabase.from('store_settings').select('sold_out_last').single()]);

  return (
    <>
      <PageHeader
        title="Organizador"
        description="Agarra un reloj y suéltalo donde quieras que aparezca en la tienda (orden “Destacados”). En el celular: mantén presionado y arrastra."
      />
      {products.length ? (
        <Organizer
          soldOutLast={settings?.sold_out_last ?? true}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            brand: product.brand,
            category: product.category,
            price: product.price,
            stock: product.stock,
            status: product.status,
            createdAt: product.createdAt,
            image: product.primaryImage,
          }))}
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
