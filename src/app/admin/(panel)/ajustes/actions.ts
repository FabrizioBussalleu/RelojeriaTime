'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/clients';

type Result = { ok: true; message?: string } | { ok: false; error: string };

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => !value || /^https:\/\/\S+\.\S+/.test(value), 'Usa un enlace completo que empiece con https://')
  .transform((value) => value || null);
const optionalPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => !value || /^\d{9,15}$/.test(value), 'Número inválido (9 dígitos o con código de país).')
  .transform((value) => value || null);

const SettingsSchema = z.object({
  contact_email: z
    .string()
    .trim()
    .max(160)
    .refine((value) => !value || z.email().safeParse(value).success, 'Correo inválido.')
    .transform((value) => value || null),
  whatsapp_number: optionalPhone,
  yape_number: optionalPhone,
  plin_number: optionalPhone,
  payment_holder_name: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null),
  bank_accounts: z
    .array(
      z.object({
        bank: z.string().trim().min(1, 'Falta el banco.').max(60),
        holder: z.string().trim().min(1, 'Falta el titular.').max(120),
        account: z.string().trim().min(1, 'Falta el número de cuenta.').max(40),
        cci: z.string().trim().max(40),
      })
    )
    .max(6),
  instagram_url: optionalUrl,
  tiktok_url: optionalUrl,
  facebook_url: optionalUrl,
  shipping_flat_fee: z.number({ error: 'Monto inválido.' }).min(0).max(1000),
  free_shipping_threshold: z.number().min(0).max(100000).nullable(),
  pending_order_ttl_hours: z.number().int().min(1, 'Mínimo 1 hora.').max(720, 'Máximo 30 días.'),
});

export type SettingsInput = z.input<typeof SettingsSchema>;

export async function saveStoreSettings(input: SettingsInput): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
  const { error } = await session.supabase.from('store_settings').update(parsed.data).eq('id', true);
  if (error) {
    console.error('store_settings', error);
    return { ok: false, error: 'No se pudieron guardar los ajustes.' };
  }
  // Los datos de pago y contacto aparecen en toda la tienda.
  revalidatePath('/', 'layout');
  return { ok: true };
}

// Administradores: la cuenta se crea en Supabase (Authentication → Users); aquí se le da o quita acceso.
async function findUserByEmail(email: string) {
  const admin = createServiceClient().auth.admin;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function grantAdmin(rawEmail: string): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const email = rawEmail.trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { ok: false, error: 'Correo inválido.' };
  const user = await findUserByEmail(email);
  if (!user) return { ok: false, error: 'No existe una cuenta con ese correo. Créala primero en Supabase (Authentication → Users → Add user).' };
  const { error } = await createServiceClient().from('admin_users').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) return { ok: false, error: 'No se pudo dar acceso.' };
  revalidatePath('/admin/ajustes');
  return { ok: true, message: `${email} ya puede entrar al panel.` };
}

export async function revokeAdmin(userId: string): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  if (userId === session.userId) return { ok: false, error: 'No puedes quitarte el acceso a ti mismo.' };
  const service = createServiceClient();
  const { count } = await service.from('admin_users').select('user_id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) return { ok: false, error: 'Debe quedar al menos un administrador.' };
  const { error } = await service.from('admin_users').delete().eq('user_id', userId);
  if (error) return { ok: false, error: 'No se pudo quitar el acceso.' };
  revalidatePath('/admin/ajustes');
  return { ok: true };
}
