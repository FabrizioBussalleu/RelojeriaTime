import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { BUSINESS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Envíos y cambios',
  description: 'Envíos a todo el Perú por Olva Courier, cambios dentro de 3 días y un año de garantía contra defectos de fabricación.',
};

export default function ShippingPage() {
  return (
    <LegalPage
      title="Envíos y cambios"
      updated="setiembre de 2026"
      sections={[
        {
          title: 'Envíos',
          paragraphs: [
            'Enviamos a todo el Perú por Olva Courier.',
            'Despachamos el mismo día en que confirmamos tu pago. Si el pago entra fuera del horario de despacho o se presenta algún imprevisto, tu pedido sale al día siguiente.',
            'Todos los envíos viajan con el valor total del producto declarado, para mayor seguridad durante el traslado.',
            'Apenas registramos tu pedido te escribimos por WhatsApp para confirmar la dirección y coordinar la entrega.',
          ],
        },
        {
          title: 'Cambios y devoluciones',
          paragraphs: [
            'Aceptamos cambios dentro de un plazo máximo de 3 días desde que recibes el reloj.',
            'Para solicitar un cambio, el reloj debe estar completamente nuevo, sin uso y en las mismas condiciones en que te lo entregamos, conservando todos sus plásticos, stickers, etiquetas y elementos de protección originales.',
            'No aceptamos cambios ni devoluciones si el reloj fue usado o manipulado, o si se retiraron los stickers, plásticos o elementos que acreditan su condición de nuevo.',
          ],
        },
        {
          title: 'Garantía',
          paragraphs: [
            'Todos nuestros relojes cuentan con un año de garantía contra defectos de fabricación.',
            'Si aparece una falla cubierta por la garantía, te cambiamos el reloj por uno nuevo sin la falla. Si ese modelo ya no está disponible y no deseas esperar la reparación o la solución que podamos darte en el menor tiempo posible, te devolvemos el total de tu dinero.',
            'Además, todos nuestros productos cuentan con la garantía legal de idoneidad del Código de Protección y Defensa del Consumidor. Si el reloj llega dañado o no corresponde a lo que pediste, escríbenos apenas lo recibas con fotos: eso lo resolvemos aunque no se trate de un cambio.',
          ],
        },
        {
          title: '¿Tienes un problema con tu pedido?',
          paragraphs: ['Escríbenos por WhatsApp con tu código de pedido. También puedes registrar un reclamo en el Libro de Reclamaciones.'],
        },
        {
          title: 'Quién vende',
          paragraphs: [`${BUSINESS.tradeName} es operada por ${BUSINESS.legalName}, con RUC ${BUSINESS.ruc} y domicilio en ${BUSINESS.address}.`],
        },
      ]}
    />
  );
}
