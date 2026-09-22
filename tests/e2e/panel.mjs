// Punta a punta del panel esencial: productos (con Cloudinary real), pedidos, organizador,
// estadísticas y ajustes. Crea un admin temporal y deja la base y Cloudinary como estaban.
import { chromium } from 'playwright';
import { axeSource, BASE_URL, cleanupSteps, env, FIXTURE_IMAGES, OUTPUT_DIR, sql } from './support.mjs';
import { randomBytes } from 'node:crypto';

const base = BASE_URL;
const IMAGES = FIXTURE_IMAGES;
const cloudAuth = `Basic ${Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64')}`;
const cloudinary = (path) => fetch(`https://api.cloudinary.com/v1_1/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}${path}`, { headers: { Authorization: cloudAuth } });
const assetExists = async (publicId) => (await cloudinary(`/resources/image/upload/${publicId.split('/').map(encodeURIComponent).join('/')}`)).status === 200;
const folderAssets = async (productId) => (await (await cloudinary(`/resources/image/upload?prefix=${encodeURIComponent(`${env.CLOUDINARY_FOLDER || 'imagenes'}/products/${productId}/`)}&max_results=50`)).json()).resources ?? [];

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const a11y = {};
const errors = [];
async function audit(page, name) {
  await page.addScriptTag({ content: axeSource });
  a11y[name] = await page.evaluate(async () =>
    (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(
      (violation) => `${violation.impact}: ${violation.id} (${violation.nodes.length}) ${violation.nodes[0]?.target?.join(' ')}`
    )
  );
}
// Etiquetas: prefijo sin distinguir mayúsculas (el panel las muestra en mayúsculas por CSS).
const labelText = (text) => new RegExp('^' + text.replace(/[.*+?^${}()|[\]\\/]/g, (char) => '\\' + char), 'i');
const setRange = (page, label, value) =>
  page.getByLabel(labelText(label)).evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

// Arrastre real con el mouse: agarrar el centro de un elemento, moverlo en pasos y soltarlo sobre otro.
async function mouseDrag(page, from, to) {
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2, { steps: 4 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

// Estado original para restaurar -----------------------------------------------------------------
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const adminHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const email = `e2e-panel-${Date.now()}@pruebas.invalid`;
const password = randomBytes(24).toString('base64url');
const created = await (await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password, email_confirm: true }) })).json();
if (!created.id) throw new Error(`No se creó el admin temporal: ${JSON.stringify(created)}`);
const userId = created.id;
const originalPositions = await sql(`select id, position from public.products`);
const [originalSettings] = await sql(`select sold_out_last, instagram_url from public.store_settings`);
const [stockProduct] = await sql(`select v.id as variant_id, v.stock, p.name, p.id as product_id from public.product_variants v join public.products p on p.id = v.product_id
  where p.status = 'active' and v.stock >= 4 order by v.stock desc, p.position limit 1`);
if (!stockProduct) {
  console.error('Para esta prueba hace falta un reloj publicado con al menos 4 unidades de stock (crea uno o corre "npm run demo:seed").');
  process.exit(1);
}
const productIds = new Set();

