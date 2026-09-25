"use client";

import { useMemo, useState } from "react";
import ProductCard from "./ProductCard";
import type { CatalogProduct } from "@/lib/catalog";

const PAGE_SIZE = 12;

type CatalogProps = { products: CatalogProduct[]; error: string | null };

// Sin filtros en la home: el catálogo va en el orden del organizador.
function sortProducts(products: CatalogProduct[]) {
  return [...products].sort((a, b) => a.position - b.position || b.createdAt.localeCompare(a.createdAt));
}

export default function CatalogSection({ products, error }: CatalogProps) {
  const visibleProducts = useMemo(() => sortProducts(products), [products]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  return (
    <section id="catalogo" className="py-16 md:py-24 bg-background scroll-mt-[var(--header-height)]" aria-labelledby="catalogo-titulo">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-8">
          <h2 id="catalogo-titulo" className="text-3xl md:text-4xl font-display font-bold tracking-tight">
            Relojes
          </h2>
          <p className="text-sm text-muted-foreground font-body">
            {visibleProducts.length} {visibleProducts.length === 1 ? "reloj" : "relojes"}
          </p>
        </div>

        {error ? (
          <p role="alert" className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!error && products.length === 0 ? (
          <p className="border border-border px-4 py-10 text-center text-sm text-muted-foreground">Muy pronto publicaremos nuevos relojes.</p>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6">
          {visibleProducts.slice(0, visibleCount).map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          {visibleProducts.length > visibleCount ? (
            <button type="button" className="btn-outline" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              Ver más
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
