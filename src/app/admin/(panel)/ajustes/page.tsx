import { AdminsManager, StoreSettingsForm } from '@/components/admin/settings/SettingsForms';
import { Card, formatDateTime, PageHeader } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/clients';

export const metadata = { title: 'Ajustes' };

type Bank = { bank: string; holder: string; account: string; cci: string };

export default async function SettingsPage() {
  const { supabase, userId } = await requireAdmin();
  const [{ data: settings }, { data: adminRows }] = await Promise.all([
    supabase.from('store_settings').select('*').single(),
    supabase.from('admin_users').select('user_id, created_at').order('created_at'),
  ]);
  // Los correos viven en auth.users: se leen con la clave de servicio (solo aquí, ya verificado el admin).
  const service = createServiceClient();
  const admins = await Promise.all(
    (adminRows ?? []).map(async (row) => {
      const { data } = await service.auth.admin.getUserById(row.user_id);
      return { id: row.user_id, email: data.user?.email ?? null, lastSignIn: data.user?.last_sign_in_at ? formatDateTime(data.user.last_sign_in_at) : null };
    })
  );
  const banks = Array.isArray(settings?.bank_accounts) ? (settings.bank_accounts as Bank[]) : [];

  return (
    <>
      <PageHeader title="Ajustes" description="Datos de pago, envío y contacto que ve el cliente, y quién puede entrar al panel." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        {settings ? (
          <StoreSettingsForm
            initial={{
              contact_email: settings.contact_email ?? '',
              whatsapp_number: settings.whatsapp_number ?? '',
              yape_number: settings.yape_number ?? '',
              plin_number: settings.plin_number ?? '',
              payment_holder_name: settings.payment_holder_name ?? '',
              bank_accounts: banks.map((bank) => ({ bank: bank.bank ?? '', holder: bank.holder ?? '', account: bank.account ?? '', cci: bank.cci ?? '' })),
              instagram_url: settings.instagram_url ?? '',
              tiktok_url: settings.tiktok_url ?? '',
              facebook_url: settings.facebook_url ?? '',
              shipping_flat_fee: String(settings.shipping_flat_fee ?? 0),
              free_shipping_threshold: settings.free_shipping_threshold === null ? '' : String(settings.free_shipping_threshold),
              pending_order_ttl_hours: String(settings.pending_order_ttl_hours),
            }}
          />
        ) : null}
        <div>
          <Card title="Administradores">
            <AdminsManager admins={admins} currentUserId={userId} />
          </Card>
        </div>
      </div>
    </>
  );
}
