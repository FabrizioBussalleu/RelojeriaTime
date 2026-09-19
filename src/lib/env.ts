// Lectura de variables de entorno del servidor. Las NEXT_PUBLIC_ que usa el cliente se referencian
// de forma literal en su propio módulo para que Next las inserte en el bundle.

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.local (ver .env.example).`);
  }
  return value;
}


// URL pública del sitio (sin barra final). Sin NEXT_PUBLIC_SITE_URL: en producción, el dominio de
// producción de Vercel; en vistas previas, la URL del despliegue; en local, localhost.
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const production = process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : undefined;
  const vercel = production || process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : 'http://localhost:3000';
}
