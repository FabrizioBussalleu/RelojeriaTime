'use client';

// Editor no destructivo de una foto: recorte, brillo y contraste. Se guardan como parámetros y
// Cloudinary los aplica al servir la imagen; el original queda intacto.
import { useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Loader2, RotateCcw } from 'lucide-react';
import { buildImageUrl, type ImageCrop } from '@/lib/cloudinary/url';
import { cn } from '@/lib/utils';
import { Dialog } from '../Dialog';
import { buttonClass } from '../ui';

export type EditableImage = {
  public_id: string;
  width: number | null;
  height: number | null;
  crop: ImageCrop | null;
  brightness: number;
  contrast: number;
};

// El cropper trabaja sobre una copia de hasta 1600 px; el recorte se guarda en píxeles del original.
const WORKING_WIDTH = 1600;

const ASPECTS = [
  { key: 'square', label: 'Cuadrado 1:1', hint: 'Como se ve en la tienda', value: () => 1 },
  { key: 'portrait', label: 'Vertical 4:5', value: () => 4 / 5 },
  { key: 'original', label: 'Proporción original', value: (image: EditableImage) => (image.width && image.height ? image.width / image.height : 1) },
] as const;

type AspectKey = (typeof ASPECTS)[number]['key'];

function initialAspect(image: EditableImage): AspectKey {
  if (!image.crop) return 'square';
  const ratio = image.crop.width / image.crop.height;
  if (Math.abs(ratio - 1) < 0.02) return 'square';
  if (Math.abs(ratio - 0.8) < 0.02) return 'portrait';
  return 'original';
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        <span className="tabular-nums text-foreground">{value > 0 ? `+${value}` : value}</span>
      </span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-white" />
    </label>
  );
}

export function ImageEditor({ image, onSave, onClose }: { image: EditableImage; onSave: (edits: Pick<EditableImage, 'crop' | 'brightness' | 'contrast'>) => void; onClose: () => void }) {
  const scale = image.width ? Math.min(1, WORKING_WIDTH / image.width) : 1;
  const source = useMemo(() => buildImageUrl(image.public_id, {}, { width: WORKING_WIDTH, quality: 90 }), [image.public_id]);

  const [aspectKey, setAspectKey] = useState<AspectKey>(() => initialAspect(image));
  const [cropEnabled, setCropEnabled] = useState(Boolean(image.crop));
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState<ImageCrop | null>(image.crop);
  const [brightness, setBrightness] = useState(image.brightness);
  const [contrast, setContrast] = useState(image.contrast);
  const [cropperKey, setCropperKey] = useState(0);

  const aspect = ASPECTS.find((item) => item.key === aspectKey)!.value(image);
  const edits = { crop: cropEnabled ? crop : null, brightness, contrast };

  // Vista final: la URL real de Cloudinary, con una pausa para no pedir una imagen por cada movimiento.
  const finalUrl = buildImageUrl(image.public_id, edits, { width: 640 });
  const [preview, setPreview] = useState({ url: finalUrl, loading: true });
  useEffect(() => {
    const timer = setTimeout(() => setPreview((current) => (current.url === finalUrl ? current : { url: finalUrl, loading: true })), 500);
    return () => clearTimeout(timer);
  }, [finalUrl]);

  const initialPixels = image.crop
    ? { x: image.crop.x * scale, y: image.crop.y * scale, width: image.crop.width * scale, height: image.crop.height * scale }
    : undefined;

  // Antes de que cargue la foto el recorte puede llegar sin medidas (NaN): se ignora.
  const onCropComplete = (_area: Area, pixels: Area) => {
    if (![pixels.x, pixels.y, pixels.width, pixels.height].every(Number.isFinite) || pixels.width <= 0 || pixels.height <= 0) return;
    setCrop({ x: Math.max(0, Math.round(pixels.x / scale)), y: Math.max(0, Math.round(pixels.y / scale)), width: Math.round(pixels.width / scale), height: Math.round(pixels.height / scale) });
  };

  const reset = () => {
    setBrightness(0);
    setContrast(0);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setCropEnabled(false);
    setCrop(null);
    setCropperKey((key) => key + 1);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Editar foto"
      description="Los cambios no modifican el archivo original: se aplican al mostrar la foto."
      size="xl"
      footer={
        <>
          <button type="button" className={cn(buttonClass.secondary, 'mr-auto')} onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Restablecer
          </button>
          <button type="button" className={buttonClass.secondary} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={buttonClass.primary} onClick={() => onSave(edits)} disabled={cropEnabled && !crop}>
            Aplicar
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          <div className="relative h-[46vh] min-h-72 bg-black">
            {cropEnabled ? (
              <Cropper
                key={`${cropperKey}-${aspectKey}`}
                image={source}
                crop={position}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setPosition}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                initialCroppedAreaPixels={cropperKey === 0 && aspectKey === initialAspect(image) ? initialPixels : undefined}
                style={{ mediaStyle: { filter: `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})` } }}
                mediaProps={{ alt: 'Foto a recortar' }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- vista de trabajo sin recorte
              <img
                src={source}
                alt="Foto sin recorte"
                className="absolute inset-0 h-full w-full object-contain"
                style={{ filter: `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})` }}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={!cropEnabled}
              onClick={() => setCropEnabled(false)}
              className={cn('border px-3 py-1.5 text-sm', !cropEnabled ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              Sin recorte
            </button>
            {ASPECTS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={cropEnabled && aspectKey === option.key}
                onClick={() => {
                  setCropEnabled(true);
                  setAspectKey(option.key);
                }}
                title={'hint' in option ? option.hint : undefined}
                className={cn(
                  'border px-3 py-1.5 text-sm',
                  cropEnabled && aspectKey === option.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {cropEnabled ? (
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Zoom</span>
              <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="mt-2 w-full accent-white" />
            </label>
          ) : null}
          <p className="text-xs text-muted-foreground">Arrastra la foto para encuadrarla. En la tienda las fotos se muestran cuadradas.</p>
        </div>

        <div className="space-y-5">
          <Slider label="Brillo" value={brightness} min={-99} max={100} onChange={setBrightness} />
          <Slider label="Contraste" value={contrast} min={-100} max={100} onChange={setContrast} />
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Resultado final (Cloudinary)</p>
            <div className="relative aspect-square border border-border bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- la URL ya viene transformada por Cloudinary */}
              <img
                src={preview.url}
                alt="Resultado final de la foto"
                className="h-full w-full object-contain"
                onLoad={() => setPreview((current) => ({ ...current, loading: false }))}
                onError={() => setPreview((current) => ({ ...current, loading: false }))}
              />
              {preview.loading ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin" aria-label="Generando vista final" />
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Es exactamente la imagen que verán los clientes (la de la izquierda es una aproximación).</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
