'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ExternalLink, Eye, Loader2, MoreHorizontal, PackageX, Pencil, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { deleteProduct, markSoldOut, setProductStatus } from '@/app/admin/(panel)/productos/actions';
import type { ProductStatus } from '@/lib/admin/labels';
import { buttonClass } from '../ui';
import { ConfirmDialog } from '../Dialog';

export function ProductRowActions({ product }: { product: { id: string; name: string; slug: string; status: ProductStatus; stock: number; images: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'soldout' | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? 'No se pudo completar la acción.');
      setConfirm(null);
      setOpen(false);
      router.refresh();
    });

  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50';

  return (
    <div className="relative flex items-center justify-end gap-1">
      <button type="button" onClick={() => setOpen((value) => !value)} className="p-2 text-muted-foreground hover:text-foreground" aria-haspopup="menu" aria-expanded={open} aria-label={`Más acciones para ${product.name}`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 border border-border bg-card py-1 shadow-xl">
            <Link role="menuitem" href={`/admin/productos/${product.id}`} className={item}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Abrir en su página
            </Link>
            {product.status !== 'active' ? (
              <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => setProductStatus(product.id, 'active'), 'Publicado en la tienda')}>
                <Upload className="h-4 w-4" aria-hidden /> Publicar
              </button>
            ) : null}
            {product.status === 'active' ? (
              <Link role="menuitem" href={`/producto/${product.slug}`} target="_blank" className={item}>
                <Eye className="h-4 w-4" aria-hidden /> Ver en la tienda
              </Link>
            ) : null}
            {product.status !== 'draft' ? (
              <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => setProductStatus(product.id, 'draft'), 'Pasado a borrador')}>
                <Pencil className="h-4 w-4" aria-hidden /> Pasar a borrador
              </button>
            ) : null}
            {product.status !== 'archived' ? (
              <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => run(() => setProductStatus(product.id, 'archived'), 'Archivado: ya no se ve en la tienda')}>
                <Archive className="h-4 w-4" aria-hidden /> Archivar
              </button>
            ) : null}
            {product.stock > 0 ? (
              <button type="button" role="menuitem" className={item} disabled={pending} onClick={() => setConfirm('soldout')}>
                <PackageX className="h-4 w-4" aria-hidden /> Marcar agotado
              </button>
            ) : null}
            <button type="button" role="menuitem" className={`${item} text-red-400`} disabled={pending} onClick={() => setConfirm('delete')}>
              <Trash2 className="h-4 w-4" aria-hidden /> Eliminar…
            </button>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirm === 'soldout'}
        onOpenChange={(value) => !value && setConfirm(null)}
        title="Marcar como agotado"
        description={`El stock de "${product.name}" pasará a 0 en todas sus variantes. Seguirá en la tienda, en gris y con la etiqueta Agotado. Sus fotos no se tocan.`}
        confirmLabel="Marcar agotado"
        tone="primary"
        pending={pending}
        onConfirm={() => run(() => markSoldOut(product.id), 'Marcado como agotado')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(value) => !value && setConfirm(null)}
        title="Eliminar producto"
        description={
          <>
            Se eliminará <strong>{product.name}</strong> y {product.images === 1 ? 'su foto se borrará' : `sus ${product.images} fotos se borrarán`} de Cloudinary de forma
            definitiva. Si era el último reloj de su marca o categoría, esta también se quita de la lista. Los pedidos anteriores se
            conservan. Si solo quieres ocultarlo, archívalo.
          </>
        }
        confirmLabel="Eliminar definitivamente"
        pending={pending}
        extra={
          product.status !== 'archived' ? (
            <button type="button" className={buttonClass.secondary} disabled={pending} onClick={() => run(() => setProductStatus(product.id, 'archived'), 'Archivado: ya no se ve en la tienda')}>
              Archivar en su lugar
            </button>
          ) : null
        }
        onConfirm={() =>
          run(async () => {
            const result = await deleteProduct(product.id);
            return result;
          }, 'Producto eliminado junto con sus fotos')
        }
      />
    </div>
  );
}
