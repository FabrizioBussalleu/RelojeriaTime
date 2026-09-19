"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useCart } from "@/contexts/CartContext";

// El panel del carrito (Radix Dialog) se descarga recién la primera vez que se abre: así no pesa
// en la carga inicial de cada página.
const CartDrawer = dynamic(() => import("./CartDrawer"), { ssr: false });

export default function CartDrawerLoader() {
  const { isOpen } = useCart();
  const [opened, setOpened] = useState(false);
  if (isOpen && !opened) setOpened(true);
  return opened ? <CartDrawer /> : null;
}
