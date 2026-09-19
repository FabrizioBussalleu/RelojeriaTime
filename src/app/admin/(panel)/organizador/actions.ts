'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminSession } from '@/lib/auth';

type Result = { ok: true } | { ok: false; error: string };

export async function saveProductOrder(ids: string[]): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró. Vuelve a ingresar.' };
  const parsed = z.array(z.string().uuid()).min(1).max(5000).safeParse(ids);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) return { ok: false, error: 'Orden inválido.' };
  const { error } = await session.supabase.rpc('reorder_products', { p_ids: parsed.data });
  if (error) {
    console.error('reorder_products', error);
    return { ok: false, error: 'No se pudo guardar el orden.' };
  }
  revalidatePath('/');
  revalidatePath('/admin/organizador');
  revalidatePath('/admin/productos');
  return { ok: true };
}

export async function setSoldOutLast(value: boolean): Promise<Result> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: 'Tu sesión expiró.' };
  const { error } = await session.supabase.from('store_settings').update({ sold_out_last: value }).eq('id', true);
  if (error) return { ok: false, error: 'No se pudo guardar el ajuste.' };
  revalidatePath('/');
  revalidatePath('/admin/organizador');
  return { ok: true };
}
