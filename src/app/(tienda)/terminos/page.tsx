import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { BUSINESS, COMPLAINT_RESPONSE_DAYS } from '@/lib/legal';

export const metadata: Metadata = { title: 'Términos y condiciones' };

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
            'Al confirmar tu pedido recibirás un código y los datos para pagar por Yape, Plin o transferencia bancaria. También puedes coordinar el pago contra entrega por WhatsApp. El pedido se considera confirmado cuando verificamos el pago o acordamos la entrega.',
            'Reservamos el stock de tu pedido por 48 horas. Si en ese plazo no recibimos el pago ni tenemos noticias tuyas, el pedido se cancela automáticamente y las unidades vuelven a la tienda.',
          ],
        },
        {
          title: 'Comprobante de pago',
          paragraphs: ['Por cada compra emitimos boleta de venta electrónica a nombre del comprador.'],
        },
        {
          title: 'Entrega',
          paragraphs: [
            'Enviamos a todo el Perú por Olva Courier, con el valor total del producto declarado. Despachamos el mismo día en que confirmamos el pago; si el pago entra fuera del horario de despacho o se presenta un imprevisto, el pedido sale al día siguiente. La dirección y la entrega se coordinan contigo por WhatsApp.',
          ],
        },
        {
          title: 'Cambios, devoluciones y garantía',
          paragraphs: [
            'Aceptamos cambios dentro de los 3 días de recibido el reloj, siempre que esté sin uso y conserve sus plásticos, stickers, etiquetas y elementos de protección originales.',
            'Todos los relojes tienen un año de garantía contra defectos de fabricación: cambiamos el reloj por uno nuevo sin la falla y, si el modelo no está disponible y no deseas esperar una solución, devolvemos el total del dinero. El detalle está en la página de Envíos y cambios.',
          ],
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
