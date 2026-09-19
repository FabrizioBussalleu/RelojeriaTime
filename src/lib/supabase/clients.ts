import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEnv } from '@/lib/env';
import type { Database } from './database.types';

const withoutSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// Lecturas públicas (catálogo, ajustes): sin cookies, así las páginas se pueden cachear.
export function createPublicClient() {
  return createClient<Database>(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), withoutSession);
}

// Con la sesión del usuario (panel admin): las políticas RLS aplican con su identidad.
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Los Server Components no pueden escribir cookies; el proxy ya refrescó la sesión.
        }
      },
    },
  });
}

// Service role: salta RLS. Solo para funciones del servidor (crear pedidos, crons, cola de Cloudinary).
export function createServiceClient() {
  return createClient<Database>(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), withoutSession);
}
