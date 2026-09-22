"use client";

import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import { formatPEN } from "@/lib/store";
import { cn } from "@/lib/utils";

// Imagen y nombre enlazan a la ficha (el de la imagen fuera del orden de tabulación para no duplicarlo).
// Sin atajo de "agregar" sobre la foto: la tarjeta solo muestra el reloj y lleva a su ficha.
const ProductCard = ({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) => {
  const href = `/producto/${product.slug}`;
  const soldOut = product.stock <= 0;
  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;
  const [image, hoverImage] = product.images;

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
