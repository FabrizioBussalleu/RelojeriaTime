'use server';

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/clients';

const MAX_PER_EMAIL_PER_HOUR = 3;

const optionalText = (max: number) => z.string().trim().max(max);

const complaintSchema = z
  .object({
    kind: z.enum(['reclamo', 'queja'], 'Indica si es un reclamo o una queja.'),
    consumerName: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(120),
    consumerDocument: z.string().trim().regex(/^[A-Za-z0-9]{8,20}$/, 'Ingresa tu DNI, CE o pasaporte.'),
    consumerEmail: z.string().trim().toLowerCase().pipe(z.email('Ingresa un correo válido.')),
    consumerPhone: z.union([z.literal(''), z.string().trim().regex(/^\+?[\d\s-]{6,20}$/, 'Ingresa un teléfono válido.')]),
    consumerAddress: z.string().trim().min(5, 'Ingresa tu domicilio.').max(300),
    isMinor: z.boolean(),
    guardianName: optionalText(120),
    itemType: z.enum(['producto', 'servicio'], 'Indica si se trata de un producto o un servicio.'),
    itemDescription: z.string().trim().min(3, 'Describe el producto o servicio.').max(500),
    amount: z.union([z.literal(''), z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Ingresa un monto válido, por ejemplo 250.00.')]),
    orderCode: optionalText(20),
    detail: z.string().trim().min(10, 'Cuéntanos qué pasó (al menos 10 caracteres).').max(3000),
    consumerRequest: z.string().trim().min(5, 'Indica qué solicitas.').max(1500),
    website: z.string().max(0),
  })
  .refine((data) => !data.isMinor || data.guardianName.length >= 2, {
    path: ['guardianName'],
    message: 'Si eres menor de edad, ingresa el nombre de tu padre, madre o apoderado.',
  });

export type ComplaintInput = z.input<typeof complaintSchema>;

export type ComplaintResult =
  | { ok: true; code: string; createdAt: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof ComplaintInput, string>> };

export async function submitComplaint(input: ComplaintInput): Promise<ComplaintResult> {
  const parsed = complaintSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ComplaintInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ComplaintInput;
      fieldErrors[field] ??= issue.message;
    }
    if (fieldErrors.website) return { ok: false, error: 'No pudimos registrar la hoja de reclamación.' };
    return { ok: false, error: 'Revisa los datos marcados.', fieldErrors };
  }
  const data = parsed.data;

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('complaints')
    .select('id', { count: 'exact', head: true })
    .eq('consumer_email', data.consumerEmail)
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
    return { ok: false, error: 'Ya registraste varias hojas en la última hora. Si necesitas agregar información, escríbenos por WhatsApp.' };
  }

  const { data: complaint, error } = await supabase
    .from('complaints')
    .insert({
      kind: data.kind,
      consumer_name: data.consumerName,
      consumer_document: data.consumerDocument,
      consumer_email: data.consumerEmail,
      consumer_phone: data.consumerPhone || null,
      consumer_address: data.consumerAddress,
      is_minor: data.isMinor,
      guardian_name: data.isMinor ? data.guardianName : null,
      item_type: data.itemType,
      item_description: data.itemDescription,
      amount: data.amount ? Number(data.amount) : null,
      order_code: data.orderCode.toUpperCase() || null,
      detail: data.detail,
      consumer_request: data.consumerRequest,
    })
    .select('code, created_at')
    .single();

  if (error) {
    console.error('No se pudo registrar el reclamo', error);
    return { ok: false, error: 'No pudimos registrar la hoja de reclamación. Inténtalo de nuevo en unos minutos.' };
  }
  return { ok: true, code: complaint.code, createdAt: complaint.created_at };
}
