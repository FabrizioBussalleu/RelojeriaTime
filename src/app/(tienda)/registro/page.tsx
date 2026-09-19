import type { Metadata } from 'next';
import { RegistrationForm } from '@/components/crm/RegistrationForm';
import { getCatalog, getStoreSettings } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Recibe novedades',
  description: 'Regístrate y recibe por WhatsApp los relojes nuevos y promociones de Time Relojería.',
  alternates: { canonical: '/registro' },
};

export const revalidate = 300;

export default async function RegistrationPage() {
  // Sin base disponible (build sin credenciales o caída) el formulario igual funciona, sin marcas sugeridas.
  const [catalog, settings] = await Promise.all([getCatalog().catch(() => []), getStoreSettings().catch(() => null)]);
  const brands = [...new Set(catalog.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)))].sort((a, b) => a.localeCompare(b, 'es'));

  return (
    <div className="container mx-auto max-w-2xl space-y-10 px-4 py-10 md:py-14">
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-display md:text-4xl">Recibe novedades</h1>
        <p className="text-sm text-muted-foreground">
          Te avisamos por WhatsApp cuando lleguen relojes de las marcas y estilos que te interesan. Sin spam: puedes darte de baja cuando quieras.
        </p>
      </header>
      <RegistrationForm brands={brands} whatsappNumber={settings?.whatsappNumber ?? null} />
    </div>
  );
}
