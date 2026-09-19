"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Printer } from "lucide-react";
import { submitComplaint, type ComplaintInput, type ComplaintResult } from "@/app/(tienda)/libro-de-reclamaciones/actions";
import { COMPLAINT_RESPONSE_DAYS } from "@/lib/legal";

type FieldErrors = NonNullable<Extract<ComplaintResult, { ok: false }>["fieldErrors"]>;

const inputClass =
  "w-full bg-transparent border border-border px-3 py-3 text-sm focus:outline-none focus:border-foreground aria-[invalid=true]:border-destructive";
const labelClass = "block text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground";

const dateFormat = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short", timeZone: "America/Lima" });

function Field({
  name,
  label,
  error,
  optional,
  children,
}: {
  name: keyof ComplaintInput;
  label: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; name: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = `lr-${name}`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={labelClass}>
        {label} {optional ? <span className="normal-case tracking-normal">(opcional)</span> : null}
      </label>
      {children({ id, name, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ComplaintForm() {
  const [pending, startTransition] = useTransition();
  const [isMinor, setIsMinor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [receipt, setReceipt] = useState<{ code: string; createdAt: string; input: ComplaintInput } | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const input: ComplaintInput = {
      kind: text("kind") as ComplaintInput["kind"],
      consumerName: text("consumerName"),
      consumerDocument: text("consumerDocument"),
      consumerEmail: text("consumerEmail"),
      consumerPhone: text("consumerPhone"),
      consumerAddress: text("consumerAddress"),
      isMinor,
      guardianName: text("guardianName"),
      itemType: text("itemType") as ComplaintInput["itemType"],
      itemDescription: text("itemDescription"),
      amount: text("amount"),
      orderCode: text("orderCode"),
      detail: text("detail"),
      consumerRequest: text("consumerRequest"),
      website: text("website"),
    };
    setError(null);
    startTransition(async () => {
      const result = await submitComplaint(input);
      if (result.ok) {
        setReceipt({ code: result.code, createdAt: result.createdAt, input });
        window.scrollTo({ top: 0 });
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  };

  if (receipt) {
    return (
      <section aria-labelledby="constancia" className="space-y-6 border border-foreground p-6">
        <h2 id="constancia" className="text-xl font-display tracking-wider">
          Hoja de reclamación N.° {receipt.code}
        </h2>
        <p className="text-sm text-muted-foreground">
          Registrada el {dateFormat.format(new Date(receipt.createdAt))}. Te responderemos en un plazo no mayor a {COMPLAINT_RESPONSE_DAYS} días
          hábiles al correo {receipt.input.consumerEmail}. Guarda o imprime esta constancia.
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="capitalize">{receipt.input.kind}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Consumidor</dt>
            <dd>
              {receipt.input.consumerName} ({receipt.input.consumerDocument})
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Bien contratado</dt>
            <dd>
              {receipt.input.itemType}: {receipt.input.itemDescription}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Detalle</dt>
            <dd className="whitespace-pre-line">{receipt.input.detail}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Pedido del consumidor</dt>
            <dd className="whitespace-pre-line">{receipt.input.consumerRequest}</dd>
          </div>
        </dl>
        <button type="button" onClick={() => window.print()} className="btn-outline inline-flex items-center gap-2 print:hidden">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimir o guardar
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="relative space-y-10">
      <fieldset className="space-y-5">
        <legend className="mb-5 text-lg font-display tracking-wider">1. Identificación del consumidor</legend>
        <Field name="consumerName" label="Nombre completo" error={fieldErrors.consumerName}>
          {(props) => <input {...props} autoComplete="name" required className={inputClass} />}
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field name="consumerDocument" label="DNI, CE o pasaporte" error={fieldErrors.consumerDocument}>
            {(props) => <input {...props} required className={inputClass} />}
          </Field>
          <Field name="consumerPhone" label="Teléfono" optional error={fieldErrors.consumerPhone}>
            {(props) => <input {...props} type="tel" autoComplete="tel" className={inputClass} />}
          </Field>
        </div>
        <Field name="consumerEmail" label="Correo electrónico" error={fieldErrors.consumerEmail}>
          {(props) => <input {...props} type="email" autoComplete="email" required className={inputClass} />}
        </Field>
        <Field name="consumerAddress" label="Domicilio" error={fieldErrors.consumerAddress}>
          {(props) => <input {...props} autoComplete="street-address" required className={inputClass} />}
        </Field>
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <input type="checkbox" checked={isMinor} onChange={(event) => setIsMinor(event.target.checked)} className="accent-foreground" />
          Soy menor de edad
        </label>
        {isMinor ? (
          <Field name="guardianName" label="Nombre del padre, madre o apoderado" error={fieldErrors.guardianName}>
            {(props) => <input {...props} required className={inputClass} />}
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-5 text-lg font-display tracking-wider">2. Identificación del bien contratado</legend>
        <div className="flex gap-6 text-sm">
          {(["producto", "servicio"] as const).map((type, index) => (
            <label key={type} className="flex items-center gap-2 capitalize">
              <input type="radio" name="itemType" value={type} defaultChecked={index === 0} className="accent-foreground" />
              {type}
            </label>
          ))}
        </div>
        <Field name="itemDescription" label="Descripción" error={fieldErrors.itemDescription}>
          {(props) => <input {...props} required placeholder="Ej.: reloj modelo…" className={inputClass} />}
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field name="amount" label="Monto reclamado (S/)" optional error={fieldErrors.amount}>
            {(props) => <input {...props} inputMode="decimal" placeholder="0.00" className={inputClass} />}
          </Field>
          <Field name="orderCode" label="Código de pedido" optional error={fieldErrors.orderCode}>
            {(props) => <input {...props} placeholder="TM-000000" className={`${inputClass} font-mono`} />}
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-5 text-lg font-display tracking-wider">3. Detalle de la reclamación</legend>
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="radio" name="kind" value="reclamo" defaultChecked className="mt-1 accent-foreground" />
            <span>
              <strong className="font-display tracking-wider">Reclamo:</strong>{" "}
              <span className="text-muted-foreground">disconformidad relacionada con los productos o servicios.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" name="kind" value="queja" className="mt-1 accent-foreground" />
            <span>
              <strong className="font-display tracking-wider">Queja:</strong>{" "}
              <span className="text-muted-foreground">
                disconformidad no relacionada con los productos o servicios, o malestar respecto a la atención al público.
              </span>
            </span>
          </label>
        </div>
        <Field name="detail" label="Detalle" error={fieldErrors.detail}>
          {(props) => <textarea {...props} rows={5} required className={inputClass} />}
        </Field>
        <Field name="consumerRequest" label="Pedido del consumidor" error={fieldErrors.consumerRequest}>
          {(props) => <textarea {...props} rows={3} required className={inputClass} />}
        </Field>
      </fieldset>

      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {error ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary flex w-full items-center justify-center gap-2 md:w-auto">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Registrando…" : "Enviar hoja de reclamación"}
      </button>
    </form>
  );
}
