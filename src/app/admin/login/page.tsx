import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/LoginForm';
import { getAdminSession, safeAdminRedirect } from '@/lib/auth';
import { turnstileSiteKey } from '@/lib/turnstile';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const redirectTo = safeAdminRedirect(typeof next === 'string' ? next : null);
  if (await getAdminSession()) redirect(redirectTo);
  return <LoginForm redirectTo={redirectTo} turnstileSiteKey={turnstileSiteKey()} />;
}
