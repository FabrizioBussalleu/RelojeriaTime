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

// Visibilidad en el panel: el estado de la base más la marca de "solo al por mayor", que se elige
// como una opción más junto a borrador, publicado y archivado.
export type ProductVisibility = 'draft' | 'active' | 'wholesale' | 'archived';

export const PRODUCT_VISIBILITY_LABELS: Record<ProductVisibility, string> = {
  draft: 'Borrador',
  active: 'Publicado',
  wholesale: 'Solo al por mayor',
  archived: 'Archivado',
};

export const PRODUCT_VISIBILITY_HINTS: Record<ProductVisibility, string> = {
  draft: PRODUCT_STATUS_HINTS.draft,
  active: 'Visible en la tienda, en la página de por mayor y para el asistente de WhatsApp.',
  wholesale: 'Fuera del catálogo de la tienda: solo aparece en “Compras al por mayor”, sin precio y para cotizar.',
  archived: PRODUCT_STATUS_HINTS.archived,
};

export const PRODUCT_VISIBILITY_TONES: Record<ProductVisibility, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  active: 'success',
  wholesale: 'neutral',
  archived: 'warning',
};

export function productVisibility(status: ProductStatus, wholesaleOnly: boolean): ProductVisibility {
  return status === 'active' && wholesaleOnly ? 'wholesale' : status;
}

export function visibilityToStatus(visibility: ProductVisibility): { status: ProductStatus; wholesaleOnly: boolean } {
  return visibility === 'wholesale' ? { status: 'active', wholesaleOnly: true } : { status: visibility, wholesaleOnly: false };
}

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
