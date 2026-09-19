import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { BUSINESS, COMPLAINT_RESPONSE_DAYS } from '@/lib/legal';

export const metadata: Metadata = { title: 'Términos y condiciones' };

// Borrador: revisar con asesoría legal y completar los datos XXXXXXXXXXX antes de publicar.
export default function TermsPage() {
  return (
    <LegalPage
      title="Términos y condiciones"
      updated="septiembre de 2026"
      intro={`Estos términos regulan las compras realizadas en la tienda online de ${BUSINESS.tradeName}. Al confirmar un pedido declaras haberlos leído y aceptado.`}
      sections={[
        {
          title: 'Identificación del proveedor',
          paragraphs: [`${BUSINESS.tradeName} es operada por ${BUSINESS.legalName}, con RUC ${BUSINESS.ruc} y domicilio en ${BUSINESS.address}.`],
        },
        {
          title: 'Productos y precios',
          paragraphs: [
            'Los precios se expresan en soles (S/). Las imágenes son referenciales; las características de cada reloj se detallan en su ficha.',
            'La disponibilidad está sujeta a stock. Si un producto se agota mientras completas tu compra, te lo indicaremos antes de registrar el pedido.',
          ],
        },
        {
          title: 'Proceso de compra y pago',
          paragraphs: [
            'Al confirmar tu pedido recibirás un código y los datos para pagar por Yape o transferencia bancaria. El pedido se considera confirmado cuando verificamos el pago.',
            'Reservamos el stock de tu pedido por 48 horas. Si en ese plazo no recibimos el pago, el pedido se cancela automáticamente.',
          ],
        },
        {
          title: 'Entrega',
          paragraphs: ['Coordinamos la entrega por WhatsApp una vez confirmado el pago. Plazos y costos de envío: XXXXXXXXXXX.'],
        },
        {
          title: 'Cambios, devoluciones y garantía',
          paragraphs: ['Las condiciones de cambios, devoluciones y garantía se detallan en la página de Envíos y cambios.'],
        },
        {
          title: 'Reclamos',
          paragraphs: [
            `Puedes registrar un reclamo o una queja en nuestro Libro de Reclamaciones virtual. Responderemos en un plazo no mayor a ${COMPLAINT_RESPONSE_DAYS} días hábiles.`,
          ],
        },
        {
          title: 'Legislación aplicable',
          paragraphs: ['Estos términos se rigen por las leyes de la República del Perú, en particular el Código de Protección y Defensa del Consumidor (Ley 29571).'],
        },
      ]}
    />
  );
}
