'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteProduct, setProductStatus } from '@/app/admin/(panel)/productos/actions';
import type { ProductStatus } from '@/lib/admin/labels';
import { ConfirmDialog } from '../Dialog';
import { buttonClass, Card } from '../ui';

export function ProductDangerZone({ product }: { product: { id: string; name: string; status: ProductStatus; images: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card title="Eliminar producto" className="mt-8 max-w-3xl">
      <p className="text-sm text-muted-foreground">
        Eliminar borra el producto y sus fotos en Cloudinary de forma definitiva. Para ocultarlo sin perder nada, cámbialo a <strong>Archivado</strong>.
      </p>
      <button type="button" className={`${buttonClass.danger} mt-4`} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden /> Eliminar producto
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Eliminar producto"
        description={
          <>
            Se eliminará <strong>{product.name}</strong> y {product.images === 1 ? 'su foto se borrará' : `sus ${product.images} fotos se borrarán`} de Cloudinary de forma definitiva. Si era el último reloj de su marca o categoría, esta también se quita de la lista.
            Los pedidos anteriores se conservan.
          </>
        }
        confirmLabel="Eliminar definitivamente"
        pending={pending}
        extra={
          product.status !== 'archived' ? (
            <button
              type="button"
              className={buttonClass.secondary}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setProductStatus(product.id, 'archived');
                  if (result.ok) toast.success('Archivado: ya no se ve en la tienda');
                  else toast.error(result.error ?? 'No se pudo archivar.');
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Archivar en su lugar
            </button>
          ) : null
        }
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteProduct(product.id);
            if (!result.ok) {
              toast.error(result.error ?? 'No se pudo eliminar.');
              return;
            }
            toast.success('Producto eliminado junto con sus fotos');
            router.push('/admin/productos');
            router.refresh();
          })
        }
      />
    </Card>
  );
}
