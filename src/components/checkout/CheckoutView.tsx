"use client";

import { useState, useTransition, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { placeOrder, type CheckoutInput, type CheckoutResult } from "@/app/(tienda)/checkout/actions";
import { useCart } from "@/contexts/CartContext";
import { formatPEN, type PaymentMethod } from "@/lib/store";
import { cn } from "@/lib/utils";
import { rememberPurchase } from "@/lib/recent-purchases";

export type PaymentOption = { value: PaymentMethod; label: string; description: string };

type FieldErrors = NonNullable<Extract<CheckoutResult, { ok: false }>["fieldErrors"]>;

const inputClass =
  "w-full bg-transparent border border-border px-3 py-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground aria-[invalid=true]:border-destructive";

function Field({
  id,
  label,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
        {label} {optional ? <span className="normal-case tracking-normal">(opcional)</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error ? errorId : undefined })}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function CheckoutView({ paymentOptions, reserveHours }: { paymentOptions: PaymentOption[]; reserveHours: number }) {
  const { items, hydrated, subtotal, clearCart } = useCart();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const input: CheckoutInput = {
      name: text("name"),
      email: text("email"),
      phone: text("phone"),
      document: text("document"),
      address: text("address"),
      city: text("city"),
      notes: text("notes"),
      paymentMethod: text("paymentMethod") as CheckoutInput["paymentMethod"],
      acceptTerms: form.get("acceptTerms") === "on",
      whatsappOptIn: form.get("whatsappOptIn") === "on",
      website: text("website"),
      items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    };

    setError(null);
    startTransition(async () => {
      const result = await placeOrder(input);
      if (result.ok) {
        rememberPurchase(items.map((item) => item.productId));
        clearCart();
        router.replace(result.path);
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  };

  if (!hydrated) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-2xl md:text-3xl font-display">Tu carrito está vacío</h1>
        <p className="mt-3 text-sm text-muted-foreground">Elige un reloj del catálogo para continuar.</p>
        <Link href="/#catalogo" className="btn-outline mt-8">
          Ver relojes
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-8 py-10 md:py-14">
      <h1 className="text-3xl md:text-4xl font-display mb-10 text-center">Finalizar compra</h1>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-[1.2fr_1fr]">
        <form id="checkout-form" onSubmit={handleSubmit} noValidate className="relative space-y-10">
          <fieldset className="space-y-5">
            <legend className="mb-5 text-lg font-display tracking-wider">Tus datos</legend>
            <Field id="name" label="Nombre completo" error={fieldErrors.name}>
              {(props) => <input {...props} name="name" autoComplete="name" required className={inputClass} />}
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field id="email" label="Correo electrónico" error={fieldErrors.email}>
                {(props) => <input {...props} name="email" type="email" autoComplete="email" required className={inputClass} />}
              </Field>
              <Field id="phone" label="Celular" error={fieldErrors.phone}>
                {(props) => <input {...props} name="phone" type="tel" autoComplete="tel" required placeholder="9XX XXX XXX" className={inputClass} />}
              </Field>
            </div>
            <Field id="document" label="DNI o CE" optional error={fieldErrors.document}>
              {(props) => <input {...props} name="document" inputMode="numeric" className={inputClass} />}
            </Field>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="mb-5 text-lg font-display tracking-wider">Entrega</legend>
            <Field id="address" label="Dirección" error={fieldErrors.address}>
              {(props) => <input {...props} name="address" autoComplete="street-address" required className={inputClass} />}
            </Field>
            <Field id="city" label="Distrito y ciudad" optional error={fieldErrors.city}>
              {(props) => <input {...props} name="city" autoComplete="address-level2" placeholder="Miraflores, Lima" className={inputClass} />}
            </Field>
            <Field id="notes" label="Notas para la entrega" optional error={fieldErrors.notes}>
              {(props) => <textarea {...props} name="notes" rows={3} className={inputClass} />}
            </Field>
          </fieldset>

          <fieldset aria-describedby={fieldErrors.paymentMethod ? "payment-error" : undefined}>
            <legend className="mb-5 text-lg font-display tracking-wider">Método de pago</legend>
            <div className="space-y-3">
              {paymentOptions.map((option, index) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-4 border border-border p-4 transition-colors hover:border-foreground has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input type="radio" name="paymentMethod" value={option.value} defaultChecked={index === 0} className="mt-1 accent-foreground" />
                  <span>
                    <span className="block font-display tracking-wider">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.paymentMethod ? (
              <p id="payment-error" className="mt-2 text-xs text-destructive">
                {fieldErrors.paymentMethod}
              </p>
            ) : null}
          </fieldset>

          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input type="checkbox" name="acceptTerms" required className="mt-1 accent-foreground" aria-invalid={Boolean(fieldErrors.acceptTerms)} />
              <span>
                Acepto los{" "}
                <Link href="/terminos" target="_blank" className="underline hover:text-foreground">
                  términos y condiciones
                </Link>{" "}
                y la{" "}
                <Link href="/privacidad" target="_blank" className="underline hover:text-foreground">
                  política de privacidad
                </Link>
                .
              </span>
            </label>
            {fieldErrors.acceptTerms ? <p className="text-xs text-destructive">{fieldErrors.acceptTerms}</p> : null}
            <label className="flex items-start gap-3 text-sm text-muted-foreground">
              <input type="checkbox" name="whatsappOptIn" className="mt-1 accent-foreground" />
              <span>Quiero recibir novedades y promociones por WhatsApp (opcional; puedes darte de baja cuando quieras respondiendo BAJA).</span>
            </label>
          </div>

          {/* Trampa para bots: invisible para personas; los bots suelen completarla. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Sitio web
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
        </form>

        <aside aria-labelledby="resumen" className="h-fit border border-border p-6 lg:sticky lg:top-28">
          <h2 id="resumen" className="mb-6 text-lg font-display tracking-wider">
            Resumen
          </h2>
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.variantId} className="flex gap-4">
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden bg-card">
                  {item.imageSrc ? <Image src={item.imageSrc} alt="" fill sizes="64px" className="object-cover" /> : null}
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-display tracking-wider">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[item.brand, item.variantLabel, `Cantidad: ${item.quantity}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="text-sm">{formatPEN(item.price * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatPEN(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Envío</dt>
              <dd className="text-muted-foreground">Se coordina por WhatsApp</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3 text-base">
              <dt className="font-display tracking-wider">Total</dt>
              <dd className="font-display tracking-wider">{formatPEN(subtotal)}</dd>
            </div>
          </dl>

          {error ? (
            <p role="alert" className="mt-6 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            form="checkout-form"
            disabled={pending}
            className={cn("btn-primary mt-6 flex w-full items-center justify-center gap-2", pending && "opacity-70")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {pending ? "Registrando pedido…" : "Confirmar pedido"}
          </button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Al confirmar verás los datos para pagar. Reservamos tu pedido por {reserveHours} horas.
          </p>
        </aside>
      </div>
    </div>
  );
}
