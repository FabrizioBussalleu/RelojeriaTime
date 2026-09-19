'use client';

import { useCallback, useEffect, useId, useImperativeHandle, useState, useTransition, type Ref } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createBrand, createCategory, discardUploads, saveProduct } from '@/app/admin/(panel)/productos/actions';
import { PRODUCT_STATUS_HINTS, PRODUCT_STATUS_LABELS, type ProductStatus } from '@/lib/admin/labels';
import { issuesToFieldErrors, ProductInputSchema, slugify, SPEC_SUGGESTIONS, type ProductInput } from '@/lib/admin/product-input';
import { DEFAULT_VARIANT_LABEL, GENDER_LABELS, MOVEMENT_LABELS, type WatchGender, type WatchMovement } from '@/lib/store';
import { cn } from '@/lib/utils';
import { buttonClass, Card, Field, inputClass, Notice } from '../ui';
import { ImageManager, type ManagedImage } from './ImageManager';

type Option = { id: string; name: string };
type VariantRow = { key: string; id: string | null; label: string; sku: string; stock: string; price_override: string };

export type ProductFormInitial = {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  brand_id: string | null;
  category_id: string | null;
  gender: WatchGender | null;
  movement: WatchMovement | null;
  price: number | null;
  compare_at_price: number | null;
  status: ProductStatus;
  specs: { label: string; value: string }[];
  variants: { id: string; label: string; sku: string | null; stock: number; price_override: number | null }[];
  images: Omit<ManagedImage, 'isNew'>[];
};

// "1,299.90" o "1299,90" → 1299.9. Vacío → null.
function parseMoney(value: string): number | null {
  const clean = value.replace(/[^\d.,]/g, '');
  if (!clean) return null;
  const normalized = /,\d{1,2}$/.test(clean) && !clean.includes('.') ? clean.replace(',', '.') : clean.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : NaN;
}

const toText = (value: number | null) => (value === null ? '' : String(value));

function TaxonomySelect({
  label,
  value,
  options,
  onChange,
  onCreate,
  error,
}: {
  label: string;
  value: string | null;
  options: Option[];
  onChange: (id: string | null) => void;
  onCreate: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  error?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);

  const create = () =>
    startTransition(async () => {
      const result = await onCreate(name);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      onChange(result.id);
      setAdding(false);
      setName('');
      setCreateError(null);
    });

  return (
    <Field label={label} error={error ?? createError}>
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                create();
              }
              if (event.key === 'Escape') setAdding(false);
            }}
            placeholder={`Nueva ${label.toLowerCase()}`}
            className={inputClass}
            aria-label={`Nombre de la nueva ${label.toLowerCase()}`}
          />
          <button type="button" className={buttonClass.primary} onClick={create} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Agregar'}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => setAdding(false)}>
            ✕<span className="sr-only">Cancelar</span>
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className={inputClass}>
            <option value="">Sin {label.toLowerCase()}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <button type="button" className={buttonClass.secondary} onClick={() => setAdding(true)} title={`Nueva ${label.toLowerCase()}`}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="sr-only">Nueva {label.toLowerCase()}</span>
          </button>
        </div>
      )}
    </Field>
  );
}

// Acciones que la lista de productos usa sobre cada desplegable abierto ("Guardar todos", cerrar).
export type ProductFormHandle = { save: () => Promise<boolean>; requestClose: () => boolean; isDirty: () => boolean };

