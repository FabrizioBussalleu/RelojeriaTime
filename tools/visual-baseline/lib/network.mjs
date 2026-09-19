// Enrutamiento de red para capturas deterministas:
// - Supabase se sustituye por un mock mínimo de PostgREST que lee los fixtures JSON.
// - Las imágenes de fixtures se sirven desde disco.
// - Fuentes de Google y fotos de Unsplash se cachean en .cache/ tras la primera descarga.
// - Cualquier otro host externo se bloquea y queda registrado en el manifest.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export const SUPABASE_URL = 'https://supabase.fixtures.invalid';
export const FIXTURE_ASSETS_HOST = 'fixtures.invalid';
const CACHEABLE_HOSTS = new Set(['images.unsplash.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const MIME_BY_EXTENSION = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const DROPPED_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'date', 'age', 'set-cookie']);

export function loadFixtures(fixturesDir) {
  const read = (name) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
  return {
    tables: {
      products: read('products.json'),
      orders: read('orders.json'),
      order_items: read('order_items.json'),
    },
    cart: read('cart.json'),
  };
}

const unquote = (value) => value.replace(/^"(.*)"$/, '$1');

const compare = (actual, expected) => {
  const numeric = Number(expected);
  if (typeof actual === 'number' && !Number.isNaN(numeric)) return actual - numeric;
  return String(actual).localeCompare(String(expected));
};

const OPERATORS = {
  eq: (actual, value) => String(actual) === value,
  neq: (actual, value) => String(actual) !== value,
  gt: (actual, value) => compare(actual, value) > 0,
  gte: (actual, value) => compare(actual, value) >= 0,
  lt: (actual, value) => compare(actual, value) < 0,
  lte: (actual, value) => compare(actual, value) <= 0,
  is: (actual, value) => (value === 'null' ? actual === null : String(actual) === value),
  in: (actual, value) =>
    value
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map(unquote)
      .includes(String(actual)),
};

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset']);

// Implementa el subconjunto de PostgREST que usa el storefront legado (eq/gt/in/order/single).
export function queryTable(rows, searchParams) {
  let result = [...rows];
  for (const [column, expression] of searchParams) {
    if (RESERVED_PARAMS.has(column)) continue;
    const match = /^(not\.)?([a-z]+)\.(.*)$/.exec(expression);
    if (!match || !OPERATORS[match[2]]) {
      throw new Error(`Filtro PostgREST no soportado en el mock: ${column}=${expression}`);
    }
    const [, negate, operator, value] = match;
    result = result.filter((row) => Boolean(negate) !== OPERATORS[operator](row[column], value));
  }

  const order = searchParams.get('order');
  if (order) {
    const clauses = order.split(',').map((clause) => {
      const [column, direction = 'asc'] = clause.split('.');
      return { column, descending: direction === 'desc' };
    });
    result.sort((a, b) => {
      for (const { column, descending } of clauses) {
        const delta = compare(a[column], b[column]);
        if (delta !== 0) return descending ? -delta : delta;
      }
      return 0;
    });
  }

  const offset = Number(searchParams.get('offset') ?? 0);
  const limit = searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined;
  return result.slice(offset, limit === undefined ? undefined : offset + limit);
}

function json(route, status, body, extraHeaders = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'access-control-allow-origin': '*', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

async function handleSupabase(route, request, fixtures) {
  if (request.method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      },
    });
  }

  const url = new URL(request.url());
  const restMatch = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (!restMatch) {
    return json(route, 401, { message: 'El mock de Supabase no implementa auth ni storage.' });
  }
  if (request.method() !== 'GET') {
    return json(route, 405, { message: 'El mock de Supabase es de solo lectura.' });
  }

  const rows = fixtures.tables[restMatch[1]];
  if (!rows) {
    return json(route, 404, { code: '42P01', message: `relation "${restMatch[1]}" does not exist` });
  }

  const result = queryTable(rows, url.searchParams);
  const wantsSingle = (request.headers()['accept'] ?? '').includes('application/vnd.pgrst.object+json');
  if (wantsSingle) {
    if (result.length !== 1) {
      return json(route, 406, {
        code: 'PGRST116',
        details: `The result contains ${result.length} rows`,
        hint: null,
        message: 'JSON object requested, multiple (or no) rows returned',
      });
    }
    return json(route, 200, result[0]);
  }
  return json(route, 200, result, { 'content-range': `0-${Math.max(result.length - 1, 0)}/${result.length}` });
}

async function handleFixtureAsset(route, request, fixturesDir) {
  const { pathname } = new URL(request.url());
  const file = join(fixturesDir, ...pathname.split('/').filter(Boolean));
  if (!existsSync(file)) {
    return route.fulfill({ status: 404, body: 'fixture no encontrado' });
  }
  return route.fulfill({
    status: 200,
    contentType: MIME_BY_EXTENSION[extname(file)] ?? 'application/octet-stream',
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000' },
    body: readFileSync(file),
  });
}

async function handleCached(route, request, cacheDir, offline, blocked) {
  const key = createHash('sha1').update(request.url()).digest('hex');
  const bodyPath = join(cacheDir, `${key}.body`);
  const metaPath = join(cacheDir, `${key}.json`);

  if (!existsSync(bodyPath)) {
    if (offline) {
      blocked.add(`[sin caché en --offline] ${request.url()}`);
      return route.abort('blockedbyclient');
    }
    const response = await route.fetch();
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase()))
    );
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(bodyPath, await response.body());
    writeFileSync(metaPath, JSON.stringify({ url: request.url(), status: response.status(), headers }, null, 2));
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  return route.fulfill({ status: meta.status, headers: meta.headers, body: readFileSync(bodyPath) });
}

export async function installNetwork(context, { baseUrl, fixtures, fixturesDir, cacheDir, offline, blocked }) {
  const appOrigin = new URL(baseUrl).origin;
  const supabaseOrigin = new URL(SUPABASE_URL).origin;

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (url.origin === appOrigin) return route.continue();
    if (url.origin === supabaseOrigin) return handleSupabase(route, request, fixtures);
    if (url.hostname === FIXTURE_ASSETS_HOST) return handleFixtureAsset(route, request, fixturesDir);
    if (CACHEABLE_HOSTS.has(url.hostname)) return handleCached(route, request, cacheDir, offline, blocked);

    blocked.add(request.url());
    return route.abort('blockedbyclient');
  });
}
