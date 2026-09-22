'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Organizer, type OrganizerProduct } from './Organizer';

// Dos órdenes en la misma pantalla: el de la tienda y el de "Compras al por mayor". Las dos listas
// quedan montadas (solo se oculta una) para no perder cambios sin guardar al cambiar de pestaña.
export function OrganizerTabs({
  tienda,
  porMayor,
  soldOutLast,
}: {
  tienda: OrganizerProduct[];
  porMayor: OrganizerProduct[];
  soldOutLast: boolean;
}) {
  const [tab, setTab] = useState<'tienda' | 'por_mayor'>('tienda');
  const pestañas = [
    { key: 'tienda' as const, label: 'Tienda', count: tienda.filter((product) => product.status === 'active' && !product.wholesaleOnly).length },
    { key: 'por_mayor' as const, label: 'Al por mayor', count: porMayor.filter((product) => product.status === 'active').length },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Qué orden estás acomodando" className="flex flex-wrap gap-2">
        {pestañas.map((pestaña) => (
          <button
            key={pestaña.key}
            type="button"
            role="tab"
            id={`tab-${pestaña.key}`}
            aria-selected={tab === pestaña.key}
            aria-controls={`panel-${pestaña.key}`}
            onClick={() => setTab(pestaña.key)}
            className={cn(
              'border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors',
              tab === pestaña.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {pestaña.label} <span className={cn('tabular-nums', tab === pestaña.key && 'opacity-70')}>{pestaña.count}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-tienda" aria-labelledby="tab-tienda" hidden={tab !== 'tienda'}>
        <Organizer products={tienda} soldOutLast={soldOutLast} />
      </div>
      <div role="tabpanel" id="panel-por_mayor" aria-labelledby="tab-por_mayor" hidden={tab !== 'por_mayor'}>
        <p className="mb-4 text-sm text-muted-foreground">
          Este es el orden de la página “Compras al por mayor”: incluye los relojes de la tienda y los marcados como{' '}
          <strong className="text-foreground">solo al por mayor</strong>. Ahí no se muestran precios ni stock.
        </p>
        <Organizer products={porMayor} soldOutLast={false} scope="por_mayor" />
      </div>
    </div>
  );
}
