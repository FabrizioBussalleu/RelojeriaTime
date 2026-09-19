'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown, ImageOff, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { bulkMarkSoldOut, bulkSetStatus, loadProductForEdit } from '@/app/admin/(panel)/productos/actions';
import { LOW_STOCK, PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONES, type ProductStatus } from '@/lib/admin/labels';
import { cloudinaryImageSrc, type ImageCrop } from '@/lib/cloudinary/url';
import { formatPEN } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../Dialog';
import { Badge, buttonClass, Notice } from '../ui';
import { ProductForm, type ProductFormHandle } from './ProductForm';
import { ProductRowActions } from './ProductRowActions';

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  variants: number;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  status: ProductStatus;
  imageCount: number;
  primaryImage: { public_id: string; crop: ImageCrop | null; brightness: number; contrast: number } | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Extract<Awaited<ReturnType<typeof loadProductForEdit>>, { ok: true }> };

// Desplegable de edición: carga el producto al abrirse y lo edita sin salir de la lista.
function InlineEditor({
  id,
  register,
  onClose,
  onDirtyChange,
}: {
  id: string;
  register: (id: string, handle: ProductFormHandle | null) => void;
  onClose: (id: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    loadProductForEdit(id).then((result) => {
      if (!active) return;
      setState(result.ok ? { status: 'ready', data: result } : { status: 'error', message: result.error });
    });
    return () => {
      active = false;
    };
  }, [id]);
  const handleDirty = useCallback((dirty: boolean) => onDirtyChange(id, dirty), [id, onDirtyChange]);

  if (state.status === 'loading') {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando el producto…
      </p>
    );
  }
  if (state.status === 'error') return <Notice tone="danger">{state.message}</Notice>;
  return (
    <ProductForm
      ref={(handle) => register(id, handle)}
      variant="inline"
      isNew={false}
      initial={state.data.initial}
      brands={state.data.brands}
      categories={state.data.categories}
      onSaved={() => onClose(id)}
      onClose={() => onClose(id)}
      onDirtyChange={handleDirty}
    />
  );
}

