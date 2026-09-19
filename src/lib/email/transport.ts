import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

// Correo por SMTP. Sin costo con la cuenta de Gmail de la tienda (contraseña de aplicación); también
// sirve para Brevo, Resend u otro proveedor cambiando host, puerto y credenciales.
// Sin SMTP_USER/SMTP_PASSWORD no se envía nada (desarrollo y pruebas).
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim());
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASSWORD!.replace(/\s+/g, '') },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export type OutgoingEmail = { to: string | { name: string; address: string }; subject: string; html: string; text: string; replyTo?: string };

export async function sendEmail(email: OutgoingEmail) {
  if (!isEmailConfigured()) return { sent: false as const, reason: 'sin-configurar' as const };
  const from = process.env.EMAIL_FROM?.trim() || { name: 'Time Relojería', address: process.env.SMTP_USER!.trim() };
  await getTransporter().sendMail({ from, ...email });
  return { sent: true as const };
}
