'use client';

import { useEffect, useId, useState } from 'react';
import Image from 'next/image';
import { closestCenter, DndContext, DragOverlay, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImagePlus, Loader2, Pencil, Star, Trash2 } from 'lucide-react';
import { ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_IMAGES, MAX_UPLOAD_BYTES } from '@/lib/admin/product-input';
import { cloudinaryImageSrc } from '@/lib/cloudinary/url';
import { cn } from '@/lib/utils';
import { dragAccessibility, useDragSensors } from '../dnd';
import { ImageEditor, type EditableImage } from './ImageEditor';
import { uploadProductImage } from './upload';

export type ManagedImage = EditableImage & { is_primary: boolean; isNew: boolean };

type PendingUpload = { key: string; name: string; progress: number; error?: string };

// La foto misma se agarra y se suelta en su nueva posición; los botones de abajo siguen funcionando.
function SortableTile({
  image,
  index,
  onPrimary,
  onEdit,
  onRemove,
}: {
  image: ManagedImage;
  index: number;
  onPrimary: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: image.public_id });
  const edited = Boolean(image.crop || image.brightness || image.contrast);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative border bg-black', image.is_primary ? 'border-foreground' : 'border-border', isDragging && 'border-dashed opacity-30')}
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Foto ${index + 1}${image.is_primary ? ', principal' : ''}. Arrastra para cambiar el orden`}
        className="relative aspect-square cursor-grab touch-manipulation select-none outline-none focus-visible:ring-2 focus-visible:ring-foreground active:cursor-grabbing"
      >
        <Image src={cloudinaryImageSrc(image.public_id, image)} alt="" fill sizes="200px" draggable={false} className="pointer-events-none object-cover" />
        <span className="absolute right-1 top-1 bg-black/70 p-1 text-white" aria-hidden>
          <GripVertical className="h-4 w-4" />
        </span>
      </div>
      <div className="pointer-events-none absolute left-1 top-1 flex gap-1">
        {image.is_primary ? <span className="bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">Principal</span> : null}
        {edited ? <span className="bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white">Editada</span> : null}
      </div>
      <div className="flex border-t border-border">
        <button type="button" onClick={onPrimary} disabled={image.is_primary} className="flex flex-1 items-center justify-center py-2 text-muted-foreground hover:text-foreground disabled:text-amber-300" aria-label={image.is_primary ? 'Foto principal' : `Usar la foto ${index + 1} como principal`} title="Principal">
          <Star className={cn('h-4 w-4', image.is_primary && 'fill-current')} aria-hidden />
        </button>
        <button type="button" onClick={onEdit} className="flex flex-1 items-center justify-center border-x border-border py-2 text-muted-foreground hover:text-foreground" aria-label={`Editar foto ${index + 1}`} title="Recortar, brillo y contraste">
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={onRemove} className="flex flex-1 items-center justify-center py-2 text-muted-foreground hover:text-red-400" aria-label={`Quitar foto ${index + 1}`} title="Quitar">
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function ImageManager({
  productId,
  images,
  onChange,
  onDiscard,
  onBusyChange,
  error,
}: {
  productId: string;
  images: ManagedImage[];
  onChange: (update: (images: ManagedImage[]) => ManagedImage[]) => void;
  onDiscard: (publicIds: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  error?: string;
}) {
  const inputId = useId();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const sensors = useDragSensors();
  const [dragging, setDragging] = useState<string | null>(null);

  const addFiles = (files: File[]) => {
    const room = MAX_PRODUCT_IMAGES - images.length - uploads.filter((upload) => !upload.error).length;
    const accepted = files.slice(0, Math.max(0, room));
    const rejected: PendingUpload[] = files.slice(accepted.length).map((file) => ({ key: crypto.randomUUID(), name: file.name, progress: 0, error: `Máximo ${MAX_PRODUCT_IMAGES} fotos por producto.` }));
    const started: PendingUpload[] = [];
    for (const file of accepted) {
      const key = crypto.randomUUID();
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        rejected.push({ key, name: file.name, progress: 0, error: 'Formato no admitido (usa JPG, PNG, WEBP, AVIF o HEIC).' });
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push({ key, name: file.name, progress: 0, error: 'Pesa más de 10 MB.' });
        continue;
      }
      started.push({ key, name: file.name, progress: 0 });
      uploadProductImage(productId, file, (progress) => setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, progress } : upload))))
        .then((uploaded) => {
          setUploads((current) => current.filter((upload) => upload.key !== key));
          onChange((current) => [
            ...current,
            { ...uploaded, crop: null, brightness: 0, contrast: 0, is_primary: !current.some((image) => image.is_primary), isNew: true },
          ]);
        })
        .catch((uploadError: Error) => setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, error: uploadError.message } : upload))));
    }
    setUploads((current) => [...current, ...started, ...rejected]);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    onChange((current) => {
      const from = current.findIndex((image) => image.public_id === active.id);
      const to = current.findIndex((image) => image.public_id === over.id);
      return arrayMove(current, from, to);
    });
  };

  const remove = (image: ManagedImage) => {
    onChange((current) => {
      const next = current.filter((item) => item.public_id !== image.public_id);
      if (image.is_primary && next.length) next[0] = { ...next[0], is_primary: true };
      return next;
    });
    // Una foto recién subida no la usa nadie: se borra de Cloudinary ya. Las guardadas, al guardar.
    if (image.isNew) onDiscard([image.public_id]);
  };

  const editingImage = images.find((image) => image.public_id === editing);
  const draggingImage = images.find((image) => image.public_id === dragging);
  const busy = uploads.some((upload) => !upload.error);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center text-sm transition-colors focus-within:border-foreground',
          dragOver ? 'border-foreground bg-muted/40' : 'border-border hover:border-foreground/60',
          error && 'border-red-400'
        )}
      >
        <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span>
          <strong>Arrastra las fotos aquí</strong> o haz clic para elegirlas
        </span>
        <span className="text-xs text-muted-foreground">
          JPG, PNG, WEBP o HEIC · hasta 10 MB c/u · máximo {MAX_PRODUCT_IMAGES} · {images.length} cargada(s)
        </span>
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {uploads.length ? (
        <ul className="space-y-1.5" aria-live="polite">
          {uploads.map((upload) => (
            <li key={upload.key} className="flex items-center gap-3 border border-border px-3 py-2 text-xs">
              {upload.error ? null : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{upload.name}</span>
              {upload.error ? (
                <>
                  <span className="text-red-400">{upload.error}</span>
                  <button type="button" className="text-muted-foreground underline" onClick={() => setUploads((current) => current.filter((item) => item.key !== upload.key))}>
                    Quitar
                  </button>
                </>
              ) : (
                <span className="tabular-nums text-muted-foreground">{upload.progress}%</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {images.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setDragging(String(active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
          accessibility={dragAccessibility(
            (id) => `la foto ${images.findIndex((image) => image.public_id === id) + 1}`,
            (id) => images.findIndex((image) => image.public_id === id) + 1
          )}
        >
          <SortableContext items={images.map((image) => image.public_id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Fotos del producto (arrastra para ordenar)">
              {images.map((image, index) => (
                <SortableTile
                  key={image.public_id}
                  image={image}
                  index={index}
                  onPrimary={() => onChange((current) => current.map((item) => ({ ...item, is_primary: item.public_id === image.public_id })))}
                  onEdit={() => setEditing(image.public_id)}
                  onRemove={() => remove(image)}
                />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
            {draggingImage ? (
              <div className="relative aspect-square rotate-[1.5deg] scale-105 cursor-grabbing border border-foreground bg-black shadow-2xl shadow-black/60">
                <Image src={cloudinaryImageSrc(draggingImage.public_id, draggingImage)} alt="" fill sizes="200px" draggable={false} className="object-cover" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
      {images.length > 1 ? <p className="text-xs text-muted-foreground">Agarra una foto y suéltala donde va. La estrella marca la principal (portada en la tienda y primera en WhatsApp).</p> : null}
      {busy ? <p className="sr-only" role="status">Subiendo fotos…</p> : null}

      {editingImage ? (
        <ImageEditor
          image={editingImage}
          onClose={() => setEditing(null)}
          onSave={(edits) => {
            onChange((current) => current.map((item) => (item.public_id === editingImage.public_id ? { ...item, ...edits } : item)));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
