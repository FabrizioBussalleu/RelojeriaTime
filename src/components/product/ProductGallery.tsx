"use client";

import { useState } from "react";
import Image from "next/image";
import type { CatalogImage } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export default function ProductGallery({ images, soldOut }: { images: CatalogImage[]; soldOut: boolean }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden bg-card">
        {current ? (
          <Image
            src={current.src}
            alt={current.alt}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className={cn("object-cover", soldOut && "grayscale")}
          />
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
