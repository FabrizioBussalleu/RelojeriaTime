import 'server-only';

import { redirect } from 'next/navigation';
import { createSessionClient } from '@/lib/supabase/clients';

// Verificación real de acceso al panel: firma del JWT (getClaims) + fila en admin_users (is_admin).
// El proxy solo hace un chequeo optimista; cada página y acción del admin debe llamar a esto.
export async function getAdminSession() {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const { data: isAdmin, error: roleError } = await supabase.rpc('is_admin');
  if (roleError || !isAdmin) return null;

  return { supabase, userId: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : null };
}

// Solo se permite volver a rutas internas del panel (evita redirecciones abiertas).
export function safeAdminRedirect(value: FormDataEntryValue | string | null | undefined): string {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/admin') && !path.startsWith('//') && !path.startsWith('/admin/login') ? path : '/admin';
}

// Páginas del panel: sin sesión de admin vuelve al login.
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
