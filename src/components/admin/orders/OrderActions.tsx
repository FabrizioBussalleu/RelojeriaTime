'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { changeOrderStatus, saveInternalNotes, updateDelivery } from '@/app/admin/(panel)/pedidos/actions';
import { ORDER_NEXT_STEP } from '@/lib/admin/labels';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/store';
import { ConfirmDialog } from '../Dialog';
import { buttonClass, Field, inputClass } from '../ui';

export function OrderStatusControl({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [other, setOther] = useState<OrderStatus | ''>('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const next = status in ORDER_NEXT_STEP ? ORDER_NEXT_STEP[status as keyof typeof ORDER_NEXT_STEP] : null;

  const apply = (target: OrderStatus) =>
    startTransition(async () => {
      const result = await changeOrderStatus(orderId, target, note);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Pedido: ${ORDER_STATUS_LABELS[target].toLowerCase()}`);
      setNote('');
      setOther('');
      setConfirmCancel(false);
      router.refresh();
    });

  if (status === 'cancelled') {
    return <p className="text-sm text-muted-foreground">Pedido cancelado: el stock ya volvió a la tienda. Un pedido cancelado no se puede reabrir.</p>;
  }

  return (
    <div className="space-y-3">
      <Field label="Nota (opcional, queda en el historial)">
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Ej.: Yape verificado, operación 123456" className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {next ? (
          <button type="button" className={buttonClass.primary} disabled={pending} onClick={() => apply(next.status)}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {next.label}
          </button>
        ) : null}
        <button type="button" className={buttonClass.danger} disabled={pending} onClick={() => setConfirmCancel(true)}>
          Cancelar pedido
        </button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Cambiar a otro estado</summary>
        <div className="mt-2 flex gap-2">
          <select value={other} onChange={(event) => setOther(event.target.value as OrderStatus | '')} className={inputClass} aria-label="Nuevo estado">
            <option value="">Elige un estado</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[])
              .filter((option) => option !== status && option !== 'cancelled')
              .map((option) => (
                <option key={option} value={option}>
                  {ORDER_STATUS_LABELS[option]}
                </option>
              ))}
          </select>
          <button type="button" className={buttonClass.secondary} disabled={pending || !other} onClick={() => other && apply(other)}>
            Aplicar
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Volver a “Pendiente de pago” quita la fecha de pago (deja de contar como venta).</p>
      </details>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar pedido"
        description="Las unidades vuelven al stock de la tienda y el pedido deja de contar como venta. No se puede reabrir."
        confirmLabel="Cancelar pedido"
        pending={pending}
        onConfirm={() => apply('cancelled')}
      />
    </div>
  );
}

export function InternalNotes({ orderId, initial }: { orderId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor="internal-notes">
        Notas internas
      </label>
      <textarea id="internal-notes" value={value} onChange={(event) => setValue(event.target.value)} rows={4} maxLength={4000} placeholder="Solo las ve el equipo." className={inputClass} />
      <button
        type="button"
        className={buttonClass.secondary}
        disabled={pending || value === saved}
        onClick={() =>
          startTransition(async () => {
            const result = await saveInternalNotes(orderId, value);
            if (result.ok) {
              setSaved(value);
              toast.success('Nota guardada');
            } else toast.error(result.error);
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Guardar nota
      </button>
    </div>
  );
}

export function DeliveryEditor({ orderId, initial }: { orderId: string; initial: { customer_phone: string; shipping_address: string; shipping_city: string } }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  if (!editing) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => setEditing(true)}>
        Corregir datos de entrega
      </button>
    );
  }
  return (
    <div className="mt-3 space-y-3 border border-border p-3">
      <Field label="Teléfono">
        <input value={values.customer_phone} onChange={(event) => setValues({ ...values, customer_phone: event.target.value })} className={inputClass} />
      </Field>
      <Field label="Dirección">
        <input value={values.shipping_address} onChange={(event) => setValues({ ...values, shipping_address: event.target.value })} className={inputClass} />
      </Field>
      <Field label="Distrito / ciudad">
        <input value={values.shipping_city} onChange={(event) => setValues({ ...values, shipping_city: event.target.value })} className={inputClass} />
      </Field>
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonClass.primary}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateDelivery(orderId, values);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success('Datos de entrega actualizados');
              setEditing(false);
              router.refresh();
            })
          }
        >
          Guardar
        </button>
        <button type="button" className={buttonClass.secondary} onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass.secondary}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied ? 'Copiado' : label}
    </button>
  );
}

export function WhatsAppOrderLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass.secondary}>
      <MessageCircle className="h-4 w-4" aria-hidden /> Escribir por WhatsApp
    </a>
  );
}
