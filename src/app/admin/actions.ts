'use server';

import { redirect } from 'next/navigation';
import { safeAdminRedirect } from '@/lib/auth';
import { createSessionClient } from '@/lib/supabase/clients';
import { verifyTurnstile } from '@/lib/turnstile';

// "intento" crece con cada respuesta para reiniciar el verificador de Cloudflare en el formulario.
export type SignInState = { error: string | null; intento?: number };

export async function signIn(previous: SignInState, formData: FormData): Promise<SignInState> {
  const intento = (previous.intento ?? 0) + 1;
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'Ingresa correo y contraseña válidos.', intento };
  }

  // Antes de tocar la base: si es un bot, el intento ni siquiera llega a Supabase.
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    return { error: 'No pudimos verificar que eres una persona. Vuelve a intentarlo.', intento };
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'Correo o contraseña incorrectos.', intento };
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { error: 'Esta cuenta no tiene acceso al panel.', intento };
  }

  redirect(safeAdminRedirect(formData.get('redirectTo')));
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
