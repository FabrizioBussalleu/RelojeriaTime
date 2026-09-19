// Catálogo de demostración para revisar la tienda antes de cargar productos reales desde el panel.
//
//   node scripts/demo-catalog.mjs            Crea 8 relojes demo (marcas ficticias) con imágenes en Cloudinary.
//   node scripts/demo-catalog.mjs --remove   Elimina todo lo demo: filas (slug "demo-…") e imágenes.
//
// Usa la Management API de Supabase y la Admin/Upload API de Cloudinary con las credenciales de .env.local.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES_DIR = join(ROOT, 'tools', 'visual-baseline', 'fixtures', 'images');

const env = Object.fromEntries(
  (existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8') : '')
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2]])
);
const need = (name) => env[name] || process.env[name] || (console.error(`Falta ${name} en .env.local`), process.exit(1));
const projectRef = need('SUPABASE_PROJECT_REF');
const token = need('SUPABASE_ACCESS_TOKEN');
const cloud = need('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME');
const apiKey = need('CLOUDINARY_API_KEY');
const apiSecret = need('CLOUDINARY_API_SECRET');
const folderBase = env.CLOUDINARY_FOLDER || 'imagenes';
const cloudinaryAuth = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(payload?.message ?? `Error ${response.status}`);
  return payload;
}

const literal = (value) => (value === null ? 'null' : `'${String(value).replace(/'/g, "''")}'`);

async function upload(folder, file) {
  const params = { asset_folder: folder, public_id_prefix: `${folder}/`, timestamp: Math.floor(Date.now() / 1000) };
  const signature = createHash('sha1')
    .update(Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&') + apiSecret)
    .digest('hex');
  const form = new FormData();
  form.append('file', new Blob([readFileSync(join(IMAGES_DIR, file))], { type: 'image/png' }), file);
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  form.append('api_key', apiKey);
  form.append('signature', signature);
  const result = await (await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form })).json();
  if (result.error) throw new Error(result.error.message);
  return { publicId: result.public_id, width: result.width, height: result.height };
}

async function destroyFolder(folder) {
  const query = new URLSearchParams({ prefix: `${folder}/`, invalidate: 'true' });
  await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload?${query}`, { method: 'DELETE', headers: { Authorization: cloudinaryAuth } });
  await fetch(`https://api.cloudinary.com/v1_1/${cloud}/folders/${folder}`, { method: 'DELETE', headers: { Authorization: cloudinaryAuth } });
}

const BRANDS = ['Aurum', 'Nordik', 'Marea', 'Vértice'];
const SPECS = (diameter, material, water) => [
  { label: 'Diámetro', value: diameter },
  { label: 'Material de la caja', value: material },
  { label: 'Resistencia al agua', value: water },
];
const PRODUCTS = [
  { name: 'Aurora 40', brand: 'Aurum', gender: 'mujer', movement: 'cuarzo', price: 890, images: ['watch-01.png', 'watch-04.png'], variants: [{ label: 'Única', stock: 12 }], specs: SPECS('40 mm', 'Acero inoxidable', '5 ATM') },
  { name: 'Meridian Automático', brand: 'Aurum', gender: 'hombre', movement: 'automatico', price: 1450, compareAt: 1690, images: ['watch-02.png'], variants: [{ label: 'Única', stock: 3 }], specs: SPECS('41 mm', 'Acero y bisel dorado', '10 ATM') },
  { name: 'Norte Field', brand: 'Nordik', gender: 'hombre', movement: 'cuarzo', price: 620, images: ['watch-03.png', 'watch-08.png'], variants: [{ label: '38 mm', stock: 4 }, { label: '42 mm', stock: 2, price: 660 }], specs: SPECS('38 o 42 mm', 'Acero cepillado', '10 ATM') },
  { name: 'Clásico 36', brand: 'Marea', gender: 'mujer', movement: 'mecanico', price: 540, images: ['watch-04.png'], variants: [{ label: 'Única', stock: 20 }], specs: SPECS('36 mm', 'Acero pulido', '3 ATM') },
  { name: 'Diver Negro 42', brand: 'Marea', gender: 'hombre', movement: 'automatico', price: 1180, images: ['watch-05.png'], variants: [{ label: 'Única', stock: 2 }], specs: SPECS('42 mm', 'Acero con PVD negro', '20 ATM') },
  { name: 'Verde Bosque', brand: 'Vértice', gender: 'unisex', movement: 'solar', price: 760, images: ['watch-06.png'], variants: [{ label: 'Única', stock: 6 }], specs: SPECS('39 mm', 'Acero cepillado', '10 ATM') },
  { name: 'Heritage Bronce', brand: 'Vértice', gender: 'hombre', movement: 'mecanico', price: 980, images: ['watch-07.png'], variants: [{ label: 'Única', stock: 0 }], specs: SPECS('40 mm', 'Bronce', '5 ATM') },
  { name: 'Nocturno GMT', brand: 'Nordik', gender: 'unisex', movement: 'automatico', price: 1320, images: ['watch-08.png', 'watch-02.png'], variants: [{ label: 'Única', stock: 9 }], specs: SPECS('40 mm', 'Acero inoxidable', '10 ATM') },
];

