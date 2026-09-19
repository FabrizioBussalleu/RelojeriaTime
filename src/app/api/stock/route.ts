import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPublicClient } from '@/lib/supabase/clients';

export const dynamic = 'force-dynamic';

// Stock en vivo de un producto para la ficha: la página es ISR y el navegador puede mostrarla desde su
// caché al volver atrás (por ejemplo, después de comprar la última unidad).
export async function GET(request: Request) {
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get('producto'));
  if (!id.success) return NextResponse.json({ error: 'Producto inválido.' }, { status: 400 });
  const { data, error } = await createPublicClient()
    .from('products')
    .select('id, variants:product_variants(id, stock)')
    .eq('status', 'active')
    .eq('id', id.data)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'No se pudo consultar el stock.' }, { status: 502 });
  const variants = data?.variants ?? [];
  return NextResponse.json(
    { available: variants.some((variant) => variant.stock > 0), variants },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
