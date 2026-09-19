"use client";

import { useActionState } from "react";
import { Loader2, Search } from "lucide-react";
import { trackOrderAction, type TrackState } from "@/app/(tienda)/seguimiento/actions";
import { OrderItems, OrderTimeline } from "./OrderSummaryView";

const initialState: TrackState = { order: null, error: null, code: "", email: "" };

const inputClass = "w-full bg-transparent border border-border px-3 py-3 text-sm focus:outline-none focus:border-foreground";

export default function TrackingForm() {
  const [state, formAction, pending] = useActionState(trackOrderAction, initialState);

  return (
    <div className="space-y-10">
      <form action={formAction} className="mx-auto grid max-w-xl gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-2 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="block">Código de pedido</span>
          <input name="code" defaultValue={state.code} required placeholder="TM-001001" autoCapitalize="characters" className={`${inputClass} font-mono`} />
        </label>
        <label className="space-y-2 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="block">Correo</span>
          <input name="email" type="email" defaultValue={state.email} required autoComplete="email" className={inputClass} />
        </label>
        <button type="submit" disabled={pending} className="btn-primary flex h-[46px] items-center justify-center gap-2 px-6 py-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Buscar
        </button>
      </form>

      <div aria-live="polite">
        {state.error ? (
          <p role="alert" className="mx-auto max-w-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.order ? (
          <div className="space-y-8">
            <h2 className="text-center text-xl font-display tracking-wider">Pedido {state.order.code}</h2>
            <OrderTimeline status={state.order.status} history={state.order.history} />
            <OrderItems order={state.order} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
