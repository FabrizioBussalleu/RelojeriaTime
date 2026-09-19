import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Image src="/brand/isotipo.svg" alt="" width={90} height={80} unoptimized className="h-16 w-auto" />
      <h1 className="text-4xl font-display">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">La página que buscas no existe o ya no está disponible.</p>
      <Link href="/" className="btn-outline">
        Volver a la tienda
      </Link>
    </main>
  );
}
