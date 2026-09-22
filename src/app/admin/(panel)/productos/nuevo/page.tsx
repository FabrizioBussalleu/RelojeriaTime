import { randomUUID } from 'node:crypto';
import { ProductForm } from '@/components/admin/products/ProductForm';
import { PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Nuevo producto' };

export default async function NewProductPage() {
  const { supabase } = await requireAdmin();
  const [{ data: brands }, { data: categories }] = await Promise.all([
    supabase.from('brands').select('id, name').order('name'),
    supabase.from('categories').select('id, name').order('name'),
  ]);

  return (
    <>
      <PageHeader title="Nuevo producto" back={{ href: '/admin/productos', label: 'Productos' }} description="Las fotos se suben mientras completas el resto; nada se publica hasta que guardes." />
      <ProductForm
        isNew
        brands={brands ?? []}
        categories={categories ?? []}
        initial={{
          // El id existe desde que se abre el formulario: las fotos se suben a su carpeta en Cloudinary.
          id: randomUUID(),
          slug: null,
          name: '',
          description: '',
          brand_id: null,
          category_id: null,
          gender: null,
          movement: null,
          price: null,
          compare_at_price: null,
          status: 'active',
          wholesale_only: false,
          specs: [],
          variants: [],
          images: [],
        }}
      />
    </>
  );
}
