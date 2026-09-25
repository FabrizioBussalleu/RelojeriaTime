"use client";

import { useState } from "react";
import Image from "next/image";
import type { CatalogImage } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const SIZES = "(min-width: 768px) 50vw, 100vw";

export default function ProductGallery({ images, soldOut }: { images: CatalogImage[]; soldOut: boolean }) {
  const [active, setActive] = useState(0);
  // Las demás fotos se piden recién cuando la principal terminó de cargar: así no le compiten el ancho
  // de banda, y para cuando el cliente toca una miniatura ya están listas (el cambio es instantáneo).
  const [precargar, setPrecargar] = useState(false);
  const current = images[active] ?? images[0];

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden bg-card">
        {current ? (
          images.map((image, index) =>
            index === 0 || index === active || precargar ? (
              <Image
                key={image.src}
                src={image.src}
                alt={index === active ? image.alt : ""}
                fill
                priority={index === 0}
                sizes={SIZES}
                onLoad={index === 0 ? () => setPrecargar(true) : undefined}
                className={cn("object-cover transition-opacity duration-300", index === active ? "opacity-100" : "opacity-0", soldOut && "grayscale")}
              />
            ) : null
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin imagen</div>
        )}
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-3 overflow-x-auto" aria-label="Imágenes del producto">
          {images.map((image, index) => (
            <li key={image.src}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Ver imagen ${index + 1} de ${images.length}`}
                aria-current={index === active}
                className={cn(
                  "relative block h-20 w-20 overflow-hidden border transition-opacity",
                  index === active ? "border-foreground" : "border-border opacity-60 hover:opacity-100"
                )}
              >
                <Image src={image.src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
