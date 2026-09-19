"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { formatPEN } from "@/lib/store";

// Panel lateral accesible (foco atrapado, Escape, lector de pantalla) sobre Radix Dialog.
const CartDrawer = () => {
  const { items, isOpen, toggleCart, updateQuantity, removeItem, subtotal, cartCount } = useCart();
  const router = useRouter();

  const goToCheckout = () => {
    toggleCart(false);
    router.push("/checkout");
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={toggleCart}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-border">
            <Dialog.Title className="text-lg font-display uppercase tracking-wider">Tu carrito ({cartCount})</Dialog.Title>
            <Dialog.Close className="p-1 hover:opacity-60 transition-opacity" aria-label="Cerrar carrito">
              <X className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
            </Dialog.Close>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <ShoppingBag className="w-12 h-12 text-muted-foreground mb-4" strokeWidth={1} aria-hidden="true" />
              <p className="font-display uppercase tracking-wider text-lg">Tu carrito está vacío</p>
              <p className="mt-2 text-sm text-muted-foreground">Explora el catálogo y elige tu próximo reloj.</p>
              <Dialog.Close asChild>
                <Link href="/#catalogo" className="btn-outline mt-6">
                  Ver relojes
                </Link>
              </Dialog.Close>
            </div>
          ) : (
            <>
              <ul className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {items.map((item) => (
                  <li key={item.variantId} className="flex gap-4">
                    <Link
                      href={`/producto/${item.slug}`}
                      onClick={() => toggleCart(false)}
                      className="relative h-24 w-24 flex-shrink-0 overflow-hidden bg-card"
                    >
                      {item.imageSrc ? (
                        <Image src={item.imageSrc} alt={item.name} fill sizes="96px" className="object-cover" />
                      ) : null}
                    </Link>
                    <div className="flex flex-1 flex-col">
                      {item.brand ? (
                        <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">{item.brand}</p>
                      ) : null}
                      <p className="font-display text-sm uppercase tracking-wider">{item.name}</p>
                      {item.variantLabel ? <p className="text-xs text-muted-foreground">{item.variantLabel}</p> : null}
                      <p className="mt-1 text-sm">{formatPEN(item.price)}</p>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="flex items-center border border-border">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                            className="p-2 hover:bg-secondary transition-colors"
                            aria-label={`Quitar una unidad de ${item.name}`}
                          >
                            <Minus className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <span className="w-8 text-center text-sm" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                            disabled={item.quantity >= item.maxQuantity}
                            className="p-2 hover:bg-secondary transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                            aria-label={`Agregar una unidad de ${item.name}`}
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          className="text-xs font-display uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="p-4 md:p-6 border-t border-border space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-display uppercase tracking-wider">Subtotal</span>
                  <span className="font-display tracking-wider">{formatPEN(subtotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  El envío se coordina por WhatsApp al confirmar tu pedido.
                </p>
                <button type="button" className="w-full btn-primary" onClick={goToCheckout}>
                  Finalizar compra
                </button>
                <Dialog.Close className="w-full btn-ghost text-center">Seguir comprando</Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CartDrawer;
