// Punta a punta de la tienda: catálogo, producto, carrito, checkout, pedido, seguimiento, Libro de
// Reclamaciones y accesibilidad (axe). Repone stock y borra los pedidos de prueba al terminar.
import { chromium } from 'playwright';
import { axeSource, BASE_URL, OUTPUT_DIR, sql } from './support.mjs';

const base = BASE_URL;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const a11y = {};

async function audit(page, name) {
  await page.addScriptTag({ content: axeSource });
  a11y[name] = await page.evaluate(async () =>
    (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(
      (violation) => `${violation.impact}: ${violation.id} (${violation.nodes.length}) ${violation.nodes[0]?.target?.join(' ')}`
    )
  );
}

const STOCK_SQL = `select
  (select stock from product_variants v join products p on p.id = v.product_id where p.slug = 'demo-aurora-40') as stock_a,
  (select stock from product_variants v join products p on p.id = v.product_id where p.slug = 'demo-norte-field' and v.label = '42 mm') as stock_n`;

// Para la prueba de "comprar la última unidad y volver atrás".
const [lastUnit] = await sql(`select v.id, v.stock from product_variants v join products p on p.id = v.product_id where p.slug = 'demo-clasico-36'`);

const browser = await chromium.launch();
const errors = [];
const newPage = async (viewport, tactil = false) => {
  // En táctil se emula un celular de verdad: así aplican las reglas CSS de "sin mouse" (hover: none).
  const context = await browser.newContext({ viewport, locale: 'es-PE', hasTouch: tactil, isMobile: tactil });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text().slice(0, 200)}`);
  });
  return page;
};
const settle = async (page) => {
  // Algunas páginas (el verificador de Cloudflare) mantienen conexiones abiertas: no siempre hay reposo.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, fullPage, animations: 'disabled' });

try {
  // Home, filtros y orden
  const desk = await newPage({ width: 1440, height: 900 });
  await desk.goto(`${base}/`);
  await settle(desk);
  await shot(desk, 'home-desktop');
  await audit(desk, 'home');
  const footerWhatsapp = desk.locator('footer a[href^="https://wa.me/"]');
  check('Footer: WhatsApp con ícono y sin número', (await footerWhatsapp.innerText()).trim() === 'WhatsApp' && (await footerWhatsapp.locator('svg').count()) === 1, await footerWhatsapp.innerText());
  check('Footer: crédito a Elaris enlaza a su web', (await desk.getByRole('link', { name: /elaris digital solutions/i }).getAttribute('href')) === 'https://elarisdigitalsolutions.com');
  const floating = desk.getByRole('link', { name: 'Escríbenos por WhatsApp' });
  const floatBox = await floating.boundingBox();
  check('Botón flotante de WhatsApp a la derecha', Boolean(floatBox) && floatBox.x + floatBox.width > 1440 - 40 && (await floating.evaluate((el) => getComputedStyle(el).position)) === 'fixed', JSON.stringify(floatBox));
  // Menú lateral: en computadora tampoco hay enlaces sueltos en la barra de arriba.
  check('Encabezado sin enlaces sueltos', (await desk.locator('header nav a').count()) === 0);
  await desk.getByRole('button', { name: 'Abrir menú' }).click();
  const menu = desk.getByRole('dialog');
  await menu.waitFor({ timeout: 5000 });
  check('El menú abre con los accesos rápidos', (await menu.getByRole('link', { name: 'Recibe novedades' }).count()) === 1 && (await menu.getByRole('link').count()) >= 6);
  // Los enlaces entran con una animación escalonada: se audita cuando ya terminó.
  await desk.waitForTimeout(1600);
  await audit(desk, 'menu');
  await desk.getByRole('button', { name: 'Cerrar menú' }).click();
  await desk.waitForTimeout(400);
  check('La X cierra el menú', (await desk.getByRole('dialog').count()) === 0);
  await desk.getByRole('button', { name: 'Abrir menú' }).click();
  await desk.getByRole('link', { name: 'Recibe novedades' }).click();
  await desk.waitForURL('**/registro', { timeout: 8000 }).catch(() => {});
  await desk.waitForTimeout(600);
  check('Desde el menú se llega a "Recibe novedades"', new URL(desk.url()).pathname === '/registro' && (await desk.getByRole('dialog').count()) === 0, desk.url());
  await desk.goto(`${base}/`);
  await settle(desk);

  const names = await desk.locator('#catalogo article h3').allInnerTexts();
  check('Home lista los 8 relojes demo', names.length === 8, names.join(', '));
  check('El agotado aparece al final', /heritage bronce/i.test(names.at(-1) ?? ''), names.at(-1));
  check(
    'Badges "Agotado" y "Oferta" visibles',
    (await desk.getByText('Agotado', { exact: true }).count()) >= 1 && (await desk.getByText('Oferta', { exact: true }).count()) === 1
  );
  check('La home no muestra filtros', (await desk.locator('#catalogo select').count()) === 0);
  const heroBorder = await desk.locator('section[aria-labelledby="hero-titulo"]').evaluate((el) => getComputedStyle(el).borderBottomWidth);
  check('Sin línea debajo del hero', heroBorder === '0px', heroBorder);
  check('Sin compra rápida en productos con variantes', (await desk.getByRole('button', { name: 'Agregar Norte Field al carrito' }).count()) === 0);

  // Ficha con variantes
  await desk.goto(`${base}/producto/demo-norte-field`);
  await settle(desk);
  await shot(desk, 'producto-desktop');
  await audit(desk, 'producto');
  await desk.getByText('42 mm', { exact: true }).click();
  check('Elegir variante cambia el precio (S/ 660)', /S\/\s*660\.00/.test(await desk.locator('main').innerText()));
  await desk.getByRole('button', { name: 'Agregar al carrito' }).click();
  await desk.getByRole('dialog').waitFor();
  await desk.waitForTimeout(500);
  await shot(desk, 'carrito-desktop', false);
  await audit(desk, 'carrito');
  check('El carrito es un diálogo con título', (await desk.getByRole('dialog', { name: /tu carrito \(1\)/i }).count()) === 1);
  await desk.keyboard.press('Escape');
  await desk.waitForTimeout(500);
  check('Escape cierra el carrito', (await desk.getByRole('dialog').count()) === 0);
  const jsonLd = JSON.parse(await desk.locator('script[type="application/ld+json"]').innerText());
  check('JSON-LD de producto con precio en PEN', jsonLd['@type'] === 'Product' && jsonLd.offers.priceCurrency === 'PEN', JSON.stringify(jsonLd.offers));

  // Compra rápida desde la home y checkout real
  await desk.goto(`${base}/`);
  await settle(desk);
  const card = desk.locator('#catalogo article').filter({ hasText: 'Aurora 40' });
  await card.hover();
  await card.getByRole('button', { name: /agregar aurora 40/i }).click();
  await desk.getByRole('dialog').waitFor();
  await desk.getByRole('button', { name: 'Finalizar compra' }).click();
  await desk.waitForURL('**/checkout');
  await settle(desk);
  await shot(desk, 'checkout-desktop');
  await audit(desk, 'checkout');
  await desk.getByRole('button', { name: 'Confirmar pedido' }).click();
  await desk.getByText('Ingresa tu nombre completo.').waitFor();
  check('Checkout muestra errores por campo', (await desk.getByText('Ingresa un correo válido.').count()) === 1);
  await desk.getByLabel('Nombre completo').fill('Cliente Prueba E2E');
  await desk.getByLabel('Correo electrónico').fill('e2e-tienda@example.com');
  await desk.getByLabel('Celular').fill('900000000');
  await desk.getByLabel('Dirección', { exact: true }).fill('Av. Prueba 123');
  await desk.getByLabel(/acepto los/i).check();
  await desk.getByRole('button', { name: 'Confirmar pedido' }).click();
  await desk.waitForURL('**/pedido/TM-*', { timeout: 20000 });
  await settle(desk);
  const orderCode = decodeURIComponent(new URL(desk.url()).pathname.split('/').pop());
  await shot(desk, 'pedido-desktop');
  await audit(desk, 'pedido');
  const orderText = await desk.locator('main').innerText();
  check('Confirmación con el total calculado por la base (660 + 890 = 1,550)', /S\/\s*1,550\.00/.test(orderText), orderText.slice(0, 300));
  check('Instrucciones de Yape con el número 982 762 602', orderText.includes('982 762 602'));
  const whatsapp = await desk.getByRole('link', { name: /enviar comprobante/i }).getAttribute('href');
  check('WhatsApp con código y monto del pedido', whatsapp.includes('wa.me/51982762602') && decodeURIComponent(whatsapp).includes(orderCode), whatsapp);
  const tampered = await desk.goto(`${base}/pedido/${orderCode}?t=token-falso`);
  check('Link de pedido con token inválido → 404', tampered.status() === 404);
  const [afterOrder] = await sql(STOCK_SQL);
  check('El stock se descontó en la base', afterOrder.stock_a === 11 && afterOrder.stock_n === 1, JSON.stringify(afterOrder));

  // Seguimiento
  await desk.goto(`${base}/seguimiento`);
  await settle(desk);
  await desk.getByLabel('Código de pedido').fill(orderCode.toLowerCase());
  await desk.getByLabel('Correo').fill('otra@persona.com');
  await desk.getByRole('button', { name: 'Buscar' }).click();
  await desk.getByText('No encontramos un pedido con ese código y correo.').waitFor();
  check('Seguimiento rechaza un email ajeno', true);
  await desk.getByLabel('Correo').fill('E2E-tienda@example.com');
  await desk.getByRole('button', { name: 'Buscar' }).click();
  await desk.getByRole('heading', { name: `Pedido ${orderCode}` }).waitFor();
  await shot(desk, 'seguimiento-desktop');
  await audit(desk, 'seguimiento');
  check('Seguimiento encuentra el pedido con código y email correctos', true);

  // Libro de Reclamaciones
  await desk.goto(`${base}/libro-de-reclamaciones`);
  await settle(desk);
  await shot(desk, 'reclamaciones-desktop');
  await audit(desk, 'reclamaciones');
  await desk.getByLabel('Nombre completo').fill('Cliente Prueba E2E');
  await desk.getByLabel('DNI, CE o pasaporte').fill('12345678');
  await desk.getByLabel('Correo electrónico').fill('e2e-tienda@example.com');
  await desk.getByLabel('Domicilio').fill('Av. Prueba 123');
  await desk.getByLabel('Descripción').fill('Reloj de prueba');
  await desk.getByLabel('Detalle').fill('Prueba automatizada del libro de reclamaciones.');
  await desk.getByLabel('Pedido del consumidor').fill('Ninguno, es una prueba.');
  await desk.getByRole('button', { name: 'Enviar hoja de reclamación' }).click();
  await desk.getByRole('heading', { name: /hoja de reclamación n\.° lr-\d{4}-\d{6}/i }).waitFor({ timeout: 15000 });
  check('El Libro de Reclamaciones registra y muestra el correlativo', true);

  // Última unidad: comprarla y volver atrás lleva al inicio con un aviso (no a una ficha vieja ni a un 404)
  await sql(`update product_variants set stock = 1 where id = '${lastUnit.id}'`);
  await desk.goto(`${base}/producto/demo-clasico-36`);
  await settle(desk);
  await desk.getByRole('button', { name: 'Agregar al carrito' }).click();
  await desk.getByRole('button', { name: 'Finalizar compra' }).click();
  await desk.waitForURL('**/checkout');
  await desk.getByLabel('Nombre completo').fill('Cliente Prueba E2E');
  await desk.getByLabel('Correo electrónico').fill('e2e-tienda@example.com');
  await desk.getByLabel('Celular').fill('900000000');
  await desk.getByLabel('Dirección', { exact: true }).fill('Av. Prueba 123');
  await desk.getByLabel(/acepto los/i).check();
  await desk.getByRole('button', { name: 'Confirmar pedido' }).click();
  await desk.waitForURL('**/pedido/**');
  await desk.goBack();
  await desk.waitForURL((url) => url.pathname === '/' && !url.search.includes('aviso='), { timeout: 15000 }).catch(() => {});
  check('Volver atrás tras comprar la última unidad lleva al inicio', new URL(desk.url()).pathname === '/' && !desk.url().includes('aviso='), desk.url());
  check('…con el aviso de que se agotó', await desk.getByRole('status').filter({ hasText: /se acaba de agotar/i }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await desk.goto(`${base}/producto/reloj-que-no-existe`);
  await desk.waitForURL((url) => url.pathname === '/', { timeout: 10000 }).catch(() => {});
  check('Un reloj que ya no existe lleva al inicio (no al 404)', new URL(desk.url()).pathname === '/', desk.url());
  check('…con el aviso de que ya no está disponible', await desk.getByRole('status').filter({ hasText: /ya no está disponible/i }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await settle(desk);
  await audit(desk, 'aviso');

  // Mobile
  const mob = await newPage({ width: 375, height: 812 }, true);
  await mob.goto(`${base}/`);
  await settle(mob);
  // Antes de la captura de página completa: esa captura interrumpe la emulación táctil por un momento.
  const agregarMovil = mob.getByRole('button', { name: /agregar aurora 40/i });
  const agregarCuenta = await agregarMovil.count();
  check('Mobile: sin botón Agregar encima de las fotos', agregarCuenta === 0, `botones=${agregarCuenta}`);
  await shot(mob, 'home-mobile');
  const logo = await mob.locator('header a[aria-label*="inicio"]').boundingBox();
  const cart = await mob.locator('header button[aria-label^="Abrir carrito"]').boundingBox();
  check('Mobile: el carrito ya no se superpone al logo', logo.x + logo.width <= cart.x, JSON.stringify({ logo, cart }));
  await mob.locator('#catalogo article').filter({ hasText: 'Aurora 40' }).locator('a').first().click();
  await mob.waitForURL('**/producto/demo-aurora-40', { timeout: 10000 }).catch(() => {});
  check('Mobile: tocar la tarjeta abre la ficha del producto', new URL(mob.url()).pathname === '/producto/demo-aurora-40', mob.url());
  await mob.goto(`${base}/`);
  await settle(mob);
  await mob.goto(`${base}/producto/demo-aurora-40`);
  await settle(mob);
  await shot(mob, 'producto-mobile');
  await mob.goto(`${base}/no-existe`);
  await settle(mob);
  await shot(mob, '404-mobile', false);
  await mob.goto(`${base}/admin/login`);
  await settle(mob);
  await shot(mob, 'admin-login-mobile', false);
  await audit(mob, 'admin-login');
} catch (error) {
  check('Flujo completo sin errores', false, error.message.split('\n')[0]);
} finally {
  // Limpieza: cancelar (devuelve stock) y borrar pedidos y reclamos de prueba.
  const orders = await sql(`select id from public.orders where customer_email = 'e2e-tienda@example.com' and status <> 'cancelled'`);
  for (const { id } of orders) await sql(`select public.apply_order_status('${id}', 'cancelled', null, 'Prueba E2E')`);
  await sql(`delete from public.orders where customer_email = 'e2e-tienda@example.com'; delete from public.complaints where consumer_email = 'e2e-tienda@example.com';
    delete from public.customers where phone like '5190000%';
    update product_variants set stock = ${lastUnit.stock} where id = '${lastUnit.id}';`);
  const [restored] = await sql(STOCK_SQL);
  check('Limpieza: stock repuesto, sin pedidos ni reclamos de prueba', restored.stock_a === 12 && restored.stock_n === 2, JSON.stringify(restored));
  await browser.close();
}

for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}${!result.ok && result.detail ? ` — ${result.detail}` : ''}`);
console.log('\nAccesibilidad (axe):');
for (const [page, violations] of Object.entries(a11y)) console.log(`  ${page}: ${violations.length ? violations.join(' | ') : 'sin violaciones'}`);
console.log(`\nErrores de consola/página: ${errors.length ? `\n  ${[...new Set(errors)].join('\n  ')}` : 'ninguno'}`);
process.exitCode = results.every((result) => result.ok) ? 0 : 1;
