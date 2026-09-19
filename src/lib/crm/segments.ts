// Filtros de segmentación para envíos masivos. El mismo esquema valida el formulario del panel y lo
// que se guarda en campaigns.filters; la función SQL crm_segment() los aplica.
import { z } from 'zod';
import { CUSTOMER_SOURCE_LABELS } from './labels';

const days = z.coerce.number().int().min(1).max(3650);

export const SegmentFiltersSchema = z.object({
  audiencia: z.enum(['todos', 'compradores', 'sin_compras']).default('todos'),
  sin_compra_dias: days.optional(),
  compra_reciente_dias: days.optional(),
  gasto_min: z.coerce.number().min(0).max(1_000_000).optional(),
  marcas: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  generos: z.array(z.enum(['hombre', 'mujer', 'unisex'])).max(3).optional(),
  etiquetas: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  origen: z.array(z.enum(Object.keys(CUSTOMER_SOURCE_LABELS) as ['checkout', 'registro', 'manual', 'whatsapp'])).max(4).optional(),
  conversacion_dias: days.optional(),
  pedido_sin_pagar_dias: days.optional(),
  excluir_campana_dias: days.optional(),
});

export type SegmentFilters = z.infer<typeof SegmentFiltersSchema>;

// Sin claves vacías: así el JSON guardado refleja solo lo que el equipo eligió.
export function compactFilters(filters: SegmentFilters): SegmentFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0))
  ) as SegmentFilters;
}

// Descripción legible de un segmento ("Compradores · Bulova · sin compras hace 90 días").
export function describeFilters(filters: SegmentFilters): string[] {
  const parts: string[] = [];
  if (filters.audiencia === 'compradores') parts.push('Clientes que ya compraron');
  if (filters.audiencia === 'sin_compras') parts.push('Interesados que aún no compran');
  if (filters.sin_compra_dias) parts.push(`Sin comprar hace más de ${filters.sin_compra_dias} días`);
  if (filters.compra_reciente_dias) parts.push(`Compraron en los últimos ${filters.compra_reciente_dias} días`);
  if (filters.gasto_min) parts.push(`Gasto total desde S/ ${filters.gasto_min}`);
  if (filters.marcas?.length) parts.push(`Marcas: ${filters.marcas.join(', ')}`);
  if (filters.generos?.length) parts.push(`Relojes de ${filters.generos.join(' / ')}`);
  if (filters.etiquetas?.length) parts.push(`Etiquetas: ${filters.etiquetas.join(', ')}`);
  if (filters.origen?.length) parts.push(`Origen: ${filters.origen.map((source) => CUSTOMER_SOURCE_LABELS[source]).join(', ')}`);
  if (filters.conversacion_dias) parts.push(`Escribieron por WhatsApp en los últimos ${filters.conversacion_dias} días`);
  if (filters.pedido_sin_pagar_dias) parts.push(`Dejaron un pedido sin pagar en los últimos ${filters.pedido_sin_pagar_dias} días`);
  if (filters.excluir_campana_dias) parts.push(`Sin campañas en los últimos ${filters.excluir_campana_dias} días`);
  return parts.length ? parts : ['Todos los clientes con consentimiento'];
}
