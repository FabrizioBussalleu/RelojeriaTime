import type { Metadata } from 'next';
import TrackingForm from '@/components/orders/TrackingForm';

export const metadata: Metadata = {
  title: 'Seguimiento de pedido',
  description: 'Consulta el estado de tu pedido en Time Relojería con tu código y tu correo.',
};

export default function TrackingPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-10 md:py-14 space-y-10">
      <header className="text-center space-y-3">
        <h1 className="text-3xl md:text-4xl font-display">Seguimiento de pedido</h1>
        <p className="text-sm text-muted-foreground">Ingresa el código que recibiste al comprar y el correo que usaste.</p>
      </header>
      <TrackingForm />
    </div>
  );
}
