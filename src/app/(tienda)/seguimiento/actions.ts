'use server';

import { z } from 'zod';
import { trackOrder, type OrderSummary } from '@/lib/orders';

export type TrackState = { order: OrderSummary | null; error: string | null; code: string; email: string };

const trackSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^TM-\d{6}$/, 'El código tiene el formato TM-000000.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Ingresa el correo con el que hiciste el pedido.')),
});

export async function trackOrderAction(_previous: TrackState, formData: FormData): Promise<TrackState> {
  const code = String(formData.get('code') ?? '');
  const email = String(formData.get('email') ?? '');
  const parsed = trackSchema.safeParse({ code, email });
  if (!parsed.success) {
    return { order: null, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.', code, email };
  }
  try {
    const order = await trackOrder(parsed.data.code, parsed.data.email);
    return order
      ? { order, error: null, code, email }
      : { order: null, error: 'No encontramos un pedido con ese código y correo.', code, email };
  } catch (error) {
    console.error('track_order falló', error);
    return { order: null, error: 'No pudimos consultar el pedido. Inténtalo de nuevo.', code, email };
  }
}