export function ProductsList({ rows, openId }: { rows: ProductRow[]; openId?: string }) {
  const router = useRouter();
  const [openState, setOpen] = useState<string[]>(openId && rows.some((row) => row.id === openId) ? [openId] : []);
  const [selectedState, setSelected] = useState<Set<string>>(new Set());
  const [dirtyState, setDirty] = useState<Set<string>>(new Set());
  // La lista no se remonta al cambiar de filtro o página (así no se pierden los desplegables con
  // cambios): solo cuentan los productos que siguen a la vista.
  const visibleIds = new Set(rows.map((row) => row.id));
  const open = openState.filter((id) => visibleIds.has(id));
  const selected = new Set([...selectedState].filter((id) => visibleIds.has(id)));
  const dirty = new Set([...dirtyState].filter((id) => open.includes(id)));
  const [savingAll, setSavingAll] = useState(false);
  const [bulkPending, startBulk] = useTransition();
  const [confirmSoldOut, setConfirmSoldOut] = useState(false);
  const handles = useRef(new Map<string, ProductFormHandle>());

  const register = useCallback((id: string, handle: ProductFormHandle | null) => {
    if (handle) handles.current.set(id, handle);
    else handles.current.delete(id);
  }, []);
  const close = useCallback((id: string) => {
    setOpen((current) => current.filter((item) => item !== id));
    setDirty((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);
  const onDirtyChange = useCallback((id: string, isDirty: boolean) => {
    setDirty((current) => {
      if (current.has(id) === isDirty) return current;
      const next = new Set(current);
      if (isDirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Cerrar un desplegable abierto pasa por el formulario: confirma si hay cambios sin guardar.
  const toggle = (id: string) => {
    if (!open.includes(id)) {
      setOpen((current) => [...current, id]);
      return;
    }
    const handle = handles.current.get(id);
    if (handle) handle.requestClose();
    else close(id);
  };

  const saveAll = async () => {
    setSavingAll(true);
    let saved = 0;
    let failed = 0;
    for (const id of [...dirty]) {
      const handle = handles.current.get(id);
      if (!handle) continue;
      if (await handle.save()) saved += 1;
      else failed += 1;
    }
    setSavingAll(false);
    if (failed) toast.error(`${failed} producto(s) no se guardaron: revisa los campos marcados.`);
    else if (saved > 1) toast.success(`${saved} productos guardados`);
  };

  const closeAll = () => {
    for (const id of [...open]) {
      const handle = handles.current.get(id);
      if (handle ? !handle.requestClose() : (close(id), false)) break;
    }
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = (action: () => ReturnType<typeof bulkSetStatus>, message: (changed: number) => string) =>
    startBulk(async () => {
      const result = await action();
      setConfirmSoldOut(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.changed) toast.success(message(result.changed));
      if (result.skipped.length) toast.warning(`Sin fotos, no se publicaron: ${result.skipped.join(', ')}`);
      setSelected(new Set());
      router.refresh();
    });
  const selectedIds = [...selected];

  return (
    <div className="space-y-3">
      {selected.size || open.length ? (
        <div className="sticky top-[57px] z-10 flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2 lg:top-0">
          {selected.size ? (
            <>
              <span className="mr-2 text-sm">
                <strong>{selected.size}</strong> seleccionado(s)
              </span>
              <button type="button" className={buttonClass.secondary} disabled={bulkPending} onClick={() => runBulk(() => bulkSetStatus(selectedIds, 'active'), (n) => `${n} publicado(s)`)}>
                Publicar
              </button>
              <button type="button" className={buttonClass.secondary} disabled={bulkPending} onClick={() => runBulk(() => bulkSetStatus(selectedIds, 'draft'), (n) => `${n} pasado(s) a borrador`)}>
                Borrador
              </button>
              <button type="button" className={buttonClass.secondary} disabled={bulkPending} onClick={() => runBulk(() => bulkSetStatus(selectedIds, 'archived'), (n) => `${n} archivado(s)`)}>
                Archivar
              </button>
              <button type="button" className={buttonClass.secondary} disabled={bulkPending} onClick={() => setConfirmSoldOut(true)}>
                Marcar agotados
              </button>
              <button type="button" className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5" aria-hidden /> Quitar selección
              </button>
              {bulkPending ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Aplicando cambios" /> : null}
            </>
          ) : null}
          {open.length ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{open.length} en edición</span>
              {dirty.size ? (
                <button type="button" className={buttonClass.primary} disabled={savingAll} onClick={saveAll}>
                  {savingAll ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                  Guardar todos ({dirty.size})
                </button>
              ) : null}
              <button type="button" className={buttonClass.secondary} onClick={closeAll}>
                Cerrar todos
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="border border-border">
        <div className="hidden grid-cols-[auto_48px_minmax(0,1fr)_120px_90px_110px_132px] items-center gap-3 border-b border-border bg-card px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground md:grid">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="Seleccionar todos" className="h-4 w-4 accent-white" />
          <span>
            <span className="sr-only">Foto</span>
          </span>
          <span>Producto</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Stock</span>
          <span>Estado</span>
          <span>
            <span className="sr-only">Acciones</span>
          </span>
        </div>
        <ul className="divide-y divide-border" aria-label="Productos">
          {rows.map((row) => {
            const isOpen = open.includes(row.id);
            const panelId = `editar-${row.id}`;
            return (
              <li key={row.id} className={cn(isOpen && 'bg-muted/10')}>
                <div className="grid grid-cols-[auto_48px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 md:grid-cols-[auto_48px_minmax(0,1fr)_120px_90px_110px_132px]">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Seleccionar ${row.name}`} className="h-4 w-4 accent-white" />
                  <div className={cn('relative h-12 w-12 bg-black', row.stock === 0 && 'grayscale')}>
                    {row.primaryImage ? (
                      <Image src={cloudinaryImageSrc(row.primaryImage.public_id, row.primaryImage)} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground" title="Sin fotos">
                        <ImageOff className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => toggle(row.id)} aria-expanded={isOpen} aria-controls={panelId} className="min-w-0 text-left">
                    <span className="block truncate font-medium hover:underline">{row.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[row.brand, row.category, row.variants > 1 ? `${row.variants} variantes` : null].filter(Boolean).join(' · ') || 'Sin marca'}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs md:hidden">
                      <span className="tabular-nums">{formatPEN(row.price)}</span>
                      <span className={cn('tabular-nums', row.stock > 0 && row.stock <= LOW_STOCK && 'text-amber-300')}>{row.stock === 0 ? 'Agotado' : `${row.stock} en stock`}</span>
                      <Badge tone={PRODUCT_STATUS_TONES[row.status]}>{PRODUCT_STATUS_LABELS[row.status]}</Badge>
                    </span>
                  </button>
                  <span className="hidden text-right text-sm tabular-nums md:block">
                    {formatPEN(row.price)}
                    {row.compareAtPrice ? <span className="block text-xs text-muted-foreground line-through">{formatPEN(row.compareAtPrice)}</span> : null}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums md:block">
                    {row.stock === 0 ? <Badge>Agotado</Badge> : row.stock <= LOW_STOCK ? <span className="text-amber-300">{row.stock}</span> : row.stock}
                  </span>
                  <span className="hidden md:block">
                    <Badge tone={PRODUCT_STATUS_TONES[row.status]}>{PRODUCT_STATUS_LABELS[row.status]}</Badge>
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className={cn('inline-flex items-center gap-1 border px-2 py-1.5 text-xs uppercase tracking-wider', isOpen ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
                    >
                      <span className="hidden sm:inline">{isOpen ? 'Cerrar' : 'Editar'}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                      <span className="sr-only sm:hidden">{isOpen ? `Cerrar ${row.name}` : `Editar ${row.name}`}</span>
                    </button>
                    <ProductRowActions product={{ id: row.id, name: row.name, slug: row.slug, status: row.status, stock: row.stock, images: row.imageCount }} />
                  </span>
                </div>
                {isOpen ? (
                  <div id={panelId} role="region" aria-label={`Editar ${row.name}`} className="border-t border-border px-3 py-4 md:px-4">
                    <InlineEditor id={row.id} register={register} onClose={close} onDirtyChange={onDirtyChange} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={confirmSoldOut}
        onOpenChange={setConfirmSoldOut}
        title="Marcar como agotados"
        description={`El stock de los ${selected.size} productos seleccionados pasará a 0 en todas sus variantes. Seguirán en la tienda, en gris. Sus fotos no se tocan.`}
        confirmLabel="Marcar agotados"
        tone="primary"
        pending={bulkPending}
        onConfirm={() => runBulk(() => bulkMarkSoldOut(selectedIds), (n) => `${n} marcado(s) como agotados`)}
      />
    </div>
  );
}
