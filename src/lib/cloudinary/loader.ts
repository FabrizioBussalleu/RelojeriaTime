'use client';

import { cloudinaryLoaderUrl } from './url';

// Loader global de next/image: las imágenes de producto se sirven desde Cloudinary con el ancho
// exacto que pide cada breakpoint. Las rutas locales (logos en /public) pasan sin cambios.
export default function cloudinaryLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (src.startsWith('/') || src.startsWith('http')) return src;
  return cloudinaryLoaderUrl(src, width, quality);
}
