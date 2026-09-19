// Etiquetas en español para los valores guardados en la base (CRM y WhatsApp).
export const CUSTOMER_SOURCE_LABELS = {
  checkout: 'Compra en la web',
  registro: 'Registro en la web',
  manual: 'Alta manual',
  whatsapp: 'Escribió por WhatsApp',
} as const;

export type CustomerSource = keyof typeof CUSTOMER_SOURCE_LABELS;

export const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  draft: 'Sin enviar a WhatsApp',
  pending: 'En revisión de WhatsApp',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  paused: 'Pausada por WhatsApp',
  disabled: 'Desactivada por WhatsApp',
};

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  sent: 'Enviada',
  cancelled: 'Cancelada',
  failed: 'Falló',
};

export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: 'En cola',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Falló',
  skipped: 'Omitido',
};

export const MESSAGE_SENDER_LABELS: Record<string, string> = {
  customer: 'Cliente',
  ai: 'Asistente IA',
  agent: 'Equipo',
  campaign: 'Campaña',
  system: 'Automático',
};

export const ASSISTANT_MODEL_LABELS = {
  'claude-opus-5': 'Claude Opus 5 — la mejor calidad (recomendado)',
  'claude-sonnet-5': 'Claude Sonnet 5 — equilibrio calidad/costo',
  'claude-haiku-4-5': 'Claude Haiku 4.5 — el más económico',
} as const;

export const TEMPLATE_STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  draft: 'neutral',
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
  paused: 'warning',
  disabled: 'danger',
};

// Intereses por tipo de reloj (se guardan con el valor del género del catálogo).
export const GENDER_INTEREST_LABELS = { hombre: 'Relojes de hombre', mujer: 'Relojes de mujer', unisex: 'Relojes unisex' } as const;
