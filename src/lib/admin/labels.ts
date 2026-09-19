// Etiquetas del panel para el catálogo.
export type ProductStatus = 'draft' | 'active' | 'archived';

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Borrador',
  active: 'Publicado',
  archived: 'Archivado',
};

export const PRODUCT_STATUS_HINTS: Record<ProductStatus, string> = {
  draft: 'No se ve en la tienda. Úsalo mientras lo preparas.',
  active: 'Visible en la tienda y para el asistente de WhatsApp.',
  archived: 'Oculto, pero se conserva con sus fotos (por ejemplo, un modelo discontinuado).',
};

export const PRODUCT_STATUS_TONES: Record<ProductStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  active: 'success',
  archived: 'warning',
};

// Umbral para "stock bajo" en el panel.
export const LOW_STOCK = 2;

// Pedidos -----------------------------------------------------------------------------------
export const ORDER_STATUS_TONES = {
  pending_payment: 'warning',
  paid: 'info',
  preparing: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'danger',
} as const;

// Siguiente paso habitual de cada estado (botón principal del detalle del pedido).
export const ORDER_NEXT_STEP = {
  pending_payment: { status: 'paid', label: 'Confirmar pago' },
  paid: { status: 'preparing', label: 'Pasar a preparación' },
  preparing: { status: 'shipped', label: 'Marcar como enviado' },
  shipped: { status: 'delivered', label: 'Marcar como entregado' },
} as const;
