// Prueba de punta a punta del CRM y WhatsApp (modo sandbox) contra el servidor local.
// Crea un admin temporal (se borra al final) y datos con teléfonos 5190000xxxx.
import { chromium } from 'playwright';
import { axeSource, BASE_URL, cleanupSteps, env, sql } from './support.mjs';
import { randomBytes } from 'node:crypto';

const base = BASE_URL;
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

// Admin temporal ------------------------------------------------------------------------------
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const email = `e2e-crm-${Date.now()}@pruebas.invalid`;
const password = randomBytes(24).toString('base64url');
const adminHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const created = await (await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password, email_confirm: true }) })).json();
if (!created.id) throw new Error(`No se creó el admin temporal: ${JSON.stringify(created)}`);
const userId = created.id;

async function cleanupData() {
  await sql(`delete from public.campaigns where name like 'E2E %';
    delete from public.message_templates where name like 'E2E %';
    delete from public.customers where phone like '5190000%';`);
}
async function cleanup() {
  return cleanupSteps([
    ['datos E2E', cleanupData],
    ['admin temporal', async () => {
      const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: adminHeaders });
      if (!response.ok) throw new Error(`Auth ${response.status}`);
    }],
  ]);
}

const browser = await chromium.launch();
try {
  await cleanupData();
  await sql(`insert into public.admin_users (user_id) values ('${userId}')`);
  const session = await (
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json();
  if (!session.access_token) throw new Error('No se pudo iniciar sesión con el admin temporal');
  const cookieName = `sb-${env.SUPABASE_PROJECT_REF}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks = value.length <= 3180 ? [{ name: cookieName, value }] : Array.from({ length: Math.ceil(value.length / 3180) }, (_, i) => ({ name: `${cookieName}.${i}`, value: value.slice(i * 3180, (i + 1) * 3180) }));

  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-PE' });
  await context.addCookies(chunks.map((chunk) => ({ ...chunk, url: base })));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text().slice(0, 200)}`);
  });
  page.on('dialog', (dialog) => dialog.accept());

  // Resumen
  await page.goto(`${base}/admin`);
  check('resumen carga con sesión de admin', (await page.locator('h1').textContent()) === 'Resumen');
  check('sin avisos de modo prueba en el panel', (await page.getByText('modo prueba', { exact: false }).count()) === 0);
  await audit(page, 'admin-resumen');

  // Alta manual de cliente
  await page.goto(`${base}/admin/clientes/nuevo`);
  await page.fill('input[name=name]', 'Cliente E2E Pérez');
  await page.fill('input[name=phone]', '900 002 001');
  await page.fill('input[name=tags]', 'e2e, vip');
  await page.locator('label', { hasText: 'Relojes de hombre' }).click();
  await page.check('input[name=whatsapp_opt_in]');
  await audit(page, 'admin-cliente-nuevo');
  await Promise.all([page.waitForURL(/\/admin\/clientes\/[0-9a-f-]{36}$/), page.click('button:has-text("Crear cliente")')]);
  const customerUrl = page.url();
  check('crea el cliente y abre su ficha', (await page.locator('h1').textContent()) === 'Cliente E2E Pérez');
  check('la ficha muestra consentimiento', await page.getByText('Acepta novedades').first().isVisible());
  const waHref = await page.locator('a:has-text("Abrir en WhatsApp")').getAttribute('href');
  check('Abrir en WhatsApp usa la plantilla con el primer nombre', waHref?.startsWith('https://wa.me/51900002001?text=Hola%20Cliente%2C'), waHref);
  await audit(page, 'admin-ficha');

  // Dedupe
  await page.goto(`${base}/admin/clientes/nuevo`);
  await page.fill('input[name=name]', 'Otro Nombre');
  await page.fill('input[name=phone]', '+51 900-002-001');
  await page.click('button:has-text("Crear cliente")');
  await page.getByText('ya está registrado').waitFor();
  check('no duplica: avisa y enlaza la ficha existente', (await page.locator('a:has-text("Ver su ficha")').getAttribute('href')) === customerUrl.replace(base, ''));

  // Listado y búsqueda
  await page.goto(`${base}/admin/clientes?q=900002`);
  check('buscar por teléfono encuentra al cliente', await page.locator('table').getByText('Cliente E2E Pérez').isVisible());
  await audit(page, 'admin-clientes');

  // Conversación
  await page.goto(customerUrl);
  await Promise.all([page.waitForURL(/\/admin\/conversaciones\/[0-9a-f-]{36}$/), page.click('button:has-text("Conversación")')]);
  check('ventana cerrada: pide plantilla aprobada', await page.getByText('Pasaron más de 24 horas').first().isVisible());
  await page.fill('input[aria-label="Mensaje del cliente"]', 'Hola, ¿tienen relojes automáticos?');
  await page.click('button:has-text("Simular")');
  await page.waitForTimeout(6000);
  await page.reload();
  check('el mensaje simulado entra como del cliente', await page.getByText('Hola, ¿tienen relojes automáticos?').isVisible());
  check('sin clave de Anthropic queda para el equipo', await page.getByText('Requiere atención').first().isVisible());
  await page.fill('#composer-body', 'Hola, sí: te paso opciones en un momento.');
  await page.click('button[aria-label="Enviar"]');
  await page.waitForFunction(() => document.querySelector('#composer-body')?.value === '', null, { timeout: 20000 });
  await page.reload();
  check('respuesta del equipo enviada', await page.getByText('te paso opciones en un momento').isVisible());
  check('al responder, la conversación pasa al equipo', await page.getByText('Atiende el equipo').first().isVisible());
  await audit(page, 'admin-conversacion');
  await page.click('button:has-text("Devolver a la IA")');
  await page.getByText('Atiende la IA').first().waitFor();
  check('devolver a la IA', true);

  // Bandeja
  await page.goto(`${base}/admin/conversaciones`);
  check('la bandeja lista la conversación', await page.getByText('Cliente E2E Pérez').first().isVisible());
  await audit(page, 'admin-conversaciones');

  // Plantilla de campaña
  await page.goto(`${base}/admin/plantillas/nueva`);
  await page.fill('input[name=name]', 'E2E novedades');
  const preview = await page.locator('form aside').innerText();
  check('vista previa reemplaza {{nombre}}', preview.includes('Hola Ana,'), preview.slice(0, 80));
  await page.fill('textarea[name=body]', '{{nombre}}');
  check('valida reglas de WhatsApp en vivo', await page.getByText('empiezan o terminan con una variable').isVisible());
  await page.fill('textarea[name=body]', 'Hola {{nombre}}, llegaron relojes nuevos a Time. Mira el catálogo y escríbenos si alguno te gusta.');
  check('en local avisa que el botón necesita https', await page.getByText('debe empezar con https://').isVisible());
  await page.fill('input[name=button_url]', 'https://time.example/catalogo');
  await audit(page, 'admin-plantilla-nueva');
  await Promise.all([page.waitForURL(/\/admin\/plantillas\/[0-9a-f-]{36}$/), page.click('button:has-text("Guardar")')]);
  await page.click('button:has-text("Enviar a revisión")');
  await page.getByText('Lista para campañas').waitFor();
  check('plantilla aprobada (sandbox)', await page.getByText('Aprobada').first().isVisible());

  // Campaña
  await page.goto(`${base}/admin/campanas/nueva`);
  await page.fill('input[name=name]', 'E2E campaña');
  await page.selectOption('select[name=template_id]', { label: 'E2E novedades' });
  await page.locator('button[aria-pressed]', { hasText: 'e2e' }).click();
  await page.waitForFunction(() => /^\s*1\s*$/.test(document.querySelector('aside .font-display')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
  const recipients = (await page.locator('aside .font-display').first().innerText()).trim();
  check('conteo en vivo del segmento (etiqueta e2e)', recipients === '1', recipients);
  await audit(page, 'admin-campana-nueva');
  await Promise.all([page.waitForURL(/\/admin\/campanas\/[0-9a-f-]{36}$/), page.click('button:has-text("Enviar ahora")')]);
  await page.waitForTimeout(4000);
  await page.reload();
  const status = await page.locator('header').innerText();
  const sentOrQueued = /enviada/i.test(status) || (await page.getByText('Fuera del horario de envío').isVisible());
  check('campaña iniciada (enviada o esperando horario)', sentOrQueued, status.slice(0, 120));
  if (/enviando/i.test(status)) {
    await page.click('button:has-text("Cancelar")');
    await page.getByText('Cancelada').first().waitFor();
  }
  await audit(page, 'admin-campana');

  // Asistente
  await page.goto(`${base}/admin/asistente`);
  check('ajustes del asistente cargan', await page.getByText('Falta ANTHROPIC_API_KEY').isVisible());
  await page.fill('textarea[name=instructions]', 'Garantía de 1 año en todos los relojes.');
  await page.click('button:has-text("Guardar ajustes")');
  await page.getByText('Ajustes guardados').waitFor();
  const saved = await sql(`select instructions from public.assistant_settings`);
  check('guarda indicaciones del equipo', saved[0].instructions === 'Garantía de 1 año en todos los relojes.');
  await sql(`update public.assistant_settings set instructions = ''`);
  await audit(page, 'admin-asistente');

  // Menú en celular
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-PE', hasTouch: true, isMobile: true });
  await mobile.addCookies(chunks.map((chunk) => ({ ...chunk, url: base })));
  const phone = await mobile.newPage();
  await phone.goto(`${base}/admin/clientes`);
  await phone.click('button[aria-controls="admin-menu"]');
  check('menú del panel en celular', await phone.locator('#admin-menu a:has-text("Campañas")').isVisible());
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('sin scroll horizontal en celular', overflow <= 0, `overflow=${overflow}`);
  await mobile.close();

  // Registro público
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-PE' });
  const pub = await visitor.newPage();
  pub.on('pageerror', (error) => errors.push(`${pub.url()}: ${error.message}`));
  await pub.goto(`${base}/registro`);
  await audit(pub, 'registro');
  await pub.fill('#registro-name', 'Lucía Registro');
  await pub.fill('#registro-phone', '900002002');
  await pub.click('button:has-text("Registrarme")');
  await pub.getByText('Necesitamos tu autorización').waitFor();
  check('registro exige consentimiento', true);
  check('tras el error conserva lo escrito', (await pub.inputValue('#registro-name')) === 'Lucía Registro' && (await pub.inputValue('#registro-phone')) === '900002002');
  await pub.check('input[name=consent]');
  await pub.click('button:has-text("Registrarme")');
  await pub.getByText('¡Listo, Lucía!').waitFor();
  const registered = await sql(`select source, whatsapp_opt_in, opt_in_source from public.customers where phone = '51900002002'`);
  check('registro crea cliente con consentimiento', registered[0]?.source === 'registro' && registered[0]?.whatsapp_opt_in && registered[0]?.opt_in_source === 'registro', JSON.stringify(registered));
  await pub.goto(`${base}/`);
  check('footer enlaza a registro', await pub.locator('footer a[href="/registro"]').isVisible());
  await visitor.close();

  // Sin sesión el panel redirige al login
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${base}/admin/clientes`);
  check('sin sesión redirige al login', anonPage.url().includes('/admin/login'));
  await anon.close();
} catch (error) {
  check('flujo completo sin excepciones', false, error.message.slice(0, 300));
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
