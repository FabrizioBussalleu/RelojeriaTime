import { BrandIcon } from '@/components/icons/BrandIcon';
import { whatsappLink } from '@/lib/store';

// Botón fijo a la derecha en toda la tienda. Queda debajo del carrito abierto (z-50).
export default function WhatsAppFloat({ number }: { number: string }) {
  return (
    <aside aria-label="Contacto por WhatsApp">
      <a
        href={whatsappLink(number, 'Hola, tengo una consulta sobre los relojes de Time.')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escríbenos por WhatsApp"
        title="Escríbenos por WhatsApp"
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:right-6"
      >
        <BrandIcon brand="whatsapp" className="h-7 w-7" />
      </a>
    </aside>
  );
}
