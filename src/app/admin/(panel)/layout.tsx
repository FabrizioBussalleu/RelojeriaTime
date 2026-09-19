import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/AdminNav';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: { default: 'Panel', template: '%s | Panel Time' }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const [{ count: attention }, { count: pendingOrders }] = await Promise.all([
    session.supabase.from('wa_conversations').select('id', { count: 'exact', head: true }).eq('needs_attention', true),
    session.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending_payment'),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <AdminNav email={session.email} attention={attention ?? 0} pendingOrders={pendingOrders ?? 0} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
