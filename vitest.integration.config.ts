import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Pruebas contra la base de datos real (Supabase de .env.local) con el proveedor de WhatsApp en modo
// sandbox. Cada prueba crea sus propios clientes de prueba (teléfonos 5190000xxxx) y los borra al final.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    env: { ...loadEnv('test', process.cwd(), ''), WHATSAPP_PROVIDER: 'sandbox', ASSISTANT_DEBOUNCE_MS: '0' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
