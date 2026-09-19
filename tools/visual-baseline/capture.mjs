// Captura todas las vistas en todos los viewports contra una app ya levantada.
//
//   node capture.mjs --base-url http://localhost:4173 --out baseline
//   node capture.mjs --base-url http://localhost:3000 --out output/current --offline
//
// Opciones: --only home,checkout   --viewports mobile,desktop   --offline (no descarga nada nuevo)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { SUPABASE_URL, installNetwork, loadFixtures } from './lib/network.mjs';
import { VIEWPORTS, VIEWS } from './views.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(ROOT, 'fixtures');
const CACHE_DIR = join(ROOT, '.cache', 'external');
const SETTLE_MS = 2000; // la animación más larga del legado (hero) termina a los 1,4 s

const { values: args } = parseArgs({
  options: {
    'base-url': { type: 'string', default: 'http://localhost:4173' },
    out: { type: 'string', default: 'output/current' },
    only: { type: 'string' },
    viewports: { type: 'string' },
    offline: { type: 'boolean', default: false },
  },
});

const outDir = resolve(ROOT, args.out);
const selectedViews = args.only ? VIEWS.filter((view) => args.only.split(',').includes(view.name)) : VIEWS;
const selectedViewports = args.viewports ? args.viewports.split(',') : Object.keys(VIEWPORTS);
const fixtures = loadFixtures(FIXTURES_DIR);

// El legado lee esta global antes de pedir /.netlify/functions/runtime-config.
const runtimeConfig = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: 'fixture-anon-key',
  cloudinary: { cloudName: null, uploadPreset: null, baseFolder: null },
};

// framer-motion deja `opacity: 0` en el estilo en línea mientras un `whileInView` no se dispara.
// Se ignoran los focus guards de Radix, que son invisibles a propósito.
const countHidden = () =>
  Array.from(document.querySelectorAll('[style*="opacity"]:not([data-radix-focus-guard])')).filter((element) => element.style.opacity === '0').length;

// Recorre la página para disparar los `whileInView` y reintenta sobre los que sigan ocultos:
// un solo barrido con tiempos fijos no es fiable (depende de cuándo llegan los datos).
async function settle(page) {
  await page.waitForLoadState('networkidle');
  const stillHidden = await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
    const frames = () => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const hidden = () =>
      Array.from(document.querySelectorAll('[style*="opacity"]:not([data-radix-focus-guard])')).filter((element) => element.style.opacity === '0');

    for (let pass = 0; pass < 5; pass += 1) {
      const step = Math.max(200, Math.floor(window.innerHeight / 2));
      for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await frames();
        await delay(60);
      }
      for (const element of hidden()) {
        element.scrollIntoView({ block: 'center' });
        await frames();
        await delay(150);
      }
      if (hidden().length === 0) break;
    }
    window.scrollTo(0, 0);
    await document.fonts.ready;
    return hidden().length;
  });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.waitForTimeout(SETTLE_MS);
  return stillHidden;
}

async function captureView(browser, view, viewportName) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewportName],
    deviceScaleFactor: 1,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const blocked = new Set();
  const consoleErrors = [];

  await installNetwork(context, {
    baseUrl: args['base-url'],
    fixtures,
    fixturesDir: FIXTURES_DIR,
    cacheDir: CACHE_DIR,
    offline: args.offline,
    blocked,
  });
  await context.addInitScript(
    ({ config, cart }) => {
      window.__DJ_RUNTIME_CONFIG__ = config;
      window.localStorage.clear();
      if (cart) window.localStorage.setItem('cart', JSON.stringify(cart));
    },
    { config: runtimeConfig, cart: view.withCart ? fixtures.cart : null }
  );

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.goto(new URL(view.path, args['base-url']).toString(), { waitUntil: 'load' });
  if (view.ready) await view.ready(page);
  await settle(page);
  if (view.action) {
    await view.action(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  }
  await page.mouse.move(0, 0);
  const hiddenElements = await page.evaluate(countHidden);

  const file = join(outDir, `${view.name}.${viewportName}.png`);
  await page.screenshot({ path: file, fullPage: view.fullPage, animations: 'disabled', caret: 'hide', scale: 'css' });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await context.close();

  return { view: view.name, viewport: viewportName, file: `${view.name}.${viewportName}.png`, pageHeight, hiddenElements, blocked: [...blocked], consoleErrors };
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
const browserVersion = browser.version();
try {
  for (const view of selectedViews) {
    for (const viewportName of selectedViewports) {
      const result = await captureView(browser, view, viewportName);
      results.push(result);
      const notes = [
        result.blocked.length ? `${result.blocked.length} bloqueadas` : null,
        result.consoleErrors.length ? `${result.consoleErrors.length} errores de consola` : null,
        result.hiddenElements ? `⚠ ${result.hiddenElements} elementos siguen ocultos` : null,
      ].filter(Boolean);
      console.log(`✓ ${result.file} (${result.pageHeight}px)${notes.length ? ` — ${notes.join(', ')}` : ''}`);
    }
  }
} finally {
  await browser.close();
}

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      baseUrl: args['base-url'],
      chromium: browserVersion,
      viewports: Object.fromEntries(selectedViewports.map((name) => [name, VIEWPORTS[name]])),
      captures: results,
    },
    null,
    2
  ) + '\n'
);
console.log(`\n${results.length} capturas en ${outDir}`);
