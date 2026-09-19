import 'server-only';

import { headers } from 'next/headers';

// Turnstile: el verificador gratuito de Cloudflare que reemplaza al CAPTCHA. Protege el ingreso al
// panel de los intentos automáticos de adivinar la contraseña. Sin las claves configuradas no se exige
// (desarrollo y pruebas). La clave pública va en el widget; el secreto solo se usa aquí.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

export function isTurnstileEnabled() {
  return Boolean(turnstileSiteKey() && process.env.TURNSTILE_SECRET_KEY?.trim());
}

// IP del visitante según las cabeceras de Vercel/Cloudflare; Turnstile la usa como señal extra.
async function clientIp() {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || list.get('cf-connecting-ip')?.trim() || undefined;
}

export async function verifyTurnstile(token: string): Promise<boolean> {
  if (!isTurnstileEnabled()) return true;
  if (!token) return false;
  const body = new FormData();
  body.set('secret', process.env.TURNSTILE_SECRET_KEY!.trim());
  body.set('response', token);
  const ip = await clientIp();
  if (ip) body.set('remoteip', ip);
  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!result.success) console.warn('Turnstile rechazó el intento', result['error-codes']);
    return Boolean(result.success);
  } catch (error) {
    // Si Cloudflare no responde, no dejamos a la dueña fuera de su propio panel.
    console.error('Turnstile no respondió', error);
    return true;
  }
}
