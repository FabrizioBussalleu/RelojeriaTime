// Piezas comunes de los correos (HTML simple con estilos en línea, como exigen los clientes de correo).
// Todo lo que escribe una persona se escapa: llega desde formularios públicos.
import { BUSINESS } from '@/lib/legal';

export type RenderedEmail = { subject: string; html: string; text: string };

export const FONT = 'font-family:Arial,Helvetica,sans-serif;';
export const MUTED = 'color:#555555;';

export const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const limaDate = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' });

// Identificación del proveedor al pie de cada correo (quién vende, con su RUC y domicilio).
export const sellerLine = () => `${BUSINESS.tradeName} · ${BUSINESS.legalName} · RUC ${BUSINESS.ruc} · ${BUSINESS.address}`;

export function layout(preheader: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Time Relojería</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;">
<tr><td style="background:#000000;padding:20px 28px;${FONT}color:#ffffff;font-size:20px;letter-spacing:8px;font-weight:bold;">TIME<span style="display:block;font-size:10px;letter-spacing:4px;font-weight:normal;color:#bbbbbb;margin-top:2px;">RELOJERÍA</span></td></tr>
<tr><td style="padding:28px;${FONT}color:#111111;font-size:15px;line-height:1.5;">${body}</td></tr>
<tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #e5e5e5;${FONT}${MUTED}font-size:11px;line-height:1.6;">${escape(sellerLine())}</td></tr>
</table></td></tr></table></body></html>`;
}

export const heading = (text: string) => `<h1 style="margin:0 0 12px;${FONT}font-size:22px;color:#000000;">${text}</h1>`;

export const subheading = (text: string) =>
  `<h2 style="margin:28px 0 10px;${FONT}font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#000000;">${text}</h2>`;

export const button = (href: string, label: string, primary = true) =>
  `<a href="${escape(href)}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;${FONT}font-size:13px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;${
    primary ? 'background:#000000;color:#ffffff;border:1px solid #000000;' : 'background:#ffffff;color:#000000;border:1px solid #000000;'
  }">${escape(label)}</a>`;

// Lista de "campo: valor" para las hojas de reclamación y otros correos con datos.
export const definitionList = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${FONT}font-size:14px;">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eeeeee;${MUTED}width:40%;vertical-align:top;">${escape(label)}</td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #eeeeee;vertical-align:top;">${escape(value).replace(/\n/g, '<br>')}</td></tr>`
    )
    .join('')}</table>`;
