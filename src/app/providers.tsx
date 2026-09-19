'use client';

import dynamic from 'next/dynamic';
import { CartProvider } from '@/contexts/CartContext';

// Las notificaciones se descargan después del primer pintado (no hay toasts antes de interactuar).
const Toaster = dynamic(() => import('@/components/ui/sonner').then((module) => module.Toaster), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      <Toaster theme="dark" position="bottom-right" />
    </CartProvider>
  );
}
