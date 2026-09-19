"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import type { ProductDetail } from "@/lib/catalog";
import { wasJustPurchased } from "@/lib/recent-purchases";
import { formatPEN, whatsappLink } from "@/lib/store";
import { cn } from "@/lib/utils";

const MAX_PER_ORDER = 10;
const LOW_STOCK = 3;

type Props = {
  product: Pick<ProductDetail, "id" | "slug" | "name" | "brand" | "compareAtPrice" | "variants" | "images">;
  whatsappNumber: string | null;
};

type LiveStock = { available: boolean; variants: { id: string; stock: number }[] };

export default function ProductPurchase({ product, whatsappNumber }: Props) {
  const { addItem } = useCart();
  const router = useRouter();
  const hasOptions = product.variants.length > 1;
  const [liveStock, setLiveStock] = useState<Map<string, number> | null>(null);
  const variants = liveStock ? product.variants.map((option) => ({ ...option, stock: liveStock.get(option.id) ?? 0 })) : product.variants;
  const [variantId, setVariantId] = useState(() => (product.variants.find((variant) => variant.stock > 0) ?? product.variants[0])?.id);
  const variant = variants.find((candidate) => candidate.id === variantId);

  // La ficha puede venir de la caché (ISR o volver atrás): se confirma el stock en vivo. Si el reloj se
  // agotó mientras estaba en pantalla, o lo acabas de comprar y ya no queda, se vuelve al inicio.
  useEffect(() => {
    const renderedAvailable = product.variants.some((option) => option.stock > 0);
    let active = true;
    const check = async () => {
      const response = await fetch(`/api/stock?producto=${product.id}`, { cache: "no-store" }).catch(() => null);
      if (!active || !response?.ok) return;
      const live = (await response.json()) as LiveStock;
      if (!active) return;
      if (!live.available && (renderedAvailable || wasJustPurchased(product.id))) {
        router.replace("/?aviso=agotado");
        return;
      }
      const stock = new Map(live.variants.map((option) => [option.id, option.stock]));
      setLiveStock(stock);
      setVariantId((current) => ((current && stock.get(current)) ? current : live.variants.find((option) => option.stock > 0)?.id ?? current));
    };
    void check();
    // Volver con el botón atrás puede restaurar la página completa sin re-ejecutar los efectos.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [product.id, product.variants, router]);
  const soldOut = !variant || variant.stock <= 0;
  const onSale = product.compareAtPrice !== null && variant !== undefined && product.compareAtPrice > variant.price;

  const add = () => {
    if (!variant || soldOut) return;
    addItem({
      variantId: variant.id,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      variantLabel: hasOptions ? variant.label : null,
      price: variant.price,
      imageSrc: product.images[0]?.src ?? null,
      maxQuantity: Math.min(variant.stock, MAX_PER_ORDER),
    });
  };

  const inquiry = `Hola, quiero consultar por el reloj ${[product.brand, product.name].filter(Boolean).join(" ")}${hasOptions && variant ? ` (${variant.label})` : ""}.`;

  return (
    <div className="space-y-6">
      <p className="flex items-baseline gap-3">
        <span className="text-3xl font-display tracking-wide">{variant ? formatPEN(variant.price) : ""}</span>
        {onSale ? (
          <span className="text-lg text-muted-foreground line-through">
            <span className="sr-only">Antes </span>
            {formatPEN(product.compareAtPrice!)}
          </span>
        ) : null}
      </p>

      {hasOptions ? (
        <fieldset>
          <legend className="mb-3 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">Elige una opción</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "cursor-pointer border px-4 py-2 text-sm font-display uppercase tracking-wider transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  option.id === variantId ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
                  option.stock <= 0 && "cursor-not-allowed line-through opacity-50"
                )}
              >
                <input
                  type="radio"
                  name="variante"
                  value={option.id}
                  checked={option.id === variantId}
                  disabled={option.stock <= 0}
                  onChange={() => setVariantId(option.id)}
                  className="sr-only"
                />
                {option.label}
                {option.stock <= 0 ? <span className="sr-only"> (agotado)</span> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {!soldOut && variant && variant.stock <= LOW_STOCK ? (
        <p className="text-sm text-muted-foreground">
          {variant.stock === 1 ? "Última unidad disponible" : `Últimas ${variant.stock} unidades`}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={add} disabled={soldOut} className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50">
          {soldOut ? "Agotado" : "Agregar al carrito"}
        </button>
        {whatsappNumber ? (
          <a
            href={whatsappLink(whatsappNumber, inquiry)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline flex flex-1 items-center justify-center gap-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Consultar
          </a>
        ) : null}
      </div>
    </div>
  );
}
