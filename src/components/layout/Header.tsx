"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

const NAV_LINKS = [
  { href: "/#catalogo", label: "Relojes" },
  { href: "/seguimiento", label: "Seguimiento" },
];

// Tres columnas fijas: el logo queda centrado y el carrito nunca se superpone en mobile.
const Header = () => {
  const { cartCount, toggleCart } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-background border-b border-border">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16 md:h-20">
          <nav aria-label="Principal" className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hidden md:inline text-xs font-display uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

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
