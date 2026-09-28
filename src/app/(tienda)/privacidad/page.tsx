import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { BUSINESS } from '@/lib/legal';

export const metadata: Metadata = { title: 'Política de privacidad' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      updated="septiembre de 2026"
      intro={`En ${BUSINESS.tradeName} tratamos tus datos personales conforme a la Ley 29733, Ley de Protección de Datos Personales, y su reglamento.`}
      sections={[
        {
          title: 'Responsable del tratamiento',
          paragraphs: [`${BUSINESS.legalName}, con RUC ${BUSINESS.ruc} y domicilio en ${BUSINESS.address}.`],
        },
        {
          title: 'Datos que recopilamos',
          paragraphs: [
            'Al comprar: nombre, correo, celular, dirección de entrega y, de forma opcional, tu DNI o CE. Al registrar un reclamo: los datos que exige el Libro de Reclamaciones.',
            'Al registrarte para recibir novedades o escribirnos por WhatsApp: tu nombre, tu número, el nombre de tu perfil de WhatsApp, los mensajes que intercambiamos y los intereses que nos indiques.',
            'No almacenamos datos de tarjetas: los pagos se realizan por Yape o transferencia fuera de este sitio.',
          ],
        },
        {
          title: 'Para qué los usamos',
          paragraphs: [
            'Para registrar y entregar tus pedidos, comunicarnos contigo sobre ellos, atender reclamos y cumplir obligaciones legales. No vendemos ni cedemos tus datos a terceros con fines comerciales.',
            'Para responder tus consultas por WhatsApp y mostrarte los relojes disponibles. Guardamos el historial de compras y conversaciones para atenderte mejor.',
          ],
        },
        {
          title: 'Novedades y promociones por WhatsApp',
          paragraphs: [
            'Solo te enviamos novedades y promociones si lo autorizaste (al registrarte, al comprar marcando la casilla o respondiéndonos ALTA). Puedes retirar tu autorización en cualquier momento respondiendo BAJA: seguiremos atendiéndote si nos escribes.',
          ],
        },
        {
          title: 'Asistente automático',
          paragraphs: [
            'Las consultas por WhatsApp las responde primero un asistente automático basado en inteligencia artificial, que usa el catálogo y el stock reales de la tienda. Cuando quieres comprar, pagar, reclamar o lo pides, te atiende una persona del equipo.',
          ],
        },
        {
          title: 'Proveedores que intervienen',
          paragraphs: [
            'Usamos servicios de alojamiento web y base de datos (Vercel y Supabase), de gestión de imágenes (Cloudinary), de mensajería (WhatsApp Business de Meta y, de ser el caso, su proveedor autorizado) y de inteligencia artificial (Anthropic, para el asistente automático), que procesan información por nuestra cuenta. Algunos de estos proveedores están fuera del Perú.',
          ],
        },
        {
          title: 'Conservación',
          paragraphs: [
            'Conservamos tus datos mientras dure la relación comercial y, después, durante los plazos que exige la ley: cinco años los comprobantes y registros con efecto tributario, y dos años los reclamos del Libro de Reclamaciones. Los datos que solo usamos para enviarte novedades se eliminan cuando te das de baja.',
          ],
        },
        {
          title: 'Tus derechos',
          paragraphs: [
            `Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiéndonos por WhatsApp, a ${BUSINESS.email} o a nuestro domicilio en ${BUSINESS.address}. Responderemos en los plazos de la Ley 29733. Si consideras que no atendimos tu solicitud, puedes acudir a la Autoridad Nacional de Protección de Datos Personales.`,
          ],
        },
        {
          title: 'Almacenamiento en tu navegador',
          paragraphs: ['Guardamos tu carrito en el almacenamiento local de tu navegador para que no se pierda al recargar. No usamos cookies de publicidad ni de seguimiento.'],
        },
      ]}
    />
  );
}
