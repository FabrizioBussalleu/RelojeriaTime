// Compara dos carpetas de capturas píxel a píxel y genera un reporte HTML.
//
//   node compare.mjs --baseline baseline --current output/current --out output/diff
//
// Sale con código 1 si alguna vista supera --max-ratio (por defecto 0,001 = 0,1 % de los píxeles),
// si cambian las dimensiones o si falta una captura.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    baseline: { type: 'string', default: 'baseline' },
    current: { type: 'string', default: 'output/current' },
    out: { type: 'string', default: 'output/diff' },
    'max-ratio': { type: 'string', default: '0.001' },
    'pixel-threshold': { type: 'string', default: '0.1' },
  },
});

const baselineDir = resolve(ROOT, args.baseline);
const currentDir = resolve(ROOT, args.current);
const outDir = resolve(ROOT, args.out);
const maxRatio = Number(args['max-ratio']);
const pixelThreshold = Number(args['pixel-threshold']);

const listPngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.png')).sort() : []);

// Copia una imagen sobre un lienzo más grande; el área sobrante queda magenta para que cuente como diferencia.
function padTo(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const padded = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) padded.data.set([255, 0, 255, 255], i * 4);
  PNG.bitblt(png, padded, 0, 0, png.width, png.height, 0, 0);
  return padded;
}

mkdirSync(outDir, { recursive: true });
const baselineFiles = listPngs(baselineDir);
const currentFiles = new Set(listPngs(currentDir));
const results = [];

for (const file of baselineFiles) {
  if (!currentFiles.has(file)) {
    results.push({ file, status: 'missing' });
    continue;
  }
  const expected = PNG.sync.read(readFileSync(join(baselineDir, file)));
  const actual = PNG.sync.read(readFileSync(join(currentDir, file)));
  const width = Math.max(expected.width, actual.width);
  const height = Math.max(expected.height, actual.height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(padTo(expected, width, height).data, padTo(actual, width, height).data, diff.data, width, height, {
    threshold: pixelThreshold,
  });
  const ratio = diffPixels / (width * height);
  const sizeChanged = expected.width !== actual.width || expected.height !== actual.height;
  const diffFile = file.replace(/\.png$/, '.diff.png');
  writeFileSync(join(outDir, diffFile), PNG.sync.write(diff));
  results.push({
    file,
    status: sizeChanged || ratio > maxRatio ? 'fail' : 'pass',
    diffPixels,
    ratio,
    expectedSize: `${expected.width}×${expected.height}`,
    actualSize: `${actual.width}×${actual.height}`,
    diffFile,
  });
}

for (const file of currentFiles) {
  if (!baselineFiles.includes(file)) results.push({ file, status: 'extra' });
}

const failed = results.filter((result) => result.status === 'fail' || result.status === 'missing');
const percent = (ratio) => `${(ratio * 100).toFixed(3)} %`;

for (const result of results) {
  const detail =
    result.status === 'missing' || result.status === 'extra'
      ? ''
      : ` ${percent(result.ratio)} (${result.diffPixels} px)${result.expectedSize !== result.actualSize ? ` tamaño ${result.expectedSize} → ${result.actualSize}` : ''}`;
  console.log(`${{ pass: '✓', fail: '✗', missing: '?', extra: '+' }[result.status]} ${result.file}${detail}`);
}

const rel = (dir, file) => relative(outDir, join(dir, file)).split('\\').join('/');
const rows = results
  .map((result) => {
    if (result.status === 'missing' || result.status === 'extra') {
      return `<tr class="${result.status}"><td>${result.file}</td><td colspan="4">${result.status === 'missing' ? 'Falta en la captura actual' : 'No existe en el baseline'}</td></tr>`;
    }
    return `<tr class="${result.status}">
  <td>${result.file}<br><small>${percent(result.ratio)} · ${result.diffPixels} px · ${result.expectedSize} → ${result.actualSize}</small></td>
  <td><a href="${rel(baselineDir, result.file)}"><img src="${rel(baselineDir, result.file)}" loading="lazy"></a></td>
  <td><a href="${rel(currentDir, result.file)}"><img src="${rel(currentDir, result.file)}" loading="lazy"></a></td>
  <td><a href="${result.diffFile}"><img src="${result.diffFile}" loading="lazy"></a></td>
</tr>`;
  })
  .join('\n');

writeFileSync(
  join(outDir, 'report.html'),
  `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Comparación visual</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; background: #fafafa; color: #111; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; text-align: left; }
  td img { width: 220px; max-height: 480px; object-fit: contain; object-position: top; background: #eee; }
  tr.pass td:first-child { border-left: 6px solid #2e7d32; }
  tr.fail td:first-child, tr.missing td:first-child { border-left: 6px solid #c62828; }
  tr.extra td:first-child { border-left: 6px solid #f9a825; }
</style></head><body>
<h1>Comparación visual</h1>
<p>${results.length - failed.length} de ${results.length} capturas dentro del umbral (${percent(maxRatio)}).</p>
<table><thead><tr><th>Vista</th><th>Baseline</th><th>Actual</th><th>Diferencias</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>
`
);
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ maxRatio, pixelThreshold, results }, null, 2) + '\n');

console.log(`\n${results.length - failed.length}/${results.length} dentro del umbral. Reporte: ${join(outDir, 'report.html')}`);
process.exitCode = failed.length ? 1 : 0;
