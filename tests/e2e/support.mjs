// Soporte común de las pruebas de punta a punta (Playwright + axe). Corren contra un build servido
// (npm run build && npm start) conectado a la base y a Cloudinary de .env.local o del entorno.
// Cada prueba crea sus propios datos (teléfonos 5190000…, correos @pruebas.invalid, productos "E2E …")
// y los borra al terminar.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[2]])
  );
}

// Las variables del entorno (CI) tienen prioridad sobre .env.local.
export const env = { ...readEnvFile(join(ROOT, '.env.local')), ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value)) };

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN'];
const missing = REQUIRED.filter((name) => !env[name]);
if (missing.length) {
  console.error(`Faltan variables para las pruebas e2e: ${missing.join(', ')}`);
  process.exit(1);
}

export const BASE_URL = env.E2E_BASE_URL || 'http://localhost:3000';
export const OUTPUT_DIR = join(ROOT, 'test-results', 'e2e');
mkdirSync(OUTPUT_DIR, { recursive: true });
export const FIXTURE_IMAGES = join(ROOT, 'tools', 'visual-baseline', 'fixtures', 'images');
export const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

// SQL por la Management API de Supabase. Reintenta cortes de red (ECONNRESET, timeouts) para que un
// fallo pasajero no deje datos de prueba sin limpiar.
export async function sql(query, { attempts = 4 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status >= 500 || response.status === 429) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw Object.assign(new Error(JSON.stringify(payload)), { final: true });
      return payload;
    } catch (error) {
      if (error.final || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Ejecuta cada paso de limpieza aunque uno falle, y avisa cuáles quedaron pendientes.
export async function cleanupSteps(steps) {
  const failed = [];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      failed.push(`${name}: ${error.message}`);
    }
  }
  if (failed.length) console.error(`Limpieza incompleta (revisa a mano):\n  ${failed.join('\n  ')}`);
  return failed;
}
