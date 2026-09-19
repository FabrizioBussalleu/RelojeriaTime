// Migraciones de Supabase vía Management API (no requiere la contraseña de la base ni Docker).
//
//   node scripts/db-migrate.mjs --check   Ensaya las migraciones pendientes y las pruebas en una transacción con ROLLBACK.
//   node scripts/db-migrate.mjs           Aplica las pendientes, cada una en su propia transacción.
//   node scripts/db-migrate.mjs --test    Corre las pruebas contra la base actual (también con ROLLBACK).
//   node scripts/db-migrate.mjs --types   Regenera src/lib/supabase/database.types.ts desde la base.
//
// Lee SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF de .env.local. Registra lo aplicado en
// supabase_migrations.schema_migrations, la misma tabla que usa el CLI de Supabase.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const TESTS_DIR = join(ROOT, 'supabase', 'tests');

const { values: args } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    test: { type: 'boolean', default: false },
    types: { type: 'boolean', default: false },
  },
});

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

loadEnvFile(join(ROOT, '.env.local'));
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!token || !projectRef) {
  console.error('Faltan SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF en .env.local');
  process.exit(1);
}

async function runSql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && !Array.isArray(payload) && payload.message)) {
    throw new Error(payload?.message ?? `La Management API respondió ${response.status}`);
  }
  return payload ?? [];
}

// Etiqueta de dollar quoting que no aparece en el contenido.
function dollarQuote(text) {
  let tag = 'migration';
  while (text.includes(`$${tag}$`)) tag += '_x';
  return `$${tag}$${text}$${tag}$`;
}

const TRACKING_SQL = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);`;

if (args.types) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/types/typescript?included_schemas=public`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payload = await response.json();
  if (!response.ok || typeof payload.types !== 'string') {
    throw new Error(payload?.message ?? `No se pudieron generar los tipos (${response.status})`);
  }
  const target = join(ROOT, 'src', 'lib', 'supabase', 'database.types.ts');
  writeFileSync(target, `// Generado con \`npm run db:types\`. No editar a mano.\n${payload.types}`);
  console.log(`✓ tipos escritos en ${target}`);
  process.exit(0);
}

const readSqlFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith('.sql'))
        .sort()
        .map((file) => ({ file, sql: readFileSync(join(dir, file), 'utf8') }))
    : [];

const migrations = readSqlFiles(MIGRATIONS_DIR).map(({ file, sql }) => {
  const match = /^(\d+)_(.+)\.sql$/.exec(file);
  if (!match) throw new Error(`Nombre de migración inválido: ${file} (se espera <versión>_<nombre>.sql)`);
  return { version: match[1], name: match[2], file, sql };
});
const tests = readSqlFiles(TESTS_DIR);

const [{ exists: trackingExists }] = await runSql(
  "select to_regclass('supabase_migrations.schema_migrations') is not null as exists;"
);
const applied = new Set(
  trackingExists ? (await runSql('select version from supabase_migrations.schema_migrations;')).map((row) => row.version) : []
);
const pending = migrations.filter((migration) => !applied.has(migration.version));

console.log(`Proyecto ${projectRef}: ${applied.size} aplicadas, ${pending.length} pendientes.`);
pending.forEach((migration) => console.log(`  · ${migration.file}`));

function printResults(rows) {
  if (!rows.length || !('passed' in rows[0])) {
    console.log('Las pruebas no devolvieron resultados.');
    return false;
  }
  for (const row of rows) {
    console.log(`${row.passed ? '✓' : '✗'} ${row.name}${!row.passed && row.detail ? `\n    ${row.detail}` : ''}`);
  }
  const failed = rows.filter((row) => !row.passed).length;
  console.log(`\n${rows.length - failed}/${rows.length} pruebas OK.`);
  return failed === 0;
}

if (args.check || args.test) {
  const body = [
    'begin;',
    ...(args.check ? pending.map((migration) => `${migration.sql}\n;`) : []),
    ...tests.map((test) => `${test.sql}\n;`),
    'rollback;',
  ].join('\n');
  console.log(args.check ? '\nEnsayo (ROLLBACK): migraciones pendientes + pruebas' : '\nPruebas (ROLLBACK) sobre la base actual');
  const ok = printResults(await runSql(body));
  process.exit(ok ? 0 : 1);
}

if (!pending.length) {
  console.log('Nada que aplicar.');
  process.exit(0);
}

await runSql(TRACKING_SQL);
for (const migration of pending) {
  await runSql(`begin;
${migration.sql}
;
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${migration.version}', '${migration.name}', array[${dollarQuote(migration.sql)}]);
commit;`);
  console.log(`✓ aplicada ${migration.file}`);
}
