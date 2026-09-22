import Link from 'next/link';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { whatsappLink } from '@/lib/store';

// Ficha de un reloj que solo se vende al por mayor: sin precio ni carrito, con el camino a la cotización.
export function WholesaleNotice({ productName, whatsappNumber }: { productName: string; whatsappNumber: string | null }) {
  return (
    <div className="space-y-5 border border-border p-6">
      <p className="text-xs font-display uppercase tracking-[0.2em] text-muted-foreground">Venta al por mayor</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Este modelo se vende únicamente por volumen. Dinos cuántas unidades necesitas y te enviamos el precio por mayor y los plazos de entrega.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/por-mayor" className="btn-primary flex-1 text-center">
          Armar mi cotización
        </Link>
        {whatsappNumber ? (
          <a
            href={whatsappLink(whatsappNumber, `Hola, quiero una cotización al por mayor del reloj ${productName}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline flex flex-1 items-center justify-center gap-2"
          >
            <BrandIcon brand="whatsapp" className="h-4 w-4" />
            Consultar
          </a>
        ) : null}
      </div>
    </div>
  );
}
