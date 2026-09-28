// Correos del Libro de Reclamaciones: la copia de la hoja para el consumidor (la exige el reglamento)
// y el aviso a la tienda, que tiene un plazo legal para responder.
import { COMPLAINT_RESPONSE_DAYS } from '@/lib/legal';
import { formatPEN } from '@/lib/store';
import { definitionList, escape, heading, layout, limaDate, MUTED, subheading, type RenderedEmail } from './pieces';

export type ComplaintEmailData = {
  code: string;
  createdAt: string;
  kind: 'reclamo' | 'queja';
  consumer: { name: string; document: string; email: string; phone: string | null; address: string; isMinor: boolean; guardianName: string | null };
  item: { type: 'producto' | 'servicio'; description: string; amount: number | null; orderCode: string | null };
  detail: string;
  request: string;
};

const KIND_LABELS = {
  reclamo: 'Reclamo (disconformidad con el producto o servicio)',
  queja: 'Queja (malestar con la atención)',
} as const;

function rows(hoja: ComplaintEmailData): [string, string][] {
  return [
    ['Tipo', KIND_LABELS[hoja.kind]],
    ['Fecha', limaDate.format(new Date(hoja.createdAt))],
    ['Consumidor', hoja.consumer.name],
    ['Documento', hoja.consumer.document],
    ['Correo', hoja.consumer.email],
    ...((hoja.consumer.phone ? [['Teléfono', hoja.consumer.phone]] : []) as [string, string][]),
    ['Domicilio', hoja.consumer.address],
    ...((hoja.consumer.isMinor && hoja.consumer.guardianName ? [['Padre, madre o apoderado', hoja.consumer.guardianName]] : []) as [string, string][]),
    [hoja.item.type === 'producto' ? 'Producto' : 'Servicio', hoja.item.description],
    ...((hoja.item.amount !== null ? [['Monto reclamado', formatPEN(hoja.item.amount)]] : []) as [string, string][]),
    ...((hoja.item.orderCode ? [['Pedido', hoja.item.orderCode]] : []) as [string, string][]),
    ['Detalle', hoja.detail],
    ['Pedido del consumidor', hoja.request],
  ];
}

const textRows = (hoja: ComplaintEmailData) => rows(hoja).map(([label, value]) => `${label}: ${value}`);

export function renderComplaintEmails(hoja: ComplaintEmailData, { adminUrl }: { adminUrl: string }): { consumer: RenderedEmail; owner: RenderedEmail } {
  const esReclamo = hoja.kind === 'reclamo';
  const titulo = esReclamo ? 'reclamo' : 'queja';
  const nuevo = esReclamo ? 'Nuevo reclamo' : 'Nueva queja';
  const unTitulo = esReclamo ? 'un reclamo' : 'una queja';
  const plazo = `Responderemos a ${hoja.consumer.email} en un plazo no mayor a ${COMPLAINT_RESPONSE_DAYS} días hábiles.`;
  const aviso =
    'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.';

  const consumer: RenderedEmail = {
    subject: `Hoja de reclamación ${hoja.code} · Time Relojería`,
    html: layout(
      `Registramos tu ${titulo} con el código ${hoja.code}. ${plazo}`,
      `${heading('Recibimos tu hoja de reclamación')}
<p style="margin:0 0 16px;">Esta es la copia de lo que registraste en nuestro Libro de Reclamaciones virtual. Guárdala: el código identifica tu ${escape(titulo)}.</p>
<p style="margin:0 0 8px;font-size:28px;letter-spacing:3px;font-weight:bold;">${escape(hoja.code)}</p>
<p style="margin:0;${MUTED}font-size:13px;">${escape(plazo)}</p>
${subheading('Lo que registraste')}
${definitionList(rows(hoja))}
<p style="margin:28px 0 0;${MUTED}font-size:12px;">${escape(aviso)}</p>`
    ),
    text: [
      'Recibimos tu hoja de reclamación.',
      `Código: ${hoja.code}`,
      plazo,
      '',
      ...textRows(hoja),
      '',
      aviso,
    ].join('\n'),
  };

  const owner: RenderedEmail = {
    subject: `${nuevo} ${hoja.code} · Libro de Reclamaciones`,
    html: layout(
      `${hoja.consumer.name} registró ${unTitulo}. Hay ${COMPLAINT_RESPONSE_DAYS} días hábiles para responder.`,
      `${heading(`${escape(nuevo)} ${escape(hoja.code)}`)}
<p style="margin:0 0 16px;">Responde al consumidor dentro de los ${COMPLAINT_RESPONSE_DAYS} días hábiles que exige el reglamento. Responder este correo le escribe directo a ${escape(
        hoja.consumer.email
      )}.</p>
${definitionList(rows(hoja))}
<p style="margin:20px 0 0;${MUTED}font-size:12px;">Los reclamos quedan guardados en la base de datos de la tienda (${escape(adminUrl)}).</p>`
    ),
    text: [`${nuevo} ${hoja.code}.`, `Plazo de respuesta: ${COMPLAINT_RESPONSE_DAYS} días hábiles.`, '', ...textRows(hoja)].join('\n'),
  };

  return { consumer, owner };
}
