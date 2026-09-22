import AnnouncementBar from '@/components/layout/AnnouncementBar';
import CartDrawerLoader from '@/components/layout/CartDrawerLoader';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import StoreNotice from '@/components/layout/StoreNotice';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { getStoreSettings, type StoreSettings } from '@/lib/catalog';
import { formatPhone, whatsappLink } from '@/lib/store';

async function loadSettings(): Promise<StoreSettings | null> {
  try {
    return await getStoreSettings();
  } catch (error) {
    console.error('No se pudieron cargar los ajustes de la tienda', error);
    return null;
  }
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await loadSettings();
  const payments = [settings?.yapeNumber ? 'Yape' : null, settings?.plinNumber ? 'Plin' : null, 'transferencia'].filter(Boolean);
  const messages = [
    `Paga con ${payments.join(', ').replace(/, ([^,]*)$/, ' o $1')}`,
    settings?.whatsappNumber ? `Atención por WhatsApp: ${formatPhone(settings.whatsappNumber)}` : null,
    'Pago contra entrega disponible',
    'Sigue tu pedido en línea',
  ].filter((message): message is string => Boolean(message));

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Saltar al contenido
      </a>
      <AnnouncementBar messages={messages} />
      <Header whatsappHref={settings?.whatsappNumber ? whatsappLink(settings.whatsappNumber, 'Hola, tengo una consulta sobre los relojes de Time.') : null} />
      <StoreNotice />
      <main id="contenido">{children}</main>
      <Footer whatsappNumber={settings?.whatsappNumber ?? null} contactEmail={settings?.contactEmail ?? null} socialLinks={settings?.socialLinks ?? []} />
      <CartDrawerLoader />
      {settings?.whatsappNumber ? <WhatsAppFloat number={settings.whatsappNumber} /> : null}
    </>
  );
}
