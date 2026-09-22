// Punta a punta de "Compras al por mayor": vitrina sin precios, lista de cotización y la marca
// "solo al por mayor" (un reloj de prueba que se crea y se borra al terminar). Funciona con el
// catálogo que haya publicado: no depende de los productos de demostración.
import { chromium } from 'playwright';
import { axeSource, BASE_URL, OUTPUT_DIR, sql } from './support.mjs';

const base = BASE_URL;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const a11y = {};
const errors = [];
const NOMBRE = 'ZZZ Prueba Por Mayor';
const SLUG = 'zzz-prueba-por-mayor';

async function audit(page, name) {
  await page.addScriptTag({ content: axeSource });
  a11y[name] = await page.evaluate(async () =>
    (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(
      (violation) => `${violation.impact}: ${violation.id} (${violation.nodes.length}) ${violation.nodes[0]?.target?.join(' ')}`
    )
  );
}

// ISR: la primera visita sirve la copia guardada y dispara la regeneración.
async function esperarEnPagina(ruta, texto, presente = true, intentos = 30) {
  for (let intento = 0; intento < intentos; intento += 1) {
    const html = await (await fetch(`${base}${ruta}`, { cache: 'no-store' })).text();
    if (html.includes(texto) === presente) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

await sql(`delete from public.products where slug = '${SLUG}'`);
const [prueba] = await sql(`insert into public.products (slug, name, description, price, status, wholesale_only, position, wholesale_position)
  values ('${SLUG}', '${NOMBRE}', 'Reloj de prueba de la venta al por mayor.', 100, 'active', true, 9999, 9999) returning id`);
await sql(`insert into public.product_variants (product_id, label, stock, position) values ('${prueba.id}', 'Única', 50, 1)`);

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-PE' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text().slice(0, 200)}`);
  });

  // Filtrado, a nivel de datos: la tienda excluye los "solo al por mayor"; la vitrina de por mayor
  // los incluye. (La página guarda copia por ISR, así que el conteo se comprueba en la base.)
  const [conteos] = await sql(`select
    (select count(*) from public.products where status = 'active' and not wholesale_only) as tienda,
    (select count(*) from public.products where status = 'active') as por_mayor,
    (select count(*) from public.products where status = 'active' and wholesale_only) as exclusivos`);
  check('la tienda excluye los exclusivos de por mayor', Number(conteos.por_mayor) === Number(conteos.tienda) + Number(conteos.exclusivos), JSON.stringify(conteos));
  check('el exclusivo no se cuela en la tienda', await esperarEnPagina('/', NOMBRE, false));
  const enVitrina = await esperarEnPagina('/por-mayor', NOMBRE, true, 6);

  await page.goto(`${base}/por-mayor`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUTPUT_DIR}/por-mayor-desktop.png`, fullPage: true, animations: 'disabled' });
  await audit(page, 'por-mayor');

  // Los títulos se ven en mayúsculas por CSS: se compara sin distinguir.
  const texto = (await page.locator('main').innerText()).toLowerCase();
  check('sin precios a la vista', !/s\/\s?\d/.test(texto), texto.match(/s\/\s?[\d.,]+/g)?.join(', '));
  check('explica los tres pasos', texto.includes('arma tu lista') && texto.includes('pide la cotización') && texto.includes('coordinamos la entrega'));
  if (enVitrina) check('marca los exclusivos de por mayor', (await page.getByText('Exclusivo por mayor').count()) >= 1);

  // Lista de cotización con el primer modelo de la vitrina (sea cual sea el catálogo).
  const primera = page.locator('main ul li article').first();
  const modelo = (await primera.locator('h3').innerText()).trim();
  const campo = primera.locator('input[type=number]');
  await primera.getByRole('button', { name: /^Agregar una unidad/ }).click();
  await campo.fill('40');
  await page.waitForTimeout(400);
  const enlace = decodeURIComponent((await page.getByRole('link', { name: 'Solicitar cotización' }).getAttribute('href')) ?? '');
  check('la cotización lista modelo y unidades', enlace.toLowerCase().includes(modelo.toLowerCase()) && enlace.includes('40 unidades'), enlace.slice(0, 140));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('la lista sobrevive a recargar', (await page.locator('main ul li article').first().locator('input[type=number]').inputValue()) === '40');
  await page.getByRole('button', { name: /vaciar la lista/i }).click();
  await page.waitForTimeout(400);
  check('se puede vaciar la lista', (await page.getByRole('link', { name: 'Solicitar cotización' }).count()) === 0);

  // Ficha de un exclusivo: sin precio ni carrito
  await page.goto(`${base}/producto/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const ficha = (await page.locator('main').innerText()).toLowerCase();
  await audit(page, 'ficha-por-mayor');
  check('la ficha del exclusivo no vende al detalle', (await page.getByRole('button', { name: 'Agregar al carrito' }).count()) === 0 && !/s\/\s?\d/.test(ficha));
  check('la ficha invita a cotizar', ficha.includes('cotización'));

  // El menú y el footer llevan a la página
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('el footer enlaza a por mayor', (await page.locator('footer a[href="/por-mayor"]').count()) === 1);
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: 'Compras al por mayor' }).click();
  await page.waitForURL('**/por-mayor', { timeout: 8000 }).catch(() => {});
  check('el menú lleva a por mayor', new URL(page.url()).pathname === '/por-mayor', page.url());
} catch (error) {
  check('flujo completo sin excepciones', false, error.message.split('\n')[0]);
} finally {
  await browser.close();
  await sql(`delete from public.products where slug = '${SLUG}'`);
  const [queda] = await sql(`select count(*) as n from public.products where slug = '${SLUG}'`);
  check('limpieza: sin el reloj de prueba', Number(queda.n) === 0);
}

for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}${!result.ok && result.detail ? ` — ${result.detail}` : ''}`);
console.log(`\n${results.filter((result) => result.ok).length}/${results.length} OK`);
console.log('axe:', JSON.stringify(a11y, null, 1));
console.log('errores de consola:', errors.length ? [...new Set(errors)] : 'ninguno');
process.exitCode = results.every((result) => result.ok) ? 0 : 1;
