"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import MenuDrawer from "./MenuDrawer";

// Tres columnas fijas: el logo queda centrado y el carrito nunca se superpone en mobile.
// Los accesos viven en el menú lateral (las tres barras), igual en celular que en computadora.
const Header = ({ whatsappHref = null }: { whatsappHref?: string | null }) => {
  const { cartCount, toggleCart } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-background border-b border-border">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16 md:h-20">
          <div className="flex items-center">
            <MenuDrawer whatsappHref={whatsappHref} />
          </div>

          <Link href="/" aria-label="Time Relojería, ir al inicio" className="justify-self-center">
            <Image
              src="/brand/logo-horizontal-negativo.svg"
              alt="Time Relojería"
              width={167}
              height={48}
              priority
              unoptimized
              className="h-9 w-auto md:h-12"
            />
          </Link>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => toggleCart(true)}
              className="relative p-2 transition-opacity hover:opacity-60"
              aria-label={cartCount > 0 ? `Abrir carrito, ${cartCount} ${cartCount === 1 ? "producto" : "productos"}` : "Abrir carrito"}
            >
              <ShoppingBag className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 bg-foreground text-background text-[10px] font-display w-4 h-4 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