const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function remove() {
  const products = await sql("select id from public.products where slug like 'demo-%'");
  await sql(`delete from public.products where slug like 'demo-%';
    delete from public.brands where slug like 'demo-%';
    delete from public.categories where slug like 'demo-%';`);
  // El trigger encoló sus imágenes; aquí se destruye cada carpeta completa y se vacía su parte de la cola.
  for (const { id } of products) {
    const folder = `${folderBase}/products/${id}`;
    await destroyFolder(folder);
    await sql(`delete from public.asset_deletion_queue where public_id like ${literal(`${folder}/%`)}`);
  }
  console.log(`✓ eliminados ${products.length} productos demo y sus imágenes`);
}

async function seed() {
  const [{ existing }] = await sql("select count(*)::int as existing from public.products where slug like 'demo-%'");
  if (existing) {
    console.log(`Ya hay ${existing} productos demo. Usa --remove antes de volver a crearlos.`);
    return;
  }
  const brandIds = Object.fromEntries(BRANDS.map((name) => [name, randomUUID()]));
  const categoryId = randomUUID();
  const statements = [
    ...BRANDS.map((name, index) => `insert into public.brands (id, name, slug, position) values (${literal(brandIds[name])}, ${literal(name)}, ${literal(`demo-${slugify(name)}`)}, ${index});`),
    `insert into public.categories (id, name, slug) values (${literal(categoryId)}, 'Relojes', 'demo-relojes');`,
  ];

  for (const [index, product] of PRODUCTS.entries()) {
    const id = randomUUID();
    const folder = `${folderBase}/products/${id}`;
    const uploads = [];
    for (const file of product.images) uploads.push(await upload(folder, file));
    statements.push(
      `insert into public.products (id, slug, name, description, brand_id, category_id, price, compare_at_price, status, position, gender, movement, specs)
       values (${literal(id)}, ${literal(`demo-${slugify(product.name)}`)}, ${literal(product.name)},
       ${literal(`Producto de demostración. Se elimina con: npm run demo:remove`)}, ${literal(brandIds[product.brand])}, ${literal(categoryId)},
       ${product.price}, ${product.compareAt ?? 'null'}, 'active', ${index + 1}, ${literal(product.gender)}, ${literal(product.movement)},
       ${literal(JSON.stringify(product.specs))}::jsonb);`,
      ...product.variants.map(
        (variant, position) =>
          `insert into public.product_variants (product_id, label, stock, price_override, position) values (${literal(id)}, ${literal(variant.label)}, ${variant.stock}, ${variant.price ?? 'null'}, ${position});`
      ),
      ...uploads.map(
        (image, position) =>
          `insert into public.product_images (product_id, public_id, width, height, position, is_primary) values (${literal(id)}, ${literal(image.publicId)}, ${image.width}, ${image.height}, ${position}, ${position === 0});`
      )
    );
    console.log(`  · ${product.name} (${uploads.length} ${uploads.length === 1 ? 'imagen' : 'imágenes'})`);
  }
  await sql(`begin;\n${statements.join('\n')}\ncommit;`);
  console.log(`✓ ${PRODUCTS.length} relojes demo creados`);
}

if (process.argv.includes('--remove')) await remove();
else await seed();
