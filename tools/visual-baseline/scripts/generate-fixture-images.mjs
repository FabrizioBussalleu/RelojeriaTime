// Genera imágenes de relojes simples y deterministas para los fixtures.
// Se dibujan por código para no depender de fotos externas (licencias, CDN, cambios de bytes).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images');
const SIZE = 800;

const PALETTES = [
  { bg: [236, 232, 225], caseColor: [40, 40, 42], dial: [250, 250, 248], hands: [20, 20, 20] },
  { bg: [28, 30, 36], caseColor: [196, 170, 120], dial: [18, 38, 64], hands: [230, 220, 190] },
  { bg: [214, 222, 216], caseColor: [150, 154, 158], dial: [30, 30, 30], hands: [240, 240, 240] },
  { bg: [60, 44, 38], caseColor: [210, 210, 212], dial: [236, 228, 210], hands: [60, 40, 30] },
  { bg: [245, 245, 245], caseColor: [15, 15, 15], dial: [15, 15, 15], hands: [220, 60, 40] },
  { bg: [30, 52, 48], caseColor: [200, 200, 204], dial: [24, 70, 60], hands: [250, 250, 250] },
  { bg: [222, 210, 196], caseColor: [120, 90, 60], dial: [248, 242, 230], hands: [40, 30, 20] },
  { bg: [16, 16, 18], caseColor: [90, 92, 98], dial: [44, 46, 52], hands: [255, 180, 60] },
];

const clamp = (value) => Math.max(0, Math.min(1, value));

function blend(png, x, y, color, alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const index = (y * SIZE + x) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    png.data[index + channel] = Math.round(png.data[index + channel] * (1 - alpha) + color[channel] * alpha);
  }
  png.data[index + 3] = 255;
}

// Rellena todos los píxeles cuya "distancia con signo" sea negativa, con 1px de antialiasing.
function fillShape(png, color, signedDistance) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      blend(png, x, y, color, clamp(0.5 - signedDistance(x + 0.5, y + 0.5)));
    }
  }
}

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

const ring = (cx, cy, outer, inner) => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(d - outer, inner - d);
};

const segment = (x1, y1, x2, y2, halfWidth) => (x, y) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) - halfWidth;
};

const roundedRect = (cx, cy, halfW, halfH, radius) => (x, y) => {
  const qx = Math.abs(x - cx) - halfW + radius;
  const qy = Math.abs(y - cy) - halfH + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};

function drawWatch(palette, variant) {
  const png = new PNG({ width: SIZE, height: SIZE });
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    png.data.set([...palette.bg, 255], i * 4);
  }

  const c = SIZE / 2;
  const radius = 210;
  const strapColor = palette.caseColor.map((value) => Math.round(value * 0.55));

  fillShape(png, strapColor, roundedRect(c, c, 95, 390, 40));
  fillShape(png, palette.caseColor, circle(c, c, radius + 28));
  fillShape(png, palette.caseColor, roundedRect(c + radius + 32, c, 16, 22, 6));
  fillShape(png, palette.dial, circle(c, c, radius));
  fillShape(png, palette.caseColor.map((value) => Math.min(255, value + 30)), ring(c, c, radius + 6, radius - 2));

  for (let hour = 0; hour < 12; hour += 1) {
    const angle = (hour / 12) * Math.PI * 2;
    const long = hour % 3 === 0;
    const r1 = radius - (long ? 48 : 30);
    const r2 = radius - 14;
    fillShape(
      png,
      palette.hands,
      segment(c + Math.sin(angle) * r1, c - Math.cos(angle) * r1, c + Math.sin(angle) * r2, c - Math.cos(angle) * r2, long ? 6 : 3)
    );
  }

  const hourAngle = ((variant * 1.7 + 10) / 12) * Math.PI * 2;
  const minuteAngle = ((variant * 7 + 8) / 60) * Math.PI * 2;
  fillShape(png, palette.hands, segment(c, c, c + Math.sin(hourAngle) * 110, c - Math.cos(hourAngle) * 110, 9));
  fillShape(png, palette.hands, segment(c, c, c + Math.sin(minuteAngle) * 165, c - Math.cos(minuteAngle) * 165, 6));
  fillShape(png, palette.hands, circle(c, c, 14));

  return PNG.sync.write(png);
}

mkdirSync(OUT_DIR, { recursive: true });
PALETTES.forEach((palette, index) => {
  const file = join(OUT_DIR, `watch-${String(index + 1).padStart(2, '0')}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, drawWatch(palette, index));
  console.log(`✓ ${file}`);
});
