import type { Metadata, Viewport } from 'next';
import { Inter, Oswald } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';
import { siteUrl } from '@/lib/env';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-oswald', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-inter', display: 'swap' });

const DESCRIPTION =
  'Time Relojería: relojes seleccionados para cada ocasión. Paga con Yape o transferencia y recibe atención personalizada por WhatsApp.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'Time Relojería | Relojes en Perú', template: '%s | Time Relojería' },
  description: DESCRIPTION,
  applicationName: 'Time Relojería',
  alternates: { canonical: '/' },
  openGraph: { siteName: 'Time Relojería', locale: 'es_PE', type: 'website', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PE" className={`${oswald.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
