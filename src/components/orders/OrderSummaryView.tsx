import Image from "next/image";
import { Check, X } from "lucide-react";
import type { OrderSummary } from "@/lib/orders";
import { formatPEN, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, visibleVariantLabel, type OrderStatus } from "@/lib/store";
import { cn } from "@/lib/utils";

const TIMELINE: OrderStatus[] = ["pending_payment", "paid", "preparing", "shipped", "delivered"];

const dateFormat = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short", timeZone: "America/Lima" });

export function OrderTimeline({ status, history }: Pick<OrderSummary, "status" | "history">) {
  if (status === "cancelled") {
    const cancelledAt = history.findLast((entry) => entry.status === "cancelled")?.at;
    return (
      <p className="flex items-center gap-3 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <X className="h-4 w-4" aria-hidden="true" />
        Pedido cancelado{cancelledAt ? ` el ${dateFormat.format(new Date(cancelledAt))}` : ""}.
      </p>
    );
  }
  const current = TIMELINE.indexOf(status);
  return (
    <ol className="grid gap-4 sm:grid-cols-5" aria-label="Estado del pedido">
      {TIMELINE.map((step, index) => {
        const done = index <= current;
        const at = history.findLast((entry) => entry.status === step)?.at;
        return (
          <li key={step} aria-current={index === current ? "step" : undefined} className="flex items-center gap-3 sm:flex-col sm:text-center">
            <span
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center border",
                done ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="text-xs">{index + 1}</span>}
            </span>
            <span>
              <span className={cn("block text-xs font-display uppercase tracking-wider", !done && "text-muted-foreground")}>
                {ORDER_STATUS_LABELS[step]}
              </span>
              {done && at ? <span className="block text-[0.7rem] text-muted-foreground">{dateFormat.format(new Date(at))}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderItems({ order }: { order: OrderSummary }) {
  return (
    <section aria-labelledby="detalle-pedido" className="border border-border p-6">
      <h2 id="detalle-pedido" className="mb-4 text-lg font-display tracking-wider">
        Detalle
      </h2>
      <ul className="space-y-4">
        {order.items.map((item, index) => (
          <li key={`${item.productName}-${index}`} className="flex gap-4">
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden bg-card">
              {item.imagePublicId ? <Image src={item.imagePublicId} alt="" fill sizes="64px" className="object-cover" /> : null}
            </div>
            <div className="flex-1 text-sm">
              <p className="font-display tracking-wider">{item.productName}</p>
              <p className="text-xs text-muted-foreground">
                {[item.brandName, visibleVariantLabel(item.variantLabel), `Cantidad: ${item.quantity}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <p className="text-sm">{formatPEN(item.unitPrice * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatPEN(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Envío</dt>
          <dd className="text-muted-foreground">{order.shippingCost > 0 ? formatPEN(order.shippingCost) : "Se coordina por WhatsApp"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Método de pago</dt>
          <dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-3 text-base">
          <dt className="font-display tracking-wider">Total</dt>
          <dd className="font-display tracking-wider">{formatPEN(order.total)}</dd>
        </div>
      </dl>
    </section>
  );
}
