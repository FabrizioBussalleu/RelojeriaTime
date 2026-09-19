import { Card, PageHeader } from '@/components/admin/ui';
import { CustomerForm } from '@/components/admin/CustomerForm';
import { requireAdmin } from '@/lib/auth';
import { createCustomer } from '../actions';

export const metadata = { title: 'Nuevo cliente' };

export default async function NewCustomerPage() {
  const { supabase } = await requireAdmin();
  const { data: brands } = await supabase.from('brands').select('name').order('name');

  return (
    <>
      <PageHeader title="Nuevo cliente" description="Para clientes que compraron en tienda, por teléfono o que te pasaron su número." back={{ href: '/admin/clientes', label: 'Clientes' }} />
      <Card className="max-w-3xl">
        <CustomerForm action={createCustomer} brands={(brands ?? []).map((brand) => brand.name)} mode="create" />
      </Card>
    </>
  );
}
