'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Bot, FileText, LayoutDashboard, LayoutGrid, LogOut, Menu, MessageCircle, Package, Receipt, Send, Settings, Users, X } from 'lucide-react';
import { signOut } from '@/app/admin/actions';
import { cn } from '@/lib/utils';

type NavLink = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; badge?: 'orders' | 'attention' };

// Lo esencial de la tienda primero; WhatsApp y clientes (CRM) al final.
const GROUPS: { title: string | null; links: NavLink[] }[] = [
  {
    title: null,
    links: [
      { href: '/admin', label: 'Resumen', icon: LayoutDashboard, exact: true },
      { href: '/admin/productos', label: 'Productos', icon: Package },
      { href: '/admin/pedidos', label: 'Pedidos', icon: Receipt, badge: 'orders' },
      { href: '/admin/organizador', label: 'Organizador', icon: LayoutGrid },
      { href: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3 },
      { href: '/admin/ajustes', label: 'Ajustes', icon: Settings },
    ],
  },
  {
    title: 'WhatsApp y clientes',
    links: [
      { href: '/admin/conversaciones', label: 'Conversaciones', icon: MessageCircle, badge: 'attention' },
      { href: '/admin/clientes', label: 'Clientes', icon: Users },
      { href: '/admin/campanas', label: 'Campañas', icon: Send },
      { href: '/admin/plantillas', label: 'Plantillas', icon: FileText },
      { href: '/admin/asistente', label: 'Asistente IA', icon: Bot },
    ],
  },
];

export function AdminNav({ email, attention, pendingOrders }: { email: string | null; attention: number; pendingOrders: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // El logo lleva al resumen; estando ya en el resumen, lleva a la tienda.
  const logo = pathname === '/admin' ? { href: '/', label: 'Ver la tienda' } : { href: '/admin', label: 'Ir al resumen' };

  const badges = { orders: { count: pendingOrders, label: 'pedidos por confirmar pago' }, attention: { count: attention, label: 'requieren atención' } };
  const nav = (
    <nav aria-label="Panel" className="flex flex-1 flex-col gap-1">
      {GROUPS.map((group) => (
        <div key={group.title ?? 'tienda'} className={cn('flex flex-col gap-1', group.title && 'mt-5 border-t border-border pt-4')}>
          {group.title ? <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{group.title}</p> : null}
          {group.links.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{link.label}</span>
                {link.badge && badges[link.badge].count > 0 ? (
                  <span className={cn('min-w-6 px-1.5 text-center text-xs font-semibold', active ? 'bg-background text-foreground' : 'bg-amber-400 text-black')}>
                    {badges[link.badge].count}
                    <span className="sr-only"> {badges[link.badge].label}</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-6 space-y-3 border-t border-border pt-4 text-xs text-muted-foreground">
      <p className="truncate" title={email ?? undefined}>
        {email}
      </p>
      <div className="flex items-center justify-between">
        <Link href="/" className="hover:text-foreground">
          Ver tienda
        </Link>
        <form action={signOut}>
          <button type="submit" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Salir
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
        <Link href={logo.href} onClick={() => setOpen(false)} aria-label={`Time Relojería: ${logo.label.toLowerCase()}`} title={logo.label}>
          <Image src="/brand/logo-horizontal-negativo.svg" alt="Time Relojería" width={110} height={32} unoptimized className="h-7 w-auto" />
        </Link>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="admin-menu" className="relative p-2">
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
          {!open && attention + pendingOrders > 0 ? <span className="absolute right-1 top-1 h-2 w-2 bg-amber-400" aria-hidden /> : null}
        </button>
      </div>
      {open ? (
        <div id="admin-menu" className="fixed inset-x-0 bottom-0 top-[57px] z-20 flex flex-col overflow-y-auto bg-background p-4 lg:hidden">
          {nav}
          {footer}
        </div>
      ) : null}
      <aside aria-label="Menú del panel" className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border p-4 lg:flex">
        <Link href={logo.href} className="mb-8 block px-3 pt-2" aria-label={`Time Relojería: ${logo.label.toLowerCase()}`} title={logo.label}>
          <Image src="/brand/logo-horizontal-negativo.svg" alt="Time Relojería" width={140} height={40} unoptimized className="h-9 w-auto" />
        </Link>
        {nav}
        {footer}
      </aside>
    </>
  );
}