async function cleanup() {
  const folder = env.CLOUDINARY_FOLDER || 'imagenes';
  return cleanupSteps([
    ['pedidos, clientes, stock y ajustes', () => sql(`delete from public.orders where customer_email = 'e2e-panel@example.com';
    delete from public.customers where phone like '5190000%';
    update public.product_variants set stock = ${stockProduct.stock} where id = '${stockProduct.variant_id}';
    update public.store_settings set sold_out_last = ${originalSettings.sold_out_last}, instagram_url = ${originalSettings.instagram_url ? `'${originalSettings.instagram_url}'` : 'null'};`)],
    ['productos E2E', async () => {
      for (const row of await sql(`select id from public.products where name like 'E2E %'`)) productIds.add(row.id);
      await sql(`delete from public.products where name like 'E2E %'; delete from public.brands where name like 'E2E %';`);
    }],
    ['fotos en Cloudinary', async () => {
      for (const id of productIds) {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/resources/image/upload?prefix=${encodeURIComponent(`${folder}/products/${id}/`)}`, { method: 'DELETE', headers: { Authorization: cloudAuth } });
        if (!response.ok) throw new Error(`Cloudinary ${response.status} (${folder}/products/${id}/)`);
      }
    }],
    ['cola de borrado', () => sql(`delete from public.asset_deletion_queue where public_id like '%/products/%' and public_id not in (select public_id from public.product_images);`)],
    ['orden original', () => sql(originalPositions.map((row) => `update public.products set position = ${row.position} where id = '${row.id}';`).join(' '))],
    ['admin temporal', async () => {
      const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: adminHeaders });
      if (!response.ok) throw new Error(`Auth ${response.status}`);
    }],
  ]);
}

const browser = await chromium.launch();
try {
  await sql(`insert into public.admin_users (user_id) values ('${userId}')`);
  const session = await (
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json();
  const cookieName = `sb-${env.SUPABASE_PROJECT_REF}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks = value.length <= 3180 ? [{ name: cookieName, value }] : Array.from({ length: Math.ceil(value.length / 3180) }, (_, i) => ({ name: `${cookieName}.${i}`, value: value.slice(i * 3180, (i + 1) * 3180) }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-PE' });
  await context.addCookies(chunks.map((chunk) => ({ ...chunk, url: base })));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text().slice(0, 200)}`);
  });
  page.on('dialog', (dialog) => dialog.accept());

  // Menú ---------------------------------------------------------------------------------------------
  await page.goto(`${base}/admin`);
  const navOrder = await page.locator('aside[aria-label="Menú del panel"] nav a').allTextContents();
  check('menú: lo esencial primero y el CRM al final', navOrder.map((text) => text.replace(/\d+.*$/, '').trim()).join(',').startsWith('Resumen,Productos,Pedidos,Organizador,Estadísticas,Ajustes,Conversaciones'), navOrder.join(' | '));
  await audit(page, 'resumen');

  // Productos: validación ------------------------------------------------------------------------------
  await page.goto(`${base}/admin/productos/nuevo`);
  await page.click('button:has-text("Crear producto")');
  check('valida campos obligatorios', await page.getByText('Escribe el nombre del reloj.').isVisible());

  // Crear con marca nueva, 2 fotos (una editada), ficha técnica
  await page.fill('input[placeholder="Ej.: Edifice EFR-526D"]', 'E2E Reloj Prueba');
  await page.click('button:has(span:text("Nueva marca"))');
  await page.fill('input[aria-label="Nombre de la nueva marca"]', 'E2E Marca');
  await page.click('button:has-text("Agregar")');
  await page.waitForFunction(() => [...document.querySelectorAll('select')].some((select) => select.selectedOptions[0]?.textContent === 'E2E Marca'));
  check('crea la marca en línea y la selecciona', true);
  await page.getByRole('combobox', { name: /^Para/ }).selectOption('hombre');
  await page.getByRole('combobox', { name: /^Movimiento/ }).selectOption('automatico');
  await page.setInputFiles('input[type=file]', [`${IMAGES}/watch-01.png`, `${IMAGES}/watch-02.png`]);
  await page.waitForFunction(() => document.querySelectorAll('ul[aria-label^="Fotos del producto"] li').length === 2, null, { timeout: 60000 });
  check('sube 2 fotos a Cloudinary con progreso', true);
  await page.getByLabel(labelText('Precio (S/)')).fill('1,299.90');
  await page.getByLabel(labelText('Stock')).fill('3');
  await page.getByLabel(labelText('Característica 1')).fill('Resistencia al agua');
  await page.getByLabel(labelText('Valor de la característica 1')).fill('100 m');
  await audit(page, 'producto-nuevo');

  await page.click('button[aria-label="Editar foto 1"]');
  await page.getByRole('dialog').waitFor();
  await page.click('button:has-text("Cuadrado 1:1")');
  await setRange(page, 'Brillo', 20);
  await setRange(page, 'Contraste', 10);
  await page.waitForFunction(() => /c_crop,x_\d+/.test(document.querySelector('img[alt="Resultado final de la foto"]')?.getAttribute('src') ?? ''), null, { timeout: 15000 }).catch(() => {});
  const finalSrc = await page.locator('img[alt="Resultado final de la foto"]').getAttribute('src');
  check('editor: la vista final es la URL de Cloudinary con recorte, brillo y contraste', /c_crop,x_\d+,y_\d+,w_\d+,h_\d+\/e_brightness:20\/e_contrast:10/.test(finalSrc ?? ''), finalSrc);
  await audit(page, 'editor-foto');
  await page.click('button:has-text("Aplicar")');
  check('la foto queda marcada como editada', await page.locator('ul[aria-label^="Fotos del producto"] li').first().getByText('Editada').isVisible());
  await page.click('button[aria-label="Usar la foto 2 como principal"]');
  await Promise.all([page.waitForURL(`${base}/admin/productos`), page.click('button:has-text("Crear producto")')]);
  check('guarda y vuelve al listado con aviso', await page.getByText('Producto creado').isVisible());

  const [product] = await sql(`select p.id, p.slug, p.price, p.status, b.name as brand, p.specs,
      (select json_agg(json_build_object('public_id', public_id, 'primary', is_primary, 'brightness', brightness, 'contrast', contrast, 'crop', crop) order by position) from public.product_images where product_id = p.id) as images,
      (select sum(stock) from public.product_variants where product_id = p.id) as stock
    from public.products p left join public.brands b on b.id = p.brand_id where p.name = 'E2E Reloj Prueba'`);
  productIds.add(product.id);
  const images = product.images;
  check('producto en la base: precio, marca, stock, ficha', Number(product.price) === 1299.9 && product.brand === 'E2E Marca' && Number(product.stock) === 3 && product.specs[0]?.value === '100 m', JSON.stringify({ price: product.price, brand: product.brand, stock: product.stock }));
  check('fotos: orden, principal y ediciones guardadas', images.length === 2 && images[1].primary && !images[0].primary && images[0].brightness === 20 && images[0].contrast === 10 && images[0].crop?.width === images[0].crop?.height, JSON.stringify(images));
  check('fotos en la carpeta del producto en Cloudinary', (await assetExists(images[0].public_id)) && (await assetExists(images[1].public_id)) && images.every((image) => image.public_id.includes(`/products/${product.id}/`)));

  const store = await page.context().newPage();
  const response = await store.goto(`${base}/producto/${product.slug}`);
  check('se publica en la tienda', response.status() === 200 && (await store.getByRole('heading', { name: /E2E Reloj Prueba/i }).isVisible()));
  await store.close();

  // Editar: quitar una foto, subir otra, variantes
  await page.goto(`${base}/admin/productos/${product.id}`);
  await page.click('button[aria-label="Quitar foto 1"]');
  await page.setInputFiles('input[type=file]', [`${IMAGES}/watch-03.png`]);
  await page.waitForFunction(() => document.querySelectorAll('ul[aria-label^="Fotos del producto"] li').length === 2, null, { timeout: 60000 });
  const photoTiles = page.locator('ul[aria-label^="Fotos del producto"] > li');
  const lastPhoto = await photoTiles.nth(1).locator('img').getAttribute('src');
  await mouseDrag(page, photoTiles.nth(1).locator('div[aria-roledescription]'), photoTiles.nth(0).locator('div[aria-roledescription]'));
  check('fotos: arrastrar y soltar con el mouse cambia el orden', (await photoTiles.nth(0).locator('img').getAttribute('src')) === lastPhoto);
  await page.getByLabel(labelText('Tiene variantes')).check();
  await page.getByLabel(labelText('Nombre de la variante 1')).fill('40 mm');
  await page.click('button:has-text("Agregar variante")');
  await page.getByLabel(labelText('Nombre de la variante 2')).fill('42 mm');
  await page.getByLabel(labelText('Stock de la variante 2')).fill('2');
  await page.getByLabel(labelText('Precio propio de la variante 2')).fill('1399');
  await Promise.all([page.waitForURL(`${base}/admin/productos`), page.click('button:has-text("Guardar cambios")')]);
  await page.waitForTimeout(1500);
  const [edited] = await sql(`select (select json_agg(public_id order by position) from public.product_images where product_id = '${product.id}') as images,
      (select json_agg(json_build_object('label', label, 'stock', stock, 'price', price_override) order by position) from public.product_variants where product_id = '${product.id}') as variants,
      (select count(*) from public.asset_deletion_queue where public_id = '${images[0].public_id}') as queued`);
  check('editar: variantes guardadas', edited.variants.length === 2 && edited.variants[1].label === '42 mm' && Number(edited.variants[1].price) === 1399, JSON.stringify(edited.variants));
  check('editar: la foto quitada se destruyó en Cloudinary (no queda en cola)', !(await assetExists(images[0].public_id)) && Number(edited.queued) === 0 && edited.images.length === 2 && !edited.images.includes(images[0].public_id));
  check('fotos: el nuevo orden se guarda (la subida nueva quedó primera)', edited.images[1] === images[1].public_id, JSON.stringify(edited.images));

  // Cancelar un formulario con una foto subida la borra de Cloudinary
  await page.goto(`${base}/admin/productos/nuevo`);
  await page.setInputFiles('input[type=file]', [`${IMAGES}/watch-04.png`]);
  await page.waitForFunction(() => document.querySelectorAll('ul[aria-label^="Fotos del producto"] li').length === 1, null, { timeout: 60000 });
  const draftFolder = await page.evaluate(() => document.querySelector('ul[aria-label^="Fotos del producto"] img')?.getAttribute('src'));
  const draftId = /products%2F([0-9a-f-]{36})|products\/([0-9a-f-]{36})/.exec(decodeURIComponent(draftFolder ?? ''))?.slice(1).find(Boolean);
  if (draftId) productIds.add(draftId);
  await page.click('button:has-text("Cancelar")');
  await page.waitForURL(`${base}/admin/productos`);
  await page.waitForTimeout(2500);
  check('cancelar borra de Cloudinary las fotos no guardadas', draftId && (await folderAssets(draftId)).length === 0, draftId);

  // Listado: búsqueda y marcar agotado
  await page.goto(`${base}/admin/productos?q=e2e`);
  check('buscar en el listado', (await page.locator('ul[aria-label="Productos"] > li').count()) === 1);
  await audit(page, 'productos');

  // Editar en desplegable: dos productos abiertos a la vez, "Guardar todos" y cambios en bloque.
  await page.goto(`${base}/admin/productos/nuevo`);
  await page.fill('input[placeholder="Ej.: Edifice EFR-526D"]', 'E2E Reloj Dos');
  await page.getByLabel(labelText('Precio (S/)')).fill('300');
  await page.getByRole('radio', { name: /Borrador/ }).check();
  await Promise.all([page.waitForURL(`${base}/admin/productos`), page.click('button:has-text("Crear producto")')]);
  await page.goto(`${base}/admin/productos?q=e2e&orden=nombre`);
  const rows = page.locator('ul[aria-label="Productos"] > li');
  check('dos productos E2E en la lista', (await rows.count()) === 2);
  await page.click('button[aria-controls][aria-expanded="false"]:has-text("Editar") >> nth=0');
  await page.click('button[aria-controls][aria-expanded="false"]:has-text("Editar") >> nth=0');
  const dos = page.getByRole('region', { name: 'Editar E2E Reloj Dos' });
  const prueba = page.getByRole('region', { name: 'Editar E2E Reloj Prueba' });
  await dos.getByLabel(labelText('Precio (S/)')).waitFor();
  await prueba.getByLabel(labelText('Precio (S/)')).waitFor();
  check('editar sin salir de la lista (misma página)', page.url().includes('/admin/productos?q=e2e'));
  await audit(page, 'productos-edicion-en-linea');
  await dos.getByLabel(labelText('Precio (S/)')).fill('333');
  await prueba.getByLabel(labelText('Precio (S/)')).fill('1111');
  await page.click('button:has-text("Guardar todos (2)")');
  await page.getByRole('region', { name: /Editar E2E/ }).first().waitFor({ state: 'detached', timeout: 20000 });
  const prices = await sql(`select name, price from public.products where name like 'E2E %' order by name`);
  check('guardar todos: los dos precios quedan guardados', Number(prices.find((row) => row.name === 'E2E Reloj Dos')?.price) === 333 && Number(prices.find((row) => row.name === 'E2E Reloj Prueba')?.price) === 1111, JSON.stringify(prices));
  await page.getByLabel('Seleccionar todos').check();
  await page.click('button:has-text("Archivar")');
  await page.getByText('2 archivado(s)').waitFor();
  const archived = await sql(`select count(*) as n from public.products where name like 'E2E %' and status = 'archived'`);
  check('en bloque: archivar varios', Number(archived[0].n) === 2);
  await page.getByLabel('Seleccionar todos').check();
  await page.click('button:has-text("Publicar")');
  await page.getByText('Sin fotos, no se publicaron: E2E Reloj Dos').waitFor();
  const statuses = await sql(`select name, status from public.products where name like 'E2E %' order by name`);
  check('en bloque: publicar respeta la regla de fotos', statuses.find((row) => row.name === 'E2E Reloj Prueba')?.status === 'active' && statuses.find((row) => row.name === 'E2E Reloj Dos')?.status === 'archived', JSON.stringify(statuses));
  await page.goto(`${base}/admin/productos?q=e2e%20reloj%20prueba`);
  await page.click('button[aria-label="Más acciones para E2E Reloj Prueba"]');
  await page.click('button[role=menuitem]:has-text("Marcar agotado")');
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar agotado' }).click();
  await page.getByText('Marcado como agotado').waitFor();
  const [soldOut] = await sql(`select sum(stock) as stock from public.product_variants where product_id = '${product.id}'`);
  check('marcar agotado pone el stock en 0 sin tocar fotos', Number(soldOut.stock) === 0 && (await assetExists(images[1].public_id)));

  // Organizador: dos órdenes (tienda y por mayor)
  await page.goto(`${base}/admin/organizador`);
  await page.waitForTimeout(1200);
  const pestañas = (await page.getByRole('tab').allInnerTexts()).map((texto) => texto.replace(/\s+/g, ' ').trim());
  check('organizador: pestañas de tienda y por mayor', pestañas.length === 2 && /tienda/i.test(pestañas[0]) && /por mayor/i.test(pestañas[1]), pestañas.join(' | '));
  await page.getByRole('tab', { name: /al por mayor/i }).click();
  await page.waitForTimeout(600);
  check('organizador: la pestaña de por mayor muestra relojes', (await page.locator('[role=tabpanel]:not([hidden]) ul li').count()) > 0);
  await page.getByRole('tab', { name: /^tienda/i }).click();
  await page.waitForTimeout(400);

  // Organizador ----------------------------------------------------------------------------------------
  await page.goto(`${base}/admin/organizador`);
  check('organizador: el agotado aparece en gris al final', await page.locator('section:has(h2:text("Agotados")) li:has-text("E2E Reloj Prueba") .grayscale').isVisible());
  await audit(page, 'organizador');
  await page.click('button:has-text("Precio ↓")');
  check('atajo de orden en vista previa (sin guardar)', await page.getByText('Hay cambios sin guardar').isVisible());
  await page.click('button:has-text("Guardar orden")');
  await page.getByText('Orden guardado').waitFor();
  const byPrice = await sql(`select p.name, p.price from public.products p
    where p.status = 'active' and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0) order by p.position`);
  check('guardar orden: la base queda por precio descendente', byPrice.length > 1 && byPrice.every((row, index) => index === 0 || Number(byPrice[index - 1].price) >= Number(row.price)), byPrice.map((row) => `${row.name} ${row.price}`).join(', '));
  const home = await page.context().newPage();
  await home.goto(`${base}/?t=${Date.now()}`);
  const firstCard = (await home.locator('#catalogo article, #catalogo li').first().innerText()).toLowerCase();
  check('la tienda muestra el nuevo orden', firstCard.includes(byPrice[0].name.toLowerCase()), `${firstCard.slice(0, 60)} vs ${byPrice[0].name}`);
  await home.close();
  // Mouse: agarrar la primera tarjeta y soltarla sobre la tercera.
  const tiles = page.locator('ul[aria-label^="Productos en el orden"] > li');
  const firstName = (await tiles.nth(0).locator('span.line-clamp-2').innerText()).trim();
  await mouseDrag(page, tiles.nth(0).locator('[aria-roledescription]'), tiles.nth(2).locator('[aria-roledescription]'));
  const movedTo = (await tiles.nth(2).innerText()).includes(firstName);
  check('organizador: arrastrar y soltar con el mouse', movedTo && (await page.getByText('Hay cambios sin guardar').isVisible()), firstName);
  await page.click('button:has-text("Descartar")');
  // Teclado: mover con Espacio + flecha
  const handle = tiles.first().locator('[aria-roledescription]');
  await handle.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  check('mover con el teclado', await page.getByText('Hay cambios sin guardar').isVisible());
  await page.click('button:has-text("Descartar")');
  await page.getByLabel(labelText('Mover los agotados al final automáticamente en la tienda')).uncheck();
  await page.getByText('respetan el orden').waitFor();
  const [setting] = await sql(`select sold_out_last from public.store_settings`);
  check('ajuste "agotados al final" se guarda', setting.sold_out_last === false);

  // Pedidos -----------------------------------------------------------------------------------------
  const customer = { name: 'Cliente E2E Panel', email: 'e2e-panel@example.com', phone: '900003001', address: 'Av. Prueba 123' };
  const [order1] = await sql(`select public.create_order('${JSON.stringify(customer)}'::jsonb, '[{"variant_id":"${stockProduct.variant_id}","quantity":1}]'::jsonb, 'yape') as o`);
  const [order2] = await sql(`select public.create_order('${JSON.stringify(customer)}'::jsonb, '[{"variant_id":"${stockProduct.variant_id}","quantity":1}]'::jsonb, 'transfer') as o`);
  const code1 = order1.o.code;
  const code2 = order2.o.code;
  await page.goto(`${base}/admin/pedidos?estado=pending_payment`);
  check('pedidos por confirmar aparecen en su pestaña', (await page.getByText(code1).isVisible()) && (await page.getByText(code2).isVisible()));
  const navBadge = await page.locator('aside[aria-label="Menú del panel"] a:has-text("Pedidos")').innerText();
  check('el menú muestra cuántos pagos faltan confirmar', /\d/.test(navBadge), navBadge);
  await audit(page, 'pedidos');
  await page.goto(`${base}/admin/pedidos?q=${code1}`);
  check('buscar por código', (await page.locator('tbody tr').count()) === 1);
  const csv = await (await page.request.get(`${base}/api/admin/pedidos/export?q=e2e-panel`)).text();
  check('exportar CSV con los pedidos filtrados', csv.includes(code1) && csv.includes(code2) && csv.startsWith('\uFEFFCódigo;'), csv.slice(0, 80));

  await page.goto(`${base}/admin/pedidos/${order1.o.id}`);
  await page.getByLabel(labelText('Nota (opcional, queda en el historial)')).fill('Yape verificado');
  await page.click('button:has-text("Confirmar pago")');
  await page.getByText('Pedido: pago confirmado').waitFor();
  await page.reload();
  check('confirmar pago: estado, historial con nota', (await page.getByText('Pago confirmado').first().isVisible()) && (await page.getByText('Yape verificado').isVisible()));
  check('WhatsApp al cliente con el código del pedido', (await page.locator('a:has-text("Escribir por WhatsApp")').getAttribute('href'))?.includes(encodeURIComponent(code1)));
  await page.fill('#internal-notes', 'Cliente pidió empaque de regalo');
  await page.click('button:has-text("Guardar nota")');
  await page.getByText('Nota guardada').waitFor();
  await audit(page, 'pedido-detalle');

  const [stockBefore] = await sql(`select stock from public.product_variants where id = '${stockProduct.variant_id}'`);
  await page.goto(`${base}/admin/pedidos/${order2.o.id}`);
  await page.click('button:has-text("Cancelar pedido")');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar pedido' }).click();
  await page.getByText('Pedido: cancelado').waitFor();
  const [stockAfter] = await sql(`select stock from public.product_variants where id = '${stockProduct.variant_id}'`);
  check('cancelar devuelve el stock', stockAfter.stock === stockBefore.stock + 1, `${stockBefore.stock} → ${stockAfter.stock}`);

  // Estadísticas ---------------------------------------------------------------------------------------
  await page.goto(`${base}/admin/estadisticas`);
  const [kpi] = await sql(`select coalesce(sum(total), 0) as revenue, count(*) as orders from public.orders
    where paid_at is not null and status <> 'cancelled' and paid_at >= date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima'`);
  const revenueText = await page.locator('div:has(> p:text("Ingresos")) p').nth(1).innerText();
  const expected = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(kpi.revenue));
  check('estadísticas del mes coinciden con la base', revenueText.replace(/\s/g, ' ') === expected.replace(/\s/g, ' '), `${revenueText} vs ${expected}`);
  check('gráfico de ventas dibujado', (await page.locator('.recharts-bar-rectangle').count()) > 0);
  check('ranking de relojes incluye la venta', await page.locator('section:has(h2:text("Relojes más vendidos"))').getByText(stockProduct.name).isVisible());
  await audit(page, 'estadisticas');
  await page.click('a:has-text("Año")');
  await page.waitForURL(/vista=anio/);
  check('vista anual', (await page.locator('.recharts-bar-rectangle').count()) > 0 || (await page.getByText('Sin ventas').isVisible()));
  await page.click('a:has-text("Histórico")');
  await page.waitForURL(/vista=historico/);
  check('vista histórica', await page.getByText('Desde la primera venta').isVisible());

  // Ajustes ----------------------------------------------------------------------------------------------
  await page.goto(`${base}/admin/ajustes`);
  check('lista administradores con correo', await page.locator('main').getByText(email).isVisible());
  await page.getByLabel(labelText('Instagram')).fill('https://www.instagram.com/time.e2e');
  await page.click('button:has-text("Guardar ajustes")');
  await page.getByText('Ajustes guardados').waitFor();
  await page.waitForTimeout(1200);
  await audit(page, 'ajustes');
  const storePage = await page.context().newPage();
  await storePage.goto(`${base}/seguimiento`);
  check('las redes configuradas aparecen en la tienda', await storePage.locator('footer a[href="https://www.instagram.com/time.e2e"]').isVisible());
  check('la red se muestra con su ícono', (await storePage.locator('footer a[href="https://www.instagram.com/time.e2e"] svg').count()) === 1);
  await storePage.close();

  // Logo del panel: desde otra sección lleva al resumen; en el resumen, a la tienda ----------------------------
  await page.getByRole('link', { name: /time relojería: ir al resumen/i }).last().click();
  await page.waitForURL(`${base}/admin`);
  check('el logo lleva al resumen desde otra sección', new URL(page.url()).pathname === '/admin');
  await page.getByRole('link', { name: /time relojería: ver la tienda/i }).last().click();
  await page.waitForURL(`${base}/`);
  check('en el resumen, el logo lleva a la tienda', new URL(page.url()).pathname === '/');

  // Resumen -----------------------------------------------------------------------------------------------
  await page.goto(`${base}/admin`);
  check('resumen muestra ventas del mes y pedidos recientes', (await page.getByText(code1).first().isVisible()) && (await page.getByText('Ventas del mes').isVisible()));

  // Eliminar producto: borra la fila y la carpeta en Cloudinary ----------------------------------------------
  await page.goto(`${base}/admin/productos?q=e2e`);
  await page.click('button[aria-label="Más acciones para E2E Reloj Prueba"]');
  await page.click('button[role=menuitem]:has-text("Eliminar")');
  check('el diálogo avisa que se borran las fotos', await page.getByRole('dialog').getByText('se borrarán de Cloudinary').isVisible());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await page.getByText('Producto eliminado junto con sus fotos').waitFor();
  await page.waitForTimeout(2000);
  const [gone] = await sql(`select count(*) as n from public.products where id = '${product.id}'`);
  check('eliminar: sin fila y carpeta vacía en Cloudinary', Number(gone.n) === 0 && (await folderAssets(product.id)).length === 0);
  const [brandLeft] = await sql(`select count(*) as n from public.brands where name = 'E2E Marca'`);
  check('eliminar el último reloj de una marca quita la marca de la lista', Number(brandLeft.n) === 0, brandLeft.n);

  // Celular
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-PE', hasTouch: true, isMobile: true });
  await mobile.addCookies(chunks.map((chunk) => ({ ...chunk, url: base })));
  const phone = await mobile.newPage();
  for (const path of ['/admin', '/admin/productos', '/admin/productos/nuevo', '/admin/pedidos', '/admin/organizador', '/admin/estadisticas', '/admin/ajustes']) {
    await phone.goto(`${base}${path}`);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`celular sin scroll horizontal: ${path}`, overflow <= 0, `overflow=${overflow}`);
  }
  await mobile.close();
} catch (error) {
  check('flujo completo sin excepciones', false, error.message.slice(0, 400));
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0]) await pages[0].screenshot({ path: `${OUTPUT_DIR}/e2e-panel-error.png`, fullPage: true });
  } catch {}
} finally {
  await browser.close();
  const pending = await cleanup();
  if (pending.length) check('limpieza completa', false, pending.join('; '));
}

const failed = results.filter((result) => !result.ok);
for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}${result.detail && !result.ok ? ` — ${result.detail}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} OK`);
console.log('axe:', JSON.stringify(a11y, null, 1));
console.log('errores de consola:', errors.length ? errors : 'ninguno');
process.exit(failed.length ? 1 : 0);
