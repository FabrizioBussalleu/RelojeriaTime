// Subida directa del navegador a Cloudinary con parámetros firmados por el servidor.
type Signature = { uploadUrl: string; apiKey: string; params: Record<string, string | number>; signature: string };

export type UploadedImage = { public_id: string; width: number; height: number };

async function getSignature(productId: string): Promise<Signature> {
  const response = await fetch('/api/admin/cloudinary/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  if (response.status === 401) throw new Error('Tu sesión expiró. Vuelve a ingresar.');
  if (!response.ok) throw new Error('No se pudo preparar la subida.');
  return response.json();
}

export async function uploadProductImage(productId: string, file: File, onProgress: (percent: number) => void): Promise<UploadedImage> {
  const signature = await getSignature(productId);
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(signature.params)) form.append(key, String(value));
  form.append('api_key', signature.apiKey);
  form.append('signature', signature.signature);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', signature.uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(request.responseText);
        } catch {
          return null;
        }
      })();
      if (request.status >= 200 && request.status < 300 && body?.public_id) {
        resolve({ public_id: body.public_id, width: body.width, height: body.height });
      } else {
        reject(new Error(body?.error?.message ? `Cloudinary: ${body.error.message}` : 'La subida falló.'));
      }
    };
    request.onerror = () => reject(new Error('Sin conexión con Cloudinary.'));
    request.send(form);
  });
}
