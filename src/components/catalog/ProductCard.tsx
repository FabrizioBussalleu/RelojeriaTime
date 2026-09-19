"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import type { CatalogProduct } from "@/lib/catalog";
import { formatPEN } from "@/lib/store";
import { cn } from "@/lib/utils";

const MAX_PER_ORDER = 10;

// Imagen y nombre enlazan a la ficha (el de la imagen fuera del orden de tabulación para no duplicarlo).
// La compra rápida es un botón aparte, no anidado en el enlace, y solo existe si hay una única variante con stock.
const ProductCard = ({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) => {
  const { addItem } = useCart();
  const href = `/producto/${product.slug}`;
  const soldOut = product.stock <= 0;
  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;
  const [image, hoverImage] = product.images;
  const quickAddVariant = product.variants.length === 1 && product.variants[0].stock > 0 ? product.variants[0] : null;

  return (
    <article className="group">
      <div className="product-card relative aspect-square bg-card">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          {image ? (
            <Image
              src={image.src}
              alt=""
              fill
              priority={priority}
              sizes="(min-width: 768px) 25vw, 50vw"
              className={cn("product-card-image object-cover", soldOut && "grayscale opacity-60")}
            />
          ) : null}
          {hoverImage && !soldOut ? (
            <Image
              src={hoverImage.src}
              alt=""
              fill
              sizes="(min-width: 768px) 25vw, 50vw"
              className="object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            />
          ) : null}
        </Link>

        <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2">
          {soldOut ? <span className="badge-sold-out">Agotado</span> : null}
          {onSale && !soldOut ? <span className="badge-sale">Oferta</span> : null}
        </div>

        {quickAddVariant ? (
          <button
            type="button"
            onClick={() =>
              addItem({
                variantId: quickAddVariant.id,
                productId: product.id,
                slug: product.slug,
                name: product.name,
                brand: product.brand,
                variantLabel: null,
                price: quickAddVariant.price,
                imageSrc: image?.src ?? null,
                maxQuantity: Math.min(quickAddVariant.stock, MAX_PER_ORDER),
              })
            }
            aria-label={`Agregar ${product.name} al carrito`}
            className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2 bg-foreground py-3 text-background font-display uppercase text-xs tracking-[0.15em]
                       opacity-0 translate-y-2 transition-all duration-300 hover:bg-foreground/90
                       group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0
                       [@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            Agregar
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-1">
        {product.brand ? (
          <p className="text-[0.7rem] font-body uppercase tracking-[0.2em] text-muted-foreground">{product.brand}</p>
        ) : null}
        <h3 className="font-display text-sm tracking-wider">
          <Link href={href} className={cn("hover:underline underline-offset-4", soldOut && "text-muted-foreground")}>
            {product.name}
            {soldOut ? <span className="sr-only"> (agotado)</span> : null}
          </Link>
        </h3>
        <p className="flex items-center gap-2 text-sm font-body">
          <span className={soldOut ? "text-muted-foreground" : undefined}>{formatPEN(product.price)}</span>
          {onSale ? (
            <span className="text-muted-foreground line-through">
              <span className="sr-only">Antes </span>
              {formatPEN(product.compareAtPrice!)}
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
};

export default ProductCard;
