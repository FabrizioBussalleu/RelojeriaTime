import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ProductsList } from '@/components/admin/products/ProductsList';
import { buttonClass, EmptyState, inputClass, PageHeader } from '@/components/admin/ui';
import { LOW_STOCK, type ProductStatus } from '@/lib/admin/labels';
import { getAdminProducts } from '@/lib/admin/products-query';
import { requireAdmin } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Productos' };

const PAGE_SIZE = 40;
const SORTS = {
  organizador: 'Orden de la tienda',
  recientes: 'Más recientes',
  nombre: 'Nombre',
  'precio-desc': 'Precio: mayor a menor',
  'precio-asc': 'Precio: menor a mayor',
  stock: 'Menos stock primero',
} as const;

type Params = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const q = single(params.q)?.trim() ?? '';
  const status = single(params.estado) as ProductStatus | undefined;
  const brandId = single(params.marca);
  const stockFilter = single(params.stock);
  const sort = (single(params.orden) ?? 'organizador') in SORTS ? ((single(params.orden) ?? 'organizador') as keyof typeof SORTS) : 'organizador';
  const page = Math.max(1, Number(single(params.pagina)) || 1);

  const [products, { data: brands }] = await Promise.all([getAdminProducts(supabase), supabase.from('brands').select('id, name').order('name')]);
  const counts = { all: products.length, active: 0, draft: 0, archived: 0 } as Record<string, number>;
  for (const product of products) counts[product.status] += 1;

  const term = normalize(q);
  const filtered = products
    .filter((product) => !status || product.status === status)
    .filter((product) => !brandId || product.brandId === brandId)
    .filter((product) => (stockFilter === 'agotados' ? product.stock === 0 : stockFilter === 'bajo' ? product.stock > 0 && product.stock <= LOW_STOCK : stockFilter === 'con-stock' ? product.stock > 0 : true))
    .filter((product) => !term || normalize([product.name, product.brand, product.category, ...product.skus].filter(Boolean).join(' ')).includes(term));
  const compare: Record<keyof typeof SORTS, (a: (typeof products)[number], b: (typeof products)[number]) => number> = {
    organizador: (a, b) => a.position - b.position,
    recientes: (a, b) => b.createdAt.localeCompare(a.createdAt),
    nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    'precio-desc': (a, b) => b.price - a.price,
    'precio-asc': (a, b) => a.price - b.price,
    stock: (a, b) => a.stock - b.stock,
  };
  const sorted = [...filtered].sort(compare[sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: q || undefined, estado: status, marca: brandId, stock: stockFilter, orden: sort === 'organizador' ? undefined : sort, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return `/admin/productos${query ? `?${query}` : ''}`;
  };
  const filtered_ = Boolean(q || brandId || stockFilter);

  return (
    <>
      <PageHeader
        title="Productos"
        description="Toca un producto para editarlo aquí mismo; puedes abrir varios a la vez o seleccionarlos para cambiarlos en bloque. Eliminar borra también sus fotos en Cloudinary."
        actions={
          <Link href="/admin/productos/nuevo" className={buttonClass.primary}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo producto
          </Link>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Estado">
        {[
          { key: undefined, label: 'Todos', count: counts.all },
          { key: 'active', label: 'Publicados', count: counts.active },
          { key: 'draft', label: 'Borradores', count: counts.draft },
          { key: 'archived', label: 'Archivados', count: counts.archived },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={href({ estado: tab.key, pagina: undefined })}
            aria-current={status === tab.key ? 'page' : undefined}
            className={cn('border px-3 py-1.5 text-xs uppercase tracking-wider', status === tab.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {tab.label} <span className="tabular-nums opacity-70">{tab.count}</span>
          </Link>
        ))}
      </nav>

      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
        {status ? <input type="hidden" name="estado" value={status} /> : null}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, marca o SKU" aria-label="Buscar productos" className={inputClass} />
        <select name="marca" defaultValue={brandId ?? ''} aria-label="Marca" className={inputClass}>
          <option value="">Todas las marcas</option>
          {(brands ?? []).map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <select name="stock" defaultValue={stockFilter ?? ''} aria-label="Stock" className={inputClass}>
          <option value="">Todo el stock</option>
          <option value="con-stock">Con stock</option>
          <option value="bajo">Stock bajo (≤ {LOW_STOCK})</option>
          <option value="agotados">Agotados</option>
        </select>
        <select name="orden" defaultValue={sort} aria-label="Ordenar" className={inputClass}>
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass.secondary}>
          Filtrar
        </button>
      </form>
      {filtered_ ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {sorted.length} resultado(s) ·{' '}
          <Link href={href({ q: undefined, marca: undefined, stock: undefined, pagina: undefined })} className="underline">
            quitar filtros
          </Link>
        </p>
      ) : null}

      {visible.length ? (
        <ProductsList
          openId={single(params.editar)}
          rows={visible.map((product) => ({
            id: product.id,
            slug: product.slug,
            name: product.name,
            brand: product.brand,
            category: product.category,
            variants: product.variants,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            stock: product.stock,
            status: product.status,
            imageCount: product.imageCount,
            primaryImage: product.primaryImage,
          }))}
        />
      ) : (
        <EmptyState title={products.length ? 'Sin resultados' : 'Aún no hay productos'}>
          {products.length ? 'Prueba con otros filtros.' : 'Crea el primer reloj con sus fotos, precio y stock.'}
        </EmptyState>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          {page > 1 ? (
            <Link href={href({ pagina: String(page - 1) })} className={buttonClass.secondary}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={href({ pagina: String(page + 1) })} className={buttonClass.secondary}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
