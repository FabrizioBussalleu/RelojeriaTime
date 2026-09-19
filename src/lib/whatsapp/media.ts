// WhatsApp solo acepta imágenes JPEG o PNG de hasta 5 MB: se piden a Cloudinary en JPEG y a 1200 px,
// conservando las ediciones del admin (recorte, brillo, contraste).
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

// `src` tiene el formato de CatalogImage.src: "<public_id>" o "<public_id>?e=<ediciones>".
export function whatsappImageUrl(src: string, width = 1200) {
  if (!CLOUD_NAME) throw new Error('Falta NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.');
  const [publicId, query] = src.split('?e=');
  const edits = query ? `${decodeURIComponent(query)}/` : '';
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${edits}f_jpg,q_auto:good,c_limit,w_${width}/${path}.jpg`;
}
