import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Envíos y cambios' };

export default function ShippingPage() {
  return (
    <LegalPage
      title="Envíos y cambios"
      updated="septiembre de 2026"
      sections={[
        {
          title: 'Envíos',
          paragraphs: [
            'Una vez registrado tu pedido, te escribimos por WhatsApp para coordinar la entrega.',
            'Ahí confirmamos si llegamos a tu zona, el costo del envío y el plazo estimado según tu dirección, antes de despachar. En Lima también puedes pagar contra entrega.',
          ],
        },
        {
          title: 'Si algo llega mal',
          paragraphs: [
            'Si el reloj llega dañado, incompleto o no corresponde a lo que pediste, escríbenos por WhatsApp apenas lo recibas con tu código de pedido y fotos: lo cambiamos o te devolvemos el dinero, sin costo para ti.',
          ],
        },
        {
          title: 'Cambios por otro motivo',
          paragraphs: [
            'Para cambiar de modelo o desistir de la compra, consúltanos por WhatsApp antes de usar el reloj. Evaluamos cada caso; el reloj debe estar sin uso y con su empaque y accesorios completos.',
          ],
        },
        {
          title: 'Garantía',
          paragraphs: [
            'Todos nuestros productos cuentan con la garantía legal de idoneidad del Código de Protección y Defensa del Consumidor: deben servir para aquello por lo que normalmente se adquieren y corresponder a lo ofrecido.',
            'Ante cualquier falla, escríbenos por WhatsApp con tu código de pedido y te indicamos cómo proceder.',
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
