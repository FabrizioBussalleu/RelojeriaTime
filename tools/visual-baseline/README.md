# Línea base visual

Capturas deterministas del storefront legado (Vite) para comparar píxel a píxel el port a Next.js.
`baseline/` es la referencia: 10 vistas × 3 viewports (375, 768 y 1440 px).

## Cómo funciona

- **Datos:** Supabase se reemplaza por un mock de PostgREST (`lib/network.mjs`) que lee `fixtures/*.json`.
  Incluye un producto inactivo y uno sin stock para comprobar que el port filtra igual que el legado.
- **Imágenes:** los relojes de `fixtures/images/` se generan por código (`npm run fixtures:images`).
  No dependen de fotos externas.
- **Recursos externos:** Google Fonts y la foto del hero se descargan una vez a `.cache/` (ignorada por git).
  Con `--offline` solo se usa la caché. Cualquier otro host se bloquea y queda registrado en `manifest.json`.
- **Animaciones:** el script recorre la página hasta que ningún `whileInView` quede con `opacity: 0`
  y captura con las animaciones CSS desactivadas. Si algo queda oculto, lo avisa en consola y en el manifest.

Dos corridas completas sobre el mismo build dan 0 píxeles de diferencia.

## Uso

```bash
npm install
npx playwright install chromium

# Capturar (con la app ya levantada; el legado se sirve con `vite preview --port 4173`)
node capture.mjs --base-url http://localhost:4173 --out output/current --offline

# Comparar contra la referencia; genera output/diff/report.html
node compare.mjs --baseline baseline --current output/current --out output/diff
```

Opciones de `capture.mjs`: `--only home,checkout`, `--viewports mobile,desktop`, `--offline`.
Opciones de `compare.mjs`: `--max-ratio 0.001` (0,1 % de píxeles) y `--pixel-threshold 0.1`.

Las capturas dependen del motor de render. Baseline y comparación deben correr con el mismo Chromium
(Playwright está fijado en `package.json`) y en la misma máquina o imagen de CI.

## Para el port a Next.js

Next obtiene los datos en el servidor, así que Playwright no puede interceptarlos. Durante el port 1:1,
la app de Next debe leer estos mismos `fixtures/*.json` en un modo de fixtures (variable de entorno)
en lugar de consultar Supabase. Las imágenes (`https://fixtures.invalid/...`) sí las intercepta Playwright.
