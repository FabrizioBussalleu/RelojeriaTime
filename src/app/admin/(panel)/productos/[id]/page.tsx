import { notFound } from 'next/navigation';
import { ProductDangerZone } from '@/components/admin/products/ProductDangerZone';
import { ProductForm } from '@/components/admin/products/ProductForm';
import { Badge, formatDateTime, PageHeader } from '@/components/admin/ui';
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONES } from '@/lib/admin/labels';
import { getProductEditData } from '@/lib/admin/products-query';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Editar producto' };

// Enlace directo a un producto (desde el resumen o un pedido). En la lista se edita en un desplegable.
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const data = await getProductEditData(supabase, id);
  if (!data) notFound();
  const { initial } = data;

  return (
    <>
      <PageHeader
        title={initial.name}
        back={{ href: '/admin/productos', label: 'Productos' }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={PRODUCT_STATUS_TONES[initial.status]}>{PRODUCT_STATUS_LABELS[initial.status]}</Badge>
            <span>Actualizado {formatDateTime(data.updatedAt)}</span>
            {data.sales ? <span>· vendido en {data.sales} pedido(s)</span> : null}
          </span>
        }
      />
      <ProductForm isNew={false} brands={data.brands} categories={data.categories} initial={initial} />
      <ProductDangerZone product={{ id: initial.id, name: initial.name, status: initial.status, images: initial.images.length }} />
    </>
  );
}
