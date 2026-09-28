import { describe, expect, it } from 'vitest';
import { BUSINESS, COMPLAINT_RESPONSE_DAYS } from '@/lib/legal';
import { renderComplaintEmails, type ComplaintEmailData } from './complaint-emails';

const hoja: ComplaintEmailData = {
  code: 'LR-2026-000004',
  createdAt: '2026-09-28T15:10:00Z',
  kind: 'reclamo',
  consumer: {
    name: 'Ana <b>Pérez</b>',
    document: '12345678',
    email: 'ana@correo.pe',
    phone: '987654321',
    address: 'Av. Larco 123',
    isMinor: false,
    guardianName: null,
  },
  item: { type: 'producto', description: 'Reloj Bulova Surveyor', amount: 750, orderCode: 'TM-001200' },
  detail: 'Llegó con el cristal rayado.\n<script>alert(1)</script>',
  request: 'Quiero el cambio por otra unidad.',
};

describe('correos del Libro de Reclamaciones', () => {
  const { consumer, owner } = renderComplaintEmails(hoja, { adminUrl: 'https://relojeria-time.com/admin' });

  it('el consumidor recibe su copia con el código y el plazo', () => {
    expect(consumer.subject).toContain('LR-2026-000004');
    expect(consumer.html).toContain('LR-2026-000004');
    expect(consumer.html).toContain(`${COMPLAINT_RESPONSE_DAYS} días hábiles`);
    expect(consumer.html).toContain('INDECOPI');
    expect(consumer.text).toContain('Quiero el cambio por otra unidad.');
  });

  it('la tienda recibe el aviso con los datos y el plazo para responder', () => {
    expect(owner.subject).toContain('Nuevo reclamo LR-2026-000004');
    expect(owner.html).toContain('ana@correo.pe');
    expect(owner.html).toContain('S/');
    expect(owner.text).toContain('Llegó con el cristal rayado.');
  });

  it('identifica al proveedor con su RUC', () => {
    for (const html of [consumer.html, owner.html]) expect(html).toContain(`RUC ${BUSINESS.ruc}`);
  });

  it('escapa lo que escribe el consumidor', () => {
    for (const html of [consumer.html, owner.html]) {
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;b&gt;Pérez&lt;/b&gt;');
    }
  });

  it('una queja se anuncia como queja', () => {
    const queja = renderComplaintEmails({ ...hoja, kind: 'queja' }, { adminUrl: 'https://relojeria-time.com/admin' });
    expect(queja.owner.subject).toContain('Nueva queja');
    expect(queja.consumer.html).toContain('Queja (malestar con la atención)');
  });
});
