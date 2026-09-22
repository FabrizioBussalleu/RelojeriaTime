"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ACCESOS = [
  { href: "/#catalogo", label: "Relojes" },
  { href: "/seguimiento", label: "Seguimiento de pedido" },
  { href: "/registro", label: "Recibe novedades" },
  { href: "/por-mayor", label: "Compras al por mayor" },
];

const AYUDA = [
  { href: "/envios-y-cambios", label: "Envíos y cambios" },
  { href: "/terminos", label: "Términos y condiciones" },
  { href: "/privacidad", label: "Política de privacidad" },
];

// Las tres barras se convierten en X: la de arriba y la de abajo giran hasta cruzarse y la del medio
// se desvanece. Con "reducir movimiento" el cambio es instantáneo.
function MenuIcon({ open }: { open: boolean }) {
  const barra = "absolute left-0 h-px w-full bg-current transition-transform duration-300 ease-out motion-reduce:transition-none";
  return (
    <span className="relative block h-3.5 w-6" aria-hidden="true">
      <span className={cn(barra, "top-0", open && "translate-y-[6.5px] rotate-45")} />
      <span className={cn("absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current transition-opacity duration-200 motion-reduce:transition-none", open && "opacity-0")} />
      <span className={cn(barra, "bottom-0", open && "-translate-y-[6.5px] -rotate-45")} />
    </span>
  );
}

const MenuDrawer = ({ whatsappHref }: { whatsappHref: string | null }) => {
  const [open, setOpen] = useState(false);
  const enlace = "block py-3 font-display uppercase tracking-[0.2em] text-foreground transition-opacity hover:opacity-60 focus-visible:opacity-60";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="-ml-2 flex items-center gap-3 p-2 text-foreground transition-opacity hover:opacity-60"
        aria-label="Abrir menú"
      >
        <MenuIcon open={false} />
        <span className="hidden text-xs font-display uppercase tracking-[0.2em] text-muted-foreground sm:inline">Menú</span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex h-full w-full max-w-xs flex-col border-r border-border bg-background focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Menú de la tienda</Dialog.Title>

          <div className="flex h-16 items-center justify-between border-b border-border px-4 md:h-20 md:px-6">
            <Dialog.Close className="-ml-2 flex items-center gap-3 p-2 text-foreground transition-opacity hover:opacity-60" aria-label="Cerrar menú">
              <MenuIcon open />
              <span className="hidden text-xs font-display uppercase tracking-[0.2em] text-muted-foreground sm:inline">Cerrar</span>
            </Dialog.Close>
            <Image src="/brand/isotipo.svg" alt="" width={120} height={107} unoptimized className="h-7 w-auto opacity-80" />
          </div>

          <nav aria-label="Menú" className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <ul className="text-sm">
              {ACCESOS.map((item, index) => (
                <li key={item.href} className="border-b border-border/60">
                  <Dialog.Close asChild>
                    <Link href={item.href} className={cn(enlace, "motion-safe:animate-fade-in")} style={{ animationDelay: `${60 + index * 50}ms` }}>
                      {item.label}
                    </Link>
                  </Dialog.Close>
                </li>
              ))}
            </ul>

            <p className="mb-2 mt-8 text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Ayuda</p>
            <ul className="text-xs">
              {AYUDA.map((item) => (
                <li key={item.href}>
                  <Dialog.Close asChild>
                    <Link href={item.href} className="block py-2 font-body text-muted-foreground transition-colors hover:text-foreground">
                      {item.label}
                    </Link>
                  </Dialog.Close>
                </li>
              ))}
            </ul>
          </nav>

          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="border-t border-border px-4 py-4 text-center text-xs font-display uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground md:px-6"
            >
              Escríbenos por WhatsApp
            </a>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default MenuDrawer;
