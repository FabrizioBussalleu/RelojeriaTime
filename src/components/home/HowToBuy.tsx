import { MessageCircle, ShoppingBag, Smartphone } from "lucide-react";

// Explica el cobro manual de la v1: pedido en la web, pago por Yape o transferencia, confirmación por WhatsApp.
const STEPS = [
  { icon: ShoppingBag, title: "Elige tu reloj", text: "Agrégalo al carrito y confirma tus datos de entrega." },
  { icon: Smartphone, title: "Paga fácil", text: "Yape o transferencia bancaria. Te mostramos los datos al terminar tu pedido." },
  { icon: MessageCircle, title: "Te confirmamos", text: "Envíanos tu comprobante por WhatsApp y coordinamos la entrega contigo." },
];

const HowToBuy = () => {
  return (
    <section id="como-comprar" className="theme-light scroll-mt-[var(--header-height)] py-16 md:py-24" aria-labelledby="como-comprar-titulo">
      <div className="container mx-auto px-4 md:px-8">
        <h2 id="como-comprar-titulo" className="text-center text-3xl md:text-4xl font-display font-bold tracking-tight">
          Cómo comprar
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center border border-foreground">
                <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <p className="mt-4 text-xs font-display tracking-[0.3em] text-muted-foreground">PASO {index + 1}</p>
              <h3 className="mt-2 text-lg font-display tracking-wider">{title}</h3>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default HowToBuy;
