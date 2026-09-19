import type { NextConfig } from 'next';

// Política de contenido: solo lo que la tienda usa. Scripts propios (Next necesita 'unsafe-inline'
// para su arranque sin nonces, que obligarían a renderizar todo en cada visita), fotos de Cloudinary
// y subidas firmadas del panel directo a la API de Cloudinary.
const contentSecurityPolicy = [
  "default-src 'self'",
  // challenges.cloudflare.com: verificador Turnstile del ingreso al panel.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
  "font-src 'self'",
  "connect-src 'self' https://api.cloudinary.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Las fotos de producto se sirven desde Cloudinary con el ancho exacto de cada breakpoint.
    loader: 'custom',
    loaderFile: './src/lib/cloudinary/loader.ts',
  },
  async headers() {
    // En desarrollo Next necesita eval y recarga en caliente: la política solo aplica al build.
    if (process.env.NODE_ENV !== 'production') return [];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    // Rutas del sitio legado.
    return [
      { source: '/tracking', destination: '/seguimiento', permanent: true },
      { source: '/order-success', destination: '/seguimiento', permanent: true },
    ];
  },
};

export default nextConfig;
