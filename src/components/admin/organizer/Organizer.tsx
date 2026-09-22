'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { closestCenter, DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageOff, Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { saveProductOrder, setSoldOutLast, type OrderScope } from '@/app/admin/(panel)/organizador/actions';
import { PRODUCT_STATUS_LABELS, type ProductStatus } from '@/lib/admin/labels';
import { cloudinaryImageSrc, type ImageCrop } from '@/lib/cloudinary/url';
import { formatPEN } from '@/lib/store';
import { cn } from '@/lib/utils';
import { dragAccessibility, useDragSensors } from '../dnd';
import { buttonClass, Notice } from '../ui';

export type OrganizerProduct = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  stock: number;
  status: ProductStatus;
  wholesaleOnly: boolean;
  createdAt: string;
  image: { public_id: string; crop: ImageCrop | null; brightness: number; contrast: number } | null;
};

type QuickSort = { key: string; label: string; compare: (a: OrganizerProduct, b: OrganizerProduct) => number };

const collator = new Intl.Collator('es');
const QUICK_SORTS: QuickSort[] = [
  { key: 'precio-asc', label: 'Precio ↑', compare: (a, b) => a.price - b.price },
  { key: 'precio-desc', label: 'Precio ↓', compare: (a, b) => b.price - a.price },
  { key: 'marca', label: 'Marca A–Z', compare: (a, b) => collator.compare(a.brand ?? '~', b.brand ?? '~') || collator.compare(a.name, b.name) },
  { key: 'categoria', label: 'Categoría A–Z', compare: (a, b) => collator.compare(a.category ?? '~', b.category ?? '~') || collator.compare(a.name, b.name) },
  { key: 'nuevos', label: 'Más nuevos primero', compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
];

function TileCard({ product, index, dragging, overlay }: { product: OrganizerProduct; index: number; dragging?: boolean; overlay?: boolean }) {
  const soldOut = product.stock <= 0;
  return (
    <div
      className={cn(
        'relative flex h-full select-none flex-col border bg-card',
        overlay ? 'rotate-[1.5deg] scale-105 cursor-grabbing border-foreground shadow-2xl shadow-black/60' : 'border-border',
        dragging && 'border-dashed opacity-30'
      )}
    >
      <div className={cn('relative aspect-square bg-black', soldOut && 'grayscale')}>
        {product.image ? (
          <Image
            src={cloudinaryImageSrc(product.image.public_id, product.image)}
            alt=""
            fill
            sizes="(min-width: 1280px) 180px, 45vw"
            draggable={false}
            className={cn('pointer-events-none object-cover', soldOut && 'opacity-60')}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-5 w-5" aria-hidden />
          </span>
        )}
        <span className="absolute left-1 top-1 bg-black/75 px-1.5 py-0.5 text-[11px] tabular-nums text-white">{index + 1}</span>
        <span className="absolute right-1 top-1 bg-black/75 p-1 text-white" aria-hidden>
          <GripVertical className="h-4 w-4" />
        </span>
        {soldOut ? <span className="badge-sold-out absolute bottom-1 left-1">Agotado</span> : null}
        {product.status !== 'active' ? <span className="absolute bottom-1 right-1 bg-amber-400 px-1.5 py-0.5 text-[10px] uppercase text-black">{PRODUCT_STATUS_LABELS[product.status]}</span> : null}
      </div>
      <div className={cn('flex flex-1 flex-col gap-0.5 p-2 text-xs', soldOut && 'text-muted-foreground')}>
        <span className="line-clamp-2 font-medium">{product.name}</span>
        <span className="text-muted-foreground">{[product.brand, formatPEN(product.price)].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  );
}

// La tarjeta entera se agarra: arrastrar y soltar donde va.
function SortableTile({ product, index }: { product: OrganizerProduct; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div
        {...attributes}
        {...listeners}
        aria-label={`${product.name}, posición ${index + 1}`}
        className="h-full cursor-grab touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-foreground active:cursor-grabbing"
      >
        <TileCard product={product} index={index} dragging={isDragging} />
      </div>
    </li>
  );
}

function SortableGrid({ items, onChange, label }: { items: OrganizerProduct[]; onChange: (items: OrganizerProduct[]) => void; label: string }) {
  const sensors = useDragSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  const position = (id: string) => items.findIndex((item) => item.id === id) + 1;
  const describe = (id: string) => items.find((item) => item.id === id)?.name ?? 'el reloj';
  const active = activeId ? items.find((item) => item.id === activeId) : null;

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || dragged.id === over.id) return;
    onChange(arrayMove(items, items.findIndex((item) => item.id === dragged.id), items.findIndex((item) => item.id === over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active: dragged }: DragStartEvent) => setActiveId(String(dragged.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={dragAccessibility(describe, position)}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-label={label}>
          {items.map((product, index) => (
            <SortableTile key={product.id} product={product} index={index} />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>{active ? <TileCard product={active} index={position(active.id) - 1} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

export function Organizer({
  products,
  soldOutLast: initialSoldOutLast,
  scope = 'tienda',
}: {
  products: OrganizerProduct[];
  soldOutLast: boolean;
  scope?: OrderScope;
}) {
  const porMayor = scope === 'por_mayor';
  const [order, setOrder] = useState(products);
  const [saved, setSaved] = useState(products);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [soldOutLast, setSoldOutLastState] = useState(initialSoldOutLast);
  const [saving, startSaving] = useTransition();
  const [togglingSetting, startToggle] = useTransition();

  const dirty = useMemo(() => order.some((product, index) => product.id !== saved[index]?.id), [order, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // En la tienda no entran los "solo al por mayor"; en por mayor entran todos los publicados.
  const visible = order.filter((product) => (includeHidden || product.status === 'active') && (porMayor || !product.wholesaleOnly));
  const conAgotadosAlFinal = soldOutLast && !porMayor;
  const available = conAgotadosAlFinal ? visible.filter((product) => product.stock > 0) : visible;
  const soldOut = conAgotadosAlFinal ? visible.filter((product) => product.stock <= 0) : [];

  // Reemplaza en el orden completo solo los productos del grupo que cambió, en su nuevo orden.
  const replaceGroup = (group: OrganizerProduct[], next: OrganizerProduct[]) => {
    const ids = new Set(group.map((product) => product.id));
    let cursor = 0;
    // Sin función de actualización: React puede llamarla dos veces y el cursor avanzaría de más.
    setOrder(order.map((product) => (ids.has(product.id) ? next[cursor++] : product)));
  };

  const applyQuickSort = (sort: QuickSort) => {
    const sorted = [...visible].sort((a, b) => sort.compare(a, b));
    replaceGroup(visible, sorted);
    toast.message(`Vista previa: ${sort.label}`, { description: 'Revisa y pulsa “Guardar orden” para aplicarlo en la tienda.' });
  };

  const soldOutToEnd = () => {
    const sorted = [...visible].sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0));
    replaceGroup(visible, sorted);
  };

  const save = () =>
    startSaving(async () => {
      // Con "agotados al final", lo guardado es exactamente lo que se ve: disponibles y luego agotados.
      const display = conAgotadosAlFinal ? [...order.filter((product) => product.stock > 0), ...order.filter((product) => product.stock <= 0)] : order;
      const result = await saveProductOrder(display.map((product) => product.id), scope);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOrder(display);
      setSaved(display);
      toast.success(porMayor ? 'Orden guardado: así se verá en “Compras al por mayor”.' : 'Orden guardado: la tienda ya lo muestra así.');
    });

  // Cambio optimista: la casilla responde al instante y vuelve atrás si el servidor falla.
  const toggleSoldOutLast = (value: boolean) => {
    setSoldOutLastState(value);
    startToggle(async () => {
      const result = await setSoldOutLast(value);
      if (!result.ok) {
        setSoldOutLastState(!value);
        toast.error(result.error);
        return;
      }
      toast.success(value ? 'Los agotados irán al final automáticamente.' : 'Los agotados respetan el orden que definas.');
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border border-border bg-card p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Ordenar rápido (vista previa)</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_SORTS.map((sort) => (
              <button key={sort.key} type="button" className="border border-border px-3 py-1.5 text-sm hover:border-foreground" onClick={() => applyQuickSort(sort)}>
                {sort.label}
              </button>
            ))}
            {!soldOutLast && !porMayor ? (
              <button type="button" className="border border-border px-3 py-1.5 text-sm hover:border-foreground" onClick={soldOutToEnd}>
                Agotados al final
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {/* Ajuste de la tienda: no se repite en la pestaña de por mayor, donde no hay stock a la vista. */}
            {porMayor ? null : (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={soldOutLast} disabled={togglingSetting} onChange={(event) => toggleSoldOutLast(event.target.checked)} className="h-4 w-4 accent-white" />
                Mover los agotados al final automáticamente en la tienda
                {togglingSetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} className="h-4 w-4 accent-white" />
              Mostrar también borradores y archivados
            </label>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className={buttonClass.secondary} disabled={!dirty || saving} onClick={() => setOrder(saved)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Descartar
          </button>
          <button type="button" className={buttonClass.primary} disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Guardar orden
          </button>
        </div>
      </div>

      {dirty ? <Notice tone="warning">Hay cambios sin guardar: la tienda todavía muestra el orden anterior.</Notice> : null}

      {available.length ? (
        <SortableGrid items={available} onChange={(next) => replaceGroup(available, next)} label="Productos en el orden de la tienda (arrastra para mover)" />
      ) : (
        <p className="text-sm text-muted-foreground">No hay productos {includeHidden ? '' : 'publicados '}con stock.</p>
      )}

      {soldOut.length ? (
        <section className="space-y-3">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted-foreground">Agotados · se muestran al final, en gris</h2>
          <SortableGrid items={soldOut} onChange={(next) => replaceGroup(soldOut, next)} label="Productos agotados (arrastra para mover entre ellos)" />
        </section>
      ) : null}
    </div>
  );
}
