'use client';

import { useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { BrandIcon } from '@/components/icons/BrandIcon';
import type { CatalogProduct } from '@/lib/catalog';
import { whatsappLink } from '@/lib/store';
import { cn } from '@/lib/utils';

// Lista de cotización: solo cantidades, sin precios. Vive en el navegador (esta pestaña y las
// siguientes visitas) hasta que el cliente la envía por WhatsApp.
const ALMACEN = 'time-cotizacion-v1';
const MAX_POR_MODELO = 999;

type Linea = { id: string; cantidad: number };

// Mismo patrón que el carrito: el servidor pinta una lista vacía y el navegador toma la guardada al
// hidratar, sin efectos encadenados. localStorage puede estar bloqueado: nunca debe tumbar la página.
const VACIA: Linea[] = [];
const oyentes = new Set<() => void>();
let cache: Linea[] | null = null;

function leer(): Linea[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(ALMACEN) ?? '[]');
    return Array.isArray(guardado)
      ? (guardado as Linea[]).filter((linea) => typeof linea?.id === 'string' && Number.isFinite(linea?.cantidad))
      : VACIA;
  } catch {
    return VACIA;
  }
}

function guardar(lineas: Linea[]) {
  cache = lineas;
  try {
    localStorage.setItem(ALMACEN, JSON.stringify(lineas));
  } catch {
    // Sin almacenamiento (modo privado): la lista solo dura lo que dure la visita.
  }
  oyentes.forEach((oyente) => oyente());
}

const suscribir = (oyente: () => void) => {
  oyentes.add(oyente);
  const alCambiar = (evento: StorageEvent) => {
    if (evento.key !== ALMACEN) return;
    cache = null;
    oyente();
  };
  window.addEventListener('storage', alCambiar);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener('storage', alCambiar);
  };
};

export function WholesaleCatalog({ products, whatsappNumber }: { products: CatalogProduct[]; whatsappNumber: string | null }) {
  const lineas = useSyncExternalStore(suscribir, () => (cache ??= leer()), () => VACIA);

  const cantidadDe = (id: string) => lineas.find((linea) => linea.id === id)?.cantidad ?? 0;
  const cambiar = (id: string, cantidad: number) => {
    const limpia = Math.max(0, Math.min(MAX_POR_MODELO, Math.round(cantidad) || 0));
    const resto = lineas.filter((linea) => linea.id !== id);
    guardar(limpia > 0 ? [...resto, { id, cantidad: limpia }] : resto);
  };

  const seleccionados = lineas
    .map((linea) => ({ linea, producto: products.find((product) => product.id === linea.id) }))
    .filter((fila): fila is { linea: Linea; producto: CatalogProduct } => Boolean(fila.producto));
  const unidades = seleccionados.reduce((total, { linea }) => total + linea.cantidad, 0);

  const mensaje = [
    'Hola, quiero una cotización al por mayor:',
    ...seleccionados.map(({ producto, linea }) => `• ${[producto.brand, producto.name].filter(Boolean).join(' ')} — ${linea.cantidad} unidades`),
    '',
    `Total: ${unidades} unidades de ${seleccionados.length} ${seleccionados.length === 1 ? 'modelo' : 'modelos'}.`,
  ].join('\n');

  return (
    <>
      <section aria-labelledby="modelos-titulo" className="mt-14">
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h2 id="modelos-titulo" className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Modelos disponibles
          </h2>
          <p className="text-sm text-muted-foreground">Elige cuántas unidades quieres de cada modelo. Sin mínimo ni máximo.</p>
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
          {products.map((product, index) => {
            const cantidad = cantidadDe(product.id);
            const imagen = product.images[0];
            return (
              <li key={product.id}>
                <article>
                  <div className="relative aspect-square bg-card">
                    <Link href={`/producto/${product.slug}`} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
                      {imagen ? <Image src={imagen.src} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" priority={index < 4} className="object-cover" /> : null}
                    </Link>
                    {product.wholesaleOnly ? (
                      <span className="absolute left-3 top-3 bg-foreground px-2 py-1 text-[0.65rem] font-display uppercase tracking-[0.15em] text-background">
                        Exclusivo por mayor
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-1">
                    {product.brand ? <p className="text-[0.7rem] font-body uppercase tracking-[0.2em] text-muted-foreground">{product.brand}</p> : null}
                    <h3 className="font-display text-sm tracking-wider">
                      <Link href={`/producto/${product.slug}`} className="hover:underline underline-offset-4">
                        {product.name}
                      </Link>
                    </h3>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cambiar(product.id, cantidad - 1)}
                      disabled={cantidad === 0}
                      aria-label={`Quitar una unidad de ${product.name}`}
                      className="border border-border p-2 transition-colors hover:border-foreground disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <label className="sr-only" htmlFor={`cantidad-${product.id}`}>
                      Unidades de {product.name}
                    </label>
                    <input
                      id={`cantidad-${product.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_POR_MODELO}
                      value={cantidad || ''}
                      placeholder="0"
                      onChange={(event) => cambiar(product.id, Number(event.target.value))}
                      className="w-16 border border-border bg-background px-2 py-1.5 text-center text-sm tabular-nums focus:border-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => cambiar(product.id, cantidad + 1)}
                      aria-label={`Agregar una unidad de ${product.name}`}
                      className="border border-border p-2 transition-colors hover:border-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="cotizacion-titulo" className="mt-16 border-t border-border pt-10">
        <h2 id="cotizacion-titulo" className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Tu cotización
        </h2>

        {seleccionados.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Todavía no eliges modelos. Marca las unidades que necesitas y te enviamos precios por volumen y condiciones de entrega.
          </p>
        ) : (
          <>
            <ul className="mt-6 divide-y divide-border border-y border-border" aria-live="polite">
              {seleccionados.map(({ producto, linea }) => (
                <li key={producto.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span>
                    {[producto.brand, producto.name].filter(Boolean).join(' ')}
                    <span className="block text-xs text-muted-foreground">{linea.cantidad} unidades</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => cambiar(producto.id, 0)}
                    aria-label={`Quitar ${producto.name} de la cotización`}
                    className="p-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-sm text-muted-foreground">
              <strong className="text-foreground">{unidades} unidades</strong> en {seleccionados.length} {seleccionados.length === 1 ? 'modelo' : 'modelos'}.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {whatsappNumber ? (
                <a
                  href={whatsappLink(whatsappNumber, mensaje)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn('btn-primary inline-flex items-center justify-center gap-2')}
                >
                  <BrandIcon brand="whatsapp" className="h-4 w-4" />
                  Solicitar cotización
                </a>
              ) : null}
              <button type="button" onClick={() => guardar(VACIA)} className="btn-ghost">
                Vaciar la lista
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
