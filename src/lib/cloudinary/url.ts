// URLs de entrega de Cloudinary. Las ediciones del admin (recorte, brillo, contraste) se guardan
// como parámetros y se aplican aquí: el original nunca se modifica.
export type ImageCrop = { x: number; y: number; width: number; height: number };

export type ImageEdits = {
  crop?: ImageCrop | null;
  brightness?: number | null;
  contrast?: number | null;
};

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

function editSteps({ crop, brightness, contrast }: ImageEdits): string[] {
  const steps: string[] = [];
  if (crop) {
    steps.push(`c_crop,x_${Math.round(crop.x)},y_${Math.round(crop.y)},w_${Math.round(crop.width)},h_${Math.round(crop.height)}`);
  }
  if (brightness) steps.push(`e_brightness:${Math.round(brightness)}`);
  if (contrast) steps.push(`e_contrast:${Math.round(contrast)}`);
  return steps;
}

export function buildImageUrl(publicId: string, edits: ImageEdits = {}, { width, quality }: { width?: number; quality?: number } = {}) {
  if (!CLOUD_NAME) throw new Error('Falta NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.');
  const delivery = [`f_auto`, `q_${quality ?? 'auto'}`, ...(width ? ['c_limit', `w_${Math.round(width)}`] : [])].join(',');
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${[...editSteps(edits), delivery].join('/')}/${path}`;
}

// Valor para <Image src>: el loader (./loader.ts) lo convierte en URL con el ancho que pide Next.
// Formato: "<public_id>" o "<public_id>?e=<ediciones>" para conservar recorte, brillo y contraste.
export function cloudinaryImageSrc(publicId: string, edits: ImageEdits = {}) {
  const steps = editSteps(edits);
  return steps.length ? `${publicId}?e=${encodeURIComponent(steps.join('/'))}` : publicId;
}

export function cloudinaryLoaderUrl(src: string, width: number, quality?: number) {
  const [publicId, query] = src.split('?e=');
  if (!CLOUD_NAME) throw new Error('Falta NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.');
  const edits = query ? decodeURIComponent(query) : '';
  const delivery = `f_auto,q_${quality ?? 'auto'},c_limit,w_${width}`;
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${edits ? `${edits}/` : ''}${delivery}/${path}`;
}

// Imagen para compartir (WhatsApp, Facebook): 1200×630 en JPG liviano, con relleno del color del borde
// para que la foto completa entre en la vista previa grande.
export function cloudinaryShareUrl(src: string) {
  const [publicId, query] = src.split('?e=');
  if (!CLOUD_NAME) throw new Error('Falta NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.');
  const edits = query ? `${decodeURIComponent(query)}/` : '';
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${edits}c_pad,w_1200,h_630,b_auto:border/f_jpg,q_auto:good/${path}`;
}
