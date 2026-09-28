import 'server-only';

import { getStoreSettings } from '@/lib/catalog';
import { siteUrl } from '@/lib/env';
import { renderComplaintEmails, type ComplaintEmailData } from './complaint-emails';
import { isTestAddress } from './order-emails';
import { isEmailConfigured, sendEmail } from './transport';

// Copia de la hoja para el consumidor (la exige el reglamento del Libro de Reclamaciones) y aviso a la
// tienda, que de otro modo no se enteraría del reclamo. Corre después de responder (after): un fallo
// se registra en el log y nunca hace fallar el registro del reclamo, que ya quedó en la base.
export async function notifyNewComplaint(hoja: ComplaintEmailData) {
  if (!isEmailConfigured()) {
    console.info(`Correo del reclamo ${hoja.code} omitido: falta configurar SMTP_USER y SMTP_PASSWORD.`);
    return;
  }
  const settings = await getStoreSettings().catch(() => null);
  const owner = process.env.ORDER_NOTIFICATION_EMAIL?.trim() || settings?.contactEmail || process.env.SMTP_USER!.trim();
  const emails = renderComplaintEmails(hoja, { adminUrl: `${siteUrl()}/admin` });

  const envios: Promise<unknown>[] = [sendEmail({ to: owner, replyTo: hoja.consumer.email, ...emails.owner })];
  // Las pruebas usan correos @example.com / .invalid: se registran, pero no se les escribe.
  if (!isTestAddress(hoja.consumer.email)) {
    envios.push(sendEmail({ to: { name: hoja.consumer.name, address: hoja.consumer.email }, replyTo: settings?.contactEmail ?? owner, ...emails.consumer }));
  }
  const resultados = await Promise.allSettled(envios);
  resultados.forEach((resultado, index) => {
    if (resultado.status === 'rejected') console.error(`Correo del reclamo ${hoja.code} a ${index === 0 ? 'la tienda' : 'el consumidor'} falló`, resultado.reason);
  });
}
