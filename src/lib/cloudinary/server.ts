import 'server-only';

import { createHash } from 'node:crypto';
import { requireEnv } from '@/lib/env';

// Integración de servidor con Cloudinary. El API secret nunca sale de aquí: el navegador sube con
// parámetros firmados y todos los borrados pasan por la Admin API.

const API_BASE = 'https://api.cloudinary.com/v1_1';
// Las subidas quedan marcadas hasta que un producto guardado las referencia; el cron borra las huérfanas.
export const PENDING_UPLOAD_TAG = 'time-pending';
const MAX_IDS_PER_DELETE = 100;

function config() {
  return {
    cloudName: requireEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'),
    apiKey: requireEnv('CLOUDINARY_API_KEY'),
    apiSecret: requireEnv('CLOUDINARY_API_SECRET'),
    folder: process.env.CLOUDINARY_FOLDER?.trim() || 'imagenes',
  };
}

// Carpeta de un producto: asset_folder (navegación en la consola) y prefijo del public_id (borrado por prefijo).
export function productFolder(productId: string) {
  return `${config().folder}/products/${productId}`;
}

// Firma de Cloudinary: parámetros ordenados "k=v&k2=v2" + secret, en SHA-1.
export function signParams(params: Record<string, string | number | boolean>) {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(toSign + config().apiSecret).digest('hex');
}

// Parámetros para que el panel suba directo a Cloudinary sin conocer el secret (válidos ~1 hora).
export function createProductUploadSignature(productId: string) {
  const { cloudName, apiKey } = config();
  const folder = productFolder(productId);
  const params = {
    asset_folder: folder,
    public_id_prefix: `${folder}/`,
    tags: PENDING_UPLOAD_TAG,
    timestamp: Math.floor(Date.now() / 1000),
  };
  return {
    uploadUrl: `${API_BASE}/${cloudName}/image/upload`,
    apiKey,
    params,
    signature: signParams(params),
  };
}

async function adminRequest<T>(method: 'GET' | 'DELETE' | 'POST', path: string, query?: URLSearchParams): Promise<T> {
  const { cloudName, apiKey, apiSecret } = config();
  const url = `${API_BASE}/${cloudName}${path}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message ?? `Cloudinary respondió ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

type DeleteResult = { deleted: Record<string, string> };

// Destroy en lote. "not_found" cuenta como borrado: el objetivo es que el asset no exista.
export async function destroyAssets(publicIds: string[]): Promise<{ removed: string[]; failed: Record<string, string> }> {
  const removed: string[] = [];
  const failed: Record<string, string> = {};
  for (let start = 0; start < publicIds.length; start += MAX_IDS_PER_DELETE) {
    const batch = publicIds.slice(start, start + MAX_IDS_PER_DELETE);
    const query = new URLSearchParams({ invalidate: 'true' });
    batch.forEach((id) => query.append('public_ids[]', id));
    const { deleted } = await adminRequest<DeleteResult>('DELETE', '/resources/image/upload', query);
    for (const id of batch) {
      const status = deleted[id];
      if (status === 'deleted' || status === 'not_found') removed.push(id);
      else failed[id] = status ?? 'sin respuesta';
    }
  }
  return { removed, failed };
}

// Borra todo lo que quede bajo la carpeta de un producto y la carpeta misma.
export async function destroyProductFolder(productId: string) {
  const folder = productFolder(productId);
  await adminRequest<DeleteResult>('DELETE', '/resources/image/upload', new URLSearchParams({ prefix: `${folder}/`, invalidate: 'true' }));
  try {
    await adminRequest('DELETE', `/folders/${folder.split('/').map(encodeURIComponent).join('/')}`);
  } catch {
    // La carpeta puede no existir (producto sin imágenes) o seguir en uso; no es un error.
  }
}

type TaggedResources = { resources: { public_id: string; created_at: string }[]; next_cursor?: string };

export async function listPendingUploads() {
  const resources: TaggedResources['resources'] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ max_results: '500' });
    if (cursor) query.set('next_cursor', cursor);
    const page = await adminRequest<TaggedResources>('GET', `/resources/image/tags/${PENDING_UPLOAD_TAG}`, query);
    resources.push(...page.resources);
    cursor = page.next_cursor;
  } while (cursor);
  return resources;
}