export function ProductForm({
  initial,
  brands: initialBrands,
  categories: initialCategories,
  isNew,
  variant = 'page',
  onSaved,
  onClose,
  onDirtyChange,
  ref,
}: {
  initial: ProductFormInitial;
  brands: Option[];
  categories: Option[];
  isNew: boolean;
  // 'page': página propia (crear o enlace directo). 'inline': desplegable dentro de la lista.
  variant?: 'page' | 'inline';
  onSaved?: () => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<ProductFormHandle>;
}) {
  const router = useRouter();
  const specListId = useId();
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState(initialBrands);
  const [categories, setCategories] = useState(initialCategories);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [brandId, setBrandId] = useState(initial.brand_id);
  const [categoryId, setCategoryId] = useState(initial.category_id);
  const [gender, setGender] = useState(initial.gender);
  const [movement, setMovement] = useState(initial.movement);
  const [price, setPrice] = useState(toText(initial.price));
  const [compareAt, setCompareAt] = useState(toText(initial.compare_at_price));
  const [status, setStatus] = useState<ProductStatus>(initial.status);
  const [specs, setSpecs] = useState(initial.specs.length ? initial.specs : [{ label: '', value: '' }]);
  const [hasVariants, setHasVariants] = useState(initial.variants.length > 1 || initial.variants.some((variant) => variant.label !== DEFAULT_VARIANT_LABEL));
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    (initial.variants.length ? initial.variants : [{ id: null, label: DEFAULT_VARIANT_LABEL, sku: null, stock: 1, price_override: null }]).map((variant) => ({
      key: variant.id ?? crypto.randomUUID(),
      id: variant.id,
      label: variant.label === DEFAULT_VARIANT_LABEL ? '' : variant.label,
      sku: variant.sku ?? '',
      stock: String(variant.stock),
      price_override: toText(variant.price_override),
    }))
  );
  const [images, setImages] = useState<ManagedImage[]>(() => initial.images.map((image) => ({ ...image, isNew: false })));

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onImagesChange = useCallback((update: (images: ManagedImage[]) => ManagedImage[]) => {
    setImages(update);
    setDirty(true);
  }, []);
  const onDiscard = useCallback((publicIds: string[]) => void discardUploads(initial.id, publicIds), [initial.id]);

  const brandName = brands.find((brand) => brand.id === brandId)?.name;
  const updateVariant = (key: string, patch: Partial<VariantRow>) => {
    setVariants((current) => current.map((variant) => (variant.key === key ? { ...variant, ...patch } : variant)));
    setDirty(true);
  };
  const moveVariant = (index: number, delta: number) => {
    setVariants((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
    setDirty(true);
  };

  const buildInput = (): ProductInput => {
    const rows = hasVariants ? variants : variants.slice(0, 1).map((variant) => ({ ...variant, label: '', price_override: '' }));
    return {
      id: initial.id,
      slug: initial.slug ?? slugify([brandName, name].filter(Boolean).join(' ')),
      name: name.trim(),
      description: description.trim(),
      brand_id: brandId,
      category_id: categoryId,
      gender,
      movement,
      price: parseMoney(price) ?? NaN,
      compare_at_price: parseMoney(compareAt),
      status,
      specs: specs.map((spec) => ({ label: spec.label.trim(), value: spec.value.trim() })).filter((spec) => spec.label && spec.value),
      variants: rows.map((variant) => ({
        id: variant.id,
        label: variant.label.trim(),
        sku: variant.sku.trim(),
        stock: variant.stock.trim() === '' ? NaN : Number(variant.stock),
        price_override: parseMoney(variant.price_override),
      })),
      images: images.map(({ public_id, width, height, is_primary, crop, brightness, contrast }) => ({ public_id, width, height, is_primary, crop, brightness, contrast })),
    };
  };

  // Valida y guarda. Devuelve si se guardó (lo usa "Guardar todos" en la lista).
  const saveNow = async (): Promise<boolean> => {
    const input = buildInput();
    const parsed = ProductInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      setFormError('Revisa los campos marcados.');
      return false;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const result = await saveProduct(parsed.data);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return false;
      }
      setDirty(false);
      toast.success(result.created ? 'Producto creado' : `${input.name}: cambios guardados`, {
        description: status === 'active' ? 'Ya se ve en la tienda.' : PRODUCT_STATUS_HINTS[status],
      });
      if (variant === 'page') router.push('/admin/productos');
      router.refresh();
      onSaved?.();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void saveNow();
  };

  // Cerrar sin guardar: confirma si hay cambios y borra de Cloudinary las fotos recién subidas.
  const cancel = () => {
    const unsaved = images.filter((image) => image.isNew).map((image) => image.public_id);
    if (dirty && !window.confirm('¿Cerrar sin guardar? Se perderán los cambios.')) return false;
    if (unsaved.length) void discardUploads(initial.id, unsaved);
    setDirty(false);
    if (variant === 'page') router.push('/admin/productos');
    onClose?.();
    return true;
  };

  useImperativeHandle(ref, () => ({ save: saveNow, requestClose: cancel, isDirty: () => dirty }));
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const totalStock = (hasVariants ? variants : variants.slice(0, 1)).reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <Card title="Información">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del reloj" error={errors.name} className="sm:col-span-2">
              <input value={name} onChange={(event) => touch(setName)(event.target.value)} placeholder="Ej.: Edifice EFR-526D" className={inputClass} maxLength={160} />
            </Field>
            <TaxonomySelect
              label="Marca"
              value={brandId}
              options={brands}
              onChange={touch(setBrandId)}
              onCreate={async (value) => {
                const result = await createBrand(value);
                if (result.ok) setBrands((current) => (current.some((brand) => brand.id === result.id) ? current : [...current, { id: result.id, name: result.name }].sort((a, b) => a.name.localeCompare(b.name, 'es'))));
                return result;
              }}
            />
            <TaxonomySelect
              label="Categoría"
              value={categoryId}
              options={categories}
              onChange={touch(setCategoryId)}
              onCreate={async (value) => {
                const result = await createCategory(value);
                if (result.ok) setCategories((current) => (current.some((category) => category.id === result.id) ? current : [...current, { id: result.id, name: result.name }].sort((a, b) => a.name.localeCompare(b.name, 'es'))));
                return result;
              }}
            />
            <Field label="Para">
              <select value={gender ?? ''} onChange={(event) => touch(setGender)((event.target.value || null) as WatchGender | null)} className={inputClass}>
                <option value="">Sin especificar</option>
                {Object.entries(GENDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Movimiento">
              <select value={movement ?? ''} onChange={(event) => touch(setMovement)((event.target.value || null) as WatchMovement | null)} className={inputClass}>
                <option value="">Sin especificar</option>
                {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descripción" error={errors.description} className="sm:col-span-2">
              <textarea value={description} onChange={(event) => touch(setDescription)(event.target.value)} rows={5} maxLength={5000} className={inputClass} placeholder="Qué lo hace especial, para quién es, detalles de uso…" />
            </Field>
          </div>
        </Card>

        <Card title="Fotos">
          <ImageManager productId={initial.id} images={images} onChange={onImagesChange} onDiscard={onDiscard} onBusyChange={setUploading} error={errors.images} />
        </Card>

        <Card title="Precio y stock">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Precio (S/)" error={errors.price}>
              <input value={price} onChange={(event) => touch(setPrice)(event.target.value)} inputMode="decimal" placeholder="0.00" className={inputClass} />
            </Field>
            <Field label="Precio anterior (S/, opcional)" hint="Si lo llenas, la tienda muestra el precio tachado y la etiqueta de oferta." error={errors.compare_at_price}>
              <input value={compareAt} onChange={(event) => touch(setCompareAt)(event.target.value)} inputMode="decimal" placeholder="—" className={inputClass} />
            </Field>
          </div>

          <label className="mt-5 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(event) => {
                if (!event.target.checked && variants.length > 1 && !window.confirm('Se conservará solo la primera variante (con su stock). ¿Continuar?')) return;
                touch(setHasVariants)(event.target.checked);
              }}
              className="mt-1 h-4 w-4 accent-white"
            />
            <span>
              Tiene variantes
              <span className="block text-xs text-muted-foreground">Por ejemplo, tamaños de caja (38 mm / 42 mm) o colores, cada una con su stock y, si quieres, su propio precio.</span>
            </span>
          </label>

          {hasVariants ? (
            <div className="mt-4 space-y-2">
              <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground sm:grid">
                <span>Variante</span>
                <span>SKU</span>
                <span>Stock</span>
                <span>Precio propio</span>
                <span className="sr-only">Acciones</span>
              </div>
              {variants.map((variant, index) => (
                <fieldset key={variant.key} className="grid gap-2 border border-border p-2 sm:grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] sm:border-0 sm:p-0">
                  <legend className="sr-only">Variante {index + 1}</legend>
                  <input value={variant.label} onChange={(event) => updateVariant(variant.key, { label: event.target.value })} placeholder="Ej.: 42 mm" aria-label={`Nombre de la variante ${index + 1}`} className={cn(inputClass, errors[`variants.${index}.label`] && 'border-red-400')} />
                  <input value={variant.sku} onChange={(event) => updateVariant(variant.key, { sku: event.target.value })} placeholder="SKU (opcional)" aria-label={`SKU de la variante ${index + 1}`} className={inputClass} />
                  <input value={variant.stock} onChange={(event) => updateVariant(variant.key, { stock: event.target.value.replace(/\D/g, '') })} inputMode="numeric" aria-label={`Stock de la variante ${index + 1}`} className={cn(inputClass, errors[`variants.${index}.stock`] && 'border-red-400')} />
                  <input value={variant.price_override} onChange={(event) => updateVariant(variant.key, { price_override: event.target.value })} inputMode="decimal" placeholder={price ? `= ${price}` : 'Igual al precio'} aria-label={`Precio propio de la variante ${index + 1}`} className={inputClass} />
                  <span className="flex gap-1">
                    <button type="button" onClick={() => moveVariant(index, -1)} disabled={index === 0} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Subir variante ${index + 1}`}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => moveVariant(index, 1)} disabled={index === variants.length - 1} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Bajar variante ${index + 1}`}>
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVariants((current) => current.filter((item) => item.key !== variant.key));
                        setDirty(true);
                      }}
                      disabled={variants.length === 1}
                      className="p-2 text-muted-foreground hover:text-red-400 disabled:opacity-30"
                      aria-label={`Quitar variante ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                  {errors[`variants.${index}.label`] || errors[`variants.${index}.stock`] ? (
                    <span className="text-xs text-red-400 sm:col-span-5">{errors[`variants.${index}.label`] ?? errors[`variants.${index}.stock`]}</span>
                  ) : null}
                </fieldset>
              ))}
              <button
                type="button"
                className={buttonClass.secondary}
                onClick={() => {
                  setVariants((current) => [...current, { key: crypto.randomUUID(), id: null, label: '', sku: '', stock: '0', price_override: '' }]);
                  setDirty(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Agregar variante
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Stock" error={errors['variants.0.stock']}>
                <input value={variants[0]?.stock ?? '0'} onChange={(event) => updateVariant(variants[0].key, { stock: event.target.value.replace(/\D/g, '') })} inputMode="numeric" className={inputClass} />
              </Field>
              <Field label="SKU (opcional)">
                <input value={variants[0]?.sku ?? ''} onChange={(event) => updateVariant(variants[0].key, { sku: event.target.value })} className={inputClass} />
              </Field>
            </div>
          )}
          {errors.variants ? <p className="mt-2 text-xs text-red-400">{errors.variants}</p> : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Stock total: <strong className="text-foreground">{totalStock}</strong>
            {totalStock === 0 ? ' · se mostrará como agotado (en gris)' : ''}
          </p>
        </Card>

        <Card title="Ficha técnica">
          <datalist id={specListId}>
            {SPEC_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <div className="space-y-2">
            {specs.map((spec, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <input
                  list={specListId}
                  value={spec.label}
                  onChange={(event) => touch(setSpecs)(specs.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)))}
                  placeholder="Ej.: Resistencia al agua"
                  aria-label={`Característica ${index + 1}`}
                  className={inputClass}
                />
                <input
                  value={spec.value}
                  onChange={(event) => touch(setSpecs)(specs.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)))}
                  placeholder="Ej.: 100 m"
                  aria-label={`Valor de la característica ${index + 1}`}
                  className={inputClass}
                />
                <button type="button" onClick={() => touch(setSpecs)(specs.filter((_, position) => position !== index))} className="p-2 text-muted-foreground hover:text-red-400" aria-label={`Quitar característica ${index + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={cn(buttonClass.secondary, 'mt-3')} onClick={() => touch(setSpecs)([...specs, { label: '', value: '' }])}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar característica
          </button>
          <p className="mt-2 text-xs text-muted-foreground">Se muestran en la ficha del producto y el asistente de WhatsApp las usa para responder.</p>
        </Card>
      </div>

      <aside aria-label={variant === 'inline' ? `Publicación de ${initial.name}` : 'Publicación'} className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card title="Estado">
          <div className="space-y-2">
            {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((option) => (
              <label key={option} className={cn('flex cursor-pointer gap-3 border p-3 text-sm', status === option ? 'border-foreground' : 'border-border')}>
                <input type="radio" name="status" value={option} checked={status === option} onChange={() => touch(setStatus)(option)} className="mt-1 accent-white" />
                <span>
                  <span className="block font-medium">{PRODUCT_STATUS_LABELS[option]}</span>
                  <span className="text-xs text-muted-foreground">{PRODUCT_STATUS_HINTS[option]}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-2">
          <button type="submit" className={buttonClass.primary} disabled={saving || uploading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {uploading ? 'Subiendo fotos…' : saving ? 'Guardando…' : isNew ? 'Crear producto' : 'Guardar cambios'}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={cancel} disabled={saving}>
            {variant === 'inline' ? 'Cerrar' : 'Cancelar'}
          </button>
          {!isNew && initial.slug && initial.status === 'active' ? (
            <Link href={`/producto/${initial.slug}`} target="_blank" className="inline-flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground">
              Ver en la tienda <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </aside>
    </form>
  );
}
