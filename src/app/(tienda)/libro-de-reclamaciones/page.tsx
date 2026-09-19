import type { Metadata } from 'next';
import ComplaintForm from '@/components/legal/ComplaintForm';
import { BUSINESS, COMPLAINT_RESPONSE_DAYS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Libro de Reclamaciones',
  description: 'Libro de Reclamaciones virtual de Time Relojería.',
};

export default function ComplaintsBookPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-10 md:py-14 space-y-10">
      <header className="space-y-4">
        <h1 className="text-3xl md:text-4xl font-display">Libro de Reclamaciones</h1>
        <dl className="grid gap-2 border border-border p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Razón social</dt>
            <dd>{BUSINESS.legalName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">RUC</dt>
            <dd>{BUSINESS.ruc}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Domicilio</dt>
            <dd>{BUSINESS.address}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          Conforme al Código de Protección y Defensa del Consumidor, contamos con un Libro de Reclamaciones virtual. Responderemos en un plazo no mayor a{' '}
          {COMPLAINT_RESPONSE_DAYS} días hábiles. La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito
          previo para interponer una denuncia ante el INDECOPI.
        </p>
      </header>
      <ComplaintForm />
    </div>
  );
}
