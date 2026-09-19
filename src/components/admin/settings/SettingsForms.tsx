'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { grantAdmin, revokeAdmin, saveStoreSettings, type SettingsInput } from '@/app/admin/(panel)/ajustes/actions';
import { ConfirmDialog } from '../Dialog';
import { buttonClass, Card, Field, inputClass, Notice } from '../ui';

type Bank = { bank: string; holder: string; account: string; cci: string };

export type SettingsValues = {
  contact_email: string;
  whatsapp_number: string;
  yape_number: string;
  plin_number: string;
  payment_holder_name: string;
  bank_accounts: Bank[];
  instagram_url: string;
  tiktok_url: string;
  facebook_url: string;
  shipping_flat_fee: string;
  free_shipping_threshold: string;
  pending_order_ttl_hours: string;
};

const money = (value: string) => {
  const number = Number(value.replace(',', '.'));
  return value.trim() === '' ? null : Number.isFinite(number) ? number : NaN;
};

export function StoreSettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const setBank = (index: number, patch: Partial<Bank>) => set('bank_accounts', values.bank_accounts.map((bank, position) => (position === index ? { ...bank, ...patch } : bank)));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input: SettingsInput = {
      contact_email: values.contact_email,
      whatsapp_number: values.whatsapp_number,
      yape_number: values.yape_number,
      plin_number: values.plin_number,
      payment_holder_name: values.payment_holder_name,
      bank_accounts: values.bank_accounts.filter((bank) => bank.bank || bank.account || bank.holder || bank.cci),
      instagram_url: values.instagram_url,
      tiktok_url: values.tiktok_url,
      facebook_url: values.facebook_url,
      shipping_flat_fee: money(values.shipping_flat_fee) ?? 0,
      free_shipping_threshold: money(values.free_shipping_threshold),
      pending_order_ttl_hours: Number(values.pending_order_ttl_hours),
    };
    startTransition(async () => {
      const result = await saveStoreSettings(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success('Ajustes guardados', { description: 'La tienda ya muestra los datos nuevos.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card title="Pagos">
        <p className="mb-4 text-sm text-muted-foreground">Se muestran al cliente al confirmar su pedido. Deja vacío lo que no uses: ese método no aparecerá en el checkout.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Yape">
            <input value={values.yape_number} onChange={(event) => set('yape_number', event.target.value)} inputMode="tel" placeholder="9XX XXX XXX" className={inputClass} />
          </Field>
          <Field label="Plin">
            <input value={values.plin_number} onChange={(event) => set('plin_number', event.target.value)} inputMode="tel" placeholder="9XX XXX XXX" className={inputClass} />
          </Field>
          <Field label="Titular (Yape / Plin)">
            <input value={values.payment_holder_name} onChange={(event) => set('payment_holder_name', event.target.value)} className={inputClass} />
          </Field>
        </div>
        <p className="mb-2 mt-5 text-xs uppercase tracking-[0.16em] text-muted-foreground">Cuentas para transferencia</p>
        <div className="space-y-3">
          {values.bank_accounts.map((bank, index) => (
            <fieldset key={index} className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_1.4fr_1.2fr_1.4fr_auto]">
              <legend className="sr-only">Cuenta {index + 1}</legend>
              <input value={bank.bank} onChange={(event) => setBank(index, { bank: event.target.value })} placeholder="Banco (BCP)" aria-label={`Banco de la cuenta ${index + 1}`} className={inputClass} />
              <input value={bank.holder} onChange={(event) => setBank(index, { holder: event.target.value })} placeholder="Titular" aria-label={`Titular de la cuenta ${index + 1}`} className={inputClass} />
              <input value={bank.account} onChange={(event) => setBank(index, { account: event.target.value })} placeholder="N.º de cuenta" aria-label={`Número de la cuenta ${index + 1}`} className={inputClass} />
              <input value={bank.cci} onChange={(event) => setBank(index, { cci: event.target.value })} placeholder="CCI (opcional)" aria-label={`CCI de la cuenta ${index + 1}`} className={inputClass} />
              <button type="button" onClick={() => set('bank_accounts', values.bank_accounts.filter((_, position) => position !== index))} className="p-2 text-muted-foreground hover:text-red-400" aria-label={`Quitar cuenta ${index + 1}`}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </fieldset>
          ))}
        </div>
        <button type="button" className={`${buttonClass.secondary} mt-3`} onClick={() => set('bank_accounts', [...values.bank_accounts, { bank: '', holder: '', account: '', cci: '' }])} disabled={values.bank_accounts.length >= 6}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar cuenta
        </button>
      </Card>

      <Card title="Envío y reserva">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Costo de envío (S/)" hint="0 = gratis o por coordinar.">
            <input value={values.shipping_flat_fee} onChange={(event) => set('shipping_flat_fee', event.target.value)} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Envío gratis desde (S/)" hint="Vacío = sin envío gratis por monto.">
            <input value={values.free_shipping_threshold} onChange={(event) => set('free_shipping_threshold', event.target.value)} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Reserva de pedidos (horas)" hint="Pasado este plazo sin pago, el pedido se cancela y el stock vuelve.">
            <input value={values.pending_order_ttl_hours} onChange={(event) => set('pending_order_ttl_hours', event.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card title="Contacto y redes">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp de la tienda">
            <input value={values.whatsapp_number} onChange={(event) => set('whatsapp_number', event.target.value)} inputMode="tel" className={inputClass} />
          </Field>
          <Field label="Correo de contacto">
            <input type="email" value={values.contact_email} onChange={(event) => set('contact_email', event.target.value)} className={inputClass} />
          </Field>
          <Field label="Instagram">
            <input value={values.instagram_url} onChange={(event) => set('instagram_url', event.target.value)} placeholder="https://www.instagram.com/…" className={inputClass} />
          </Field>
          <Field label="TikTok">
            <input value={values.tiktok_url} onChange={(event) => set('tiktok_url', event.target.value)} placeholder="https://www.tiktok.com/@…" className={inputClass} />
          </Field>
          <Field label="Facebook">
            <input value={values.facebook_url} onChange={(event) => set('facebook_url', event.target.value)} placeholder="https://www.facebook.com/…" className={inputClass} />
          </Field>
        </div>
      </Card>

      <button type="submit" className={buttonClass.primary} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Guardar ajustes
      </button>
    </form>
  );
}

export function AdminsManager({ admins, currentUserId }: { admins: { id: string; email: string | null; lastSignIn: string | null }[]; currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<{ id: string; email: string | null } | null>(null);

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border">
        {admins.map((admin) => (
          <li key={admin.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{admin.email ?? admin.id}</span>
              <span className="text-xs text-muted-foreground">{admin.id === currentUserId ? 'Tú' : admin.lastSignIn ? `Último ingreso ${admin.lastSignIn}` : 'Aún no ingresó'}</span>
            </span>
            {admin.id !== currentUserId ? (
              <button type="button" className="text-xs text-muted-foreground underline hover:text-red-400" onClick={() => setRevoking(admin)}>
                Quitar acceso
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await grantAdmin(email);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(result.message ?? 'Acceso otorgado');
            setEmail('');
            router.refresh();
          });
        }}
      >
        <label className="sr-only" htmlFor="new-admin">
          Correo del nuevo administrador
        </label>
        <input id="new-admin" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@ejemplo.com" className={inputClass} />
        <button type="submit" className={buttonClass.secondary} disabled={pending || !email}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Dar acceso
        </button>
      </form>
      <p className="text-xs text-muted-foreground">La cuenta debe existir en Supabase (Authentication → Users → Add user, con su contraseña). Aquí solo se le da o quita acceso al panel.</p>
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Quitar acceso al panel"
        description={`${revoking?.email ?? 'Esta cuenta'} ya no podrá entrar al panel. La cuenta sigue existiendo.`}
        confirmLabel="Quitar acceso"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await revokeAdmin(revoking!.id);
            if (!result.ok) toast.error(result.error);
            else toast.success('Acceso quitado');
            setRevoking(null);
            router.refresh();
          })
        }
      />
    </div>
  );
}
