'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

const MESSAGES: Record<string, string> = {
  agotado: 'Ese reloj se acaba de agotar. Mira los demás modelos disponibles.',
  'no-disponible': 'Ese reloj ya no está disponible. Mira los demás modelos.',
};

// Avisos que llegan por ?aviso=… (por ejemplo, al volver a la ficha de un reloj que se agotó). Se muestran
// bajo el menú hasta cerrarlos o cambiar de página, y el parámetro se quita de la URL.
function Notice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const key = params.get('aviso');
  const [shown, setShown] = useState<{ key: string; path: string } | null>(null);
  if (key && MESSAGES[key] && (shown?.key !== key || shown.path !== pathname)) setShown({ key, path: pathname });

  useEffect(() => {
    if (!key) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('aviso');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [key]);

  if (!shown || shown.path !== pathname) return null;
  return (
    <div role="status" className="border-b border-border bg-card">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3 text-sm md:px-8">
        <p>{MESSAGES[shown.key]}</p>
        <button type="button" onClick={() => setShown(null)} className="shrink-0 p-1 text-muted-foreground hover:text-foreground" aria-label="Cerrar aviso">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function StoreNotice() {
  return (
    <Suspense fallback={null}>
      <Notice />
    </Suspense>
  );
}
