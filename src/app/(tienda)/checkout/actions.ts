'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { getStoreSettings } from '@/lib/catalog';
import { notifyNewOrder } from '@/lib/email/notify-order';
import { orderConfirmationPath } from '@/lib/orders';
import { normalizePhone } from '@/lib/phone';
import { createServiceClient } from '@/lib/supabase/clients';

const MAX_ORDERS_PER_EMAIL_PER_HOUR = 5;

const checkoutSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(120, 'El nombre es demasiado largo.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Ingresa un correo válido.')),
  // Mismo criterio que la base: celular peruano de 9 dígitos o número con código de país.
  phone: z.string().trim().refine((value) => normalizePhone(value) !== null, 'Ingresa un celular válido (9 dígitos) o tu número con código de país.'),
  document: z.union([z.literal(''), z.string().trim().regex(/^\d{8,12}$/, 'El DNI o CE debe tener entre 8 y 12 dígitos.')]),
  address: z.string().trim().min(5, 'Ingresa tu dirección de entrega.').max(300, 'La dirección es demasiado larga.'),
  city: z.string().trim().max(80, 'El distrito o ciudad es demasiado largo.'),
  notes: z.string().trim().max(1000, 'Las notas son demasiado largas.'),
  paymentMethod: z.enum(['yape', 'plin', 'transfer'], 'Elige un método de pago.'),
  acceptTerms: z.boolean().refine((accepted) => accepted, 'Debes aceptar los términos y la política de privacidad.'),
  whatsappOptIn: z.boolean().default(false),
  website: z.string().max(0),
  items: z
    .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(10) }))
    .min(1, 'Tu carrito está vacío.')
    .max(30),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;

export type CheckoutResult =
  | { ok: true; path: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof CheckoutInput, string>> };

// El total, los precios y el stock los decide create_order en la base; aquí solo se validan los datos.
export async function placeOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof CheckoutInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CheckoutInput;
      fieldErrors[field] ??= issue.message;
    }
    if (fieldErrors.website) return { ok: false, error: 'No pudimos procesar el pedido.' };
    return { ok: false, error: fieldErrors.items ?? 'Revisa los datos marcados.', fieldErrors };
  }
  const data = parsed.data;

  const settings = await getStoreSettings();
  const enabled = { yape: Boolean(settings.yapeNumber), plin: Boolean(settings.plinNumber), transfer: settings.bankAccounts.length > 0 };
  if (!enabled[data.paymentMethod]) {
    return { ok: false, error: 'Ese método de pago no está disponible.', fieldErrors: { paymentMethod: 'Elige otro método de pago.' } };
  }

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_email', data.email)
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_ORDERS_PER_EMAIL_PER_HOUR) {
    return { ok: false, error: 'Recibimos varios pedidos con este correo en la última hora. Escríbenos por WhatsApp y te ayudamos.' };
  }

  const { data: order, error } = await supabase.rpc('create_order', {
    p_customer: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      document: data.document,
      address: data.address,
      city: data.city,
      notes: data.notes,
      whatsapp_opt_in: data.whatsappOptIn,
    },
    p_items: data.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_payment_method: data.paymentMethod,
  });

  if (error) {
    // P0001 y 22023 son mensajes redactados para el cliente en create_order (stock, disponibilidad, formato).
    if (error.code === 'P0001' || error.code === '22023') return { ok: false, error: error.message };
    console.error('create_order falló', error);
    return { ok: false, error: 'No pudimos registrar tu pedido. Inténtalo de nuevo en unos minutos.' };
  }

  // El stock cambió: la home y las fichas deben reflejar agotados cuanto antes.
  revalidatePath('/');
  revalidatePath('/producto/[slug]', 'page');

  const { code } = order as { code: string };
  // Correo a la tienda y al cliente, después de responder: el cliente no espera al envío.
  after(() => notifyNewOrder(code));
  return { ok: true, path: orderConfirmationPath(code) };
}
