'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminSession } from '@/lib/auth';
import type { OrderStatus } from '@/lib/store';

type Result = { ok: true } | { ok: false; error: string };

const STATUSES = ['pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'] as const;

// Cambio de estado vía set_order_status: registra quién y cuándo, fija paid_at y, al cancelar,
// devuelve el stock a las variantes.
export async function changeOrderStatus(orderId: string, status: OrderStatus, note: string): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró. Vuelve a ingresar.' };
  if (!STATUSES.includes(status)) return { ok: false, error: 'Estado inválido.' };
  const { error } = await session.supabase.rpc('set_order_status', { p_order_id: orderId, p_status: status, p_note: note.trim().slice(0, 500) || undefined });
  if (error) {
    if (error.code === 'P0001') return { ok: false, error: error.message };
    console.error('set_order_status', error);
    return { ok: false, error: 'No se pudo cambiar el estado.' };
  }
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath('/admin/pedidos');
  revalidatePath('/admin');
  // Cancelar devuelve stock: la tienda debe reflejarlo.
  if (status === 'cancelled') {
    revalidatePath('/');
    revalidatePath('/producto/[slug]', 'page');
  }
  return { ok: true };
}

export async function saveInternalNotes(orderId: string, notes: string): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const { error } = await session.supabase.from('orders').update({ internal_notes: notes.trim().slice(0, 4000) || null }).eq('id', orderId);
  if (error) return { ok: false, error: 'No se pudo guardar la nota.' };
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}

const DeliverySchema = z.object({
  customer_phone: z.string().trim().min(6, 'Teléfono inválido.').max(30),
  shipping_address: z.string().trim().min(5, 'Dirección muy corta.').max(300),
  shipping_city: z.string().trim().max(80),
});

export async function updateDelivery(orderId: string, input: z.input<typeof DeliverySchema>): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const parsed = DeliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { error } = await session.supabase
    .from('orders')
    .update({ ...parsed.data, shipping_city: parsed.data.shipping_city || null })
    .eq('id', orderId);
  if (error) return { ok: false, error: 'No se pudieron guardar los datos de entrega.' };
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}
