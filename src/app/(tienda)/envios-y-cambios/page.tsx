import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Envíos y cambios' };

// Borrador: las condiciones comerciales (XXXXXXXXXXX) las define la tienda.
export default function ShippingPage() {
  return (
    <LegalPage
      title="Envíos y cambios"
      updated="septiembre de 2026"
      sections={[
        {
          title: 'Envíos',
          paragraphs: [
            'Una vez confirmado tu pago, te escribimos por WhatsApp para coordinar la entrega.',
            'Cobertura: XXXXXXXXXXX. Costos: XXXXXXXXXXX. Plazos estimados: XXXXXXXXXXX.',
          ],
        },
        {
          title: 'Cambios y devoluciones',
          paragraphs: ['Plazo y condiciones para solicitar un cambio o una devolución: XXXXXXXXXXX.'],
        },
        {
          title: 'Garantía',
          paragraphs: [
            'Todos nuestros productos cuentan con la garantía legal de idoneidad del Código de Protección y Defensa del Consumidor. Garantía comercial adicional: XXXXXXXXXXX.',
          ],
        },
        {
          title: '¿Tienes un problema con tu pedido?',
          paragraphs: ['Escríbenos por WhatsApp con tu código de pedido. También puedes registrar un reclamo en el Libro de Reclamaciones.'],
        },
      ]}
    />
  );
}
