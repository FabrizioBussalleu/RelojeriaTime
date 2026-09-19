// Plantillas editables desde el panel. El equipo escribe {{nombre}}; para WhatsApp se traduce
// a parámetros posicionales ({{1}}) que exige la API de plantillas.
export const TEMPLATE_VARIABLES = {
  nombre: 'Nombre del cliente (solo el primer nombre)',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function templateVariables(body: string): string[] {
  return [...body.matchAll(VARIABLE_PATTERN)].map((match) => match[1]);
}

export function unknownVariables(body: string): string[] {
  return templateVariables(body).filter((name) => !(name in TEMPLATE_VARIABLES));
}

export function firstName(name: string | null | undefined) {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

// Si falta el nombre se quita la variable sin dejar ", ," ni espacios dobles: "Hola {{nombre}}," → "Hola,".
export function renderTemplate(body: string, values: Partial<Record<TemplateVariable, string | null>>) {
  return body
    .replace(VARIABLE_PATTERN, (_match, name: string) => (values[name as TemplateVariable] ?? '').trim())
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([¡¿])[ \t]+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/,(\s*[,.!?])/g, '$1')
    .trim();
}

// Cuerpo con {{1}}, {{2}}… y el orden de las variables, para registrar la plantilla en WhatsApp.
export function toPositionalTemplate(body: string) {
  const order: string[] = [];
  const text = body.replace(VARIABLE_PATTERN, (_match, name: string) => {
    let index = order.indexOf(name);
    if (index === -1) {
      order.push(name);
      index = order.length - 1;
    }
    return `{{${index + 1}}}`;
  });
  return { text, variables: order };
}

export const TEMPLATE_EXAMPLE_VALUES: Record<TemplateVariable, string> = { nombre: 'Ana' };

// Reglas de WhatsApp para plantillas (el rechazo de Meta tarda y no siempre explica el motivo).
export function validateWhatsAppTemplate(template: { body: string; footer?: string | null; buttonText?: string | null; buttonUrl?: string | null }) {
  const errors: string[] = [];
  const body = template.body.trim();
  const unknown = unknownVariables(body);
  if (unknown.length) errors.push(`Variables desconocidas: ${unknown.map((name) => `{{${name}}}`).join(', ')}. Usa solo {{nombre}}.`);
  if (!body) errors.push('El mensaje no puede estar vacío.');
  if (body.length > 1024) errors.push('El mensaje supera los 1024 caracteres que permite WhatsApp.');
  if (/^\{\{[^}]+\}\}/.test(body) || /\{\{[^}]+\}\}[.!?¡¿,;:\s]*$/.test(body)) {
    errors.push('WhatsApp no acepta plantillas que empiezan o terminan con una variable: agrega texto antes y después de {{nombre}}.');
  }
  const variables = templateVariables(body).length;
  const words = body.replace(/\{\{[^}]+\}\}/g, '').split(/\s+/).filter(Boolean).length;
  if (variables && words < variables * 4) errors.push('Hay muy poco texto para la cantidad de variables; WhatsApp la rechazaría.');
  if (/\n{3,}/.test(body)) errors.push('No dejes más de una línea en blanco seguida.');
  if (template.footer && template.footer.length > 60) errors.push('El pie de mensaje admite hasta 60 caracteres.');
  if (template.footer && templateVariables(template.footer).length) errors.push('El pie de mensaje no puede tener variables.');
  if (template.buttonText && template.buttonText.length > 25) errors.push('El texto del botón admite hasta 25 caracteres.');
  if (template.buttonText && template.buttonUrl) {
    try {
      const url = new URL(template.buttonUrl);
      if (url.protocol !== 'https:') errors.push('El enlace del botón debe empezar con https://.');
    } catch {
      errors.push('El enlace del botón no es una dirección web válida.');
    }
  }
  return errors;
}

// Nombre técnico para WhatsApp: minúsculas, números y guiones bajos.
export function waTemplateName(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'plantilla'
  );
}
