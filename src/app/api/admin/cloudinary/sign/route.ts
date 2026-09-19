import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { createProductUploadSignature } from '@/lib/cloudinary/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Firma subidas directas del panel a la carpeta de un producto. Solo para administradores.
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { productId?: unknown } | null;
  const productId = typeof body?.productId === 'string' ? body.productId : '';
  if (!UUID.test(productId)) {
    return NextResponse.json({ error: 'productId inválido.' }, { status: 400 });
  }

  return NextResponse.json(createProductUploadSignature(productId), { headers: { 'Cache-Control': 'no-store' } });
}
