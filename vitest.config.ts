import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // Fuera de Next no existe el entorno "react-server": el guard se reemplaza por su versión vacía.
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: { include: ['src/**/*.test.ts'], exclude: ['src/**/*.integration.test.ts'], environment: 'node' },
});
