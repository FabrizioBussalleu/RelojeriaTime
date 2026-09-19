# Time

Relojería online. Next.js 16 (App Router) + Supabase + Cloudinary, desplegada en Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar credenciales
npm run dev
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo, build de producción y servidor |
| `npm run lint` / `typecheck` | ESLint (config de Next) y TypeScript estricto |
| `npm run db:check` | Ensaya las migraciones pendientes y las pruebas SQL en una transacción con ROLLBACK |
| `npm run db:migrate` | Aplica las migraciones pendientes de `supabase/migrations` |
| `npm run db:test` | Corre `supabase/tests` contra la base actual (con ROLLBACK, no deja datos) |
| `npm run db:types` | Regenera `src/lib/supabase/database.types.ts` |
| `npm test` | Pruebas unitarias (plantillas, búsqueda y armado de respuestas del asistente) |
| `npm run test:integration` | Webhook, asistente y campañas contra la base real con WhatsApp en modo sandbox (crea y borra sus datos) |

Los scripts de base usan la Management API de Supabase (`SUPABASE_ACCESS_TOKEN` en `.env.local`).

Pruebas de punta a punta: `npm run build && npm start` y, en otra terminal, `npm run e2e` (tienda, panel y CRM; crean y borran sus propios datos). Publicación, variables de Vercel y verificación: [`docs/despliegue.md`](docs/despliegue.md).

## Estructura

- `src/app`: rutas. `api/admin/cloudinary/sign` firma subidas del panel; `api/cron/maintenance` es el cron diario (ver `vercel.json`).
- `src/proxy.ts`: refresca la sesión de Supabase y protege `/admin` (chequeo optimista; la autorización real está en `src/lib/auth.ts`).
- `src/lib/supabase`: clientes (público, sesión, service role) y tipos generados.
- `src/lib/cloudinary`: URLs con transformaciones, firma, borrado y mantenimiento.
- `src/lib/whatsapp`: proveedor (Meta, 360dialog o sandbox), envío con la regla de 24 horas y webhook (`api/whatsapp/webhook`).
- `src/lib/assistant`: asistente de IA (herramientas de búsqueda sobre el stock, respuesta estructurada y orquestación por conversación).
- `src/lib/crm`: plantillas con `{{nombre}}`, segmentos y campañas por tandas.
- `src/app/admin/(panel)`: panel. Primero la tienda (resumen, productos, pedidos, organizador, estadísticas, ajustes) y después WhatsApp y clientes (conversaciones, clientes, campañas, plantillas, asistente).
- `src/components/admin/products`: formulario de producto, subida de fotos a Cloudinary y editor no destructivo (recorte, brillo, contraste).
- `supabase/migrations` y `supabase/tests`: esquema, RLS, funciones y sus pruebas.
- `tools/visual-baseline`: capturas de referencia del sitio legado y comparador píxel a píxel.

## Reglas de negocio clave

- **Productos:** `save_product` guarda producto, variantes y fotos en una sola transacción. Las fotos se suben firmadas a la carpeta del producto antes de guardar; cancelar el formulario las borra y el cron limpia lo que quede.
- **Correos de pedido:** cada pedido envía por SMTP un aviso a la tienda y la confirmación al cliente (código, detalle y cómo pagar), después de responder al checkout. Sin `SMTP_USER`/`SMTP_PASSWORD` no se envía nada; los correos de prueba (`@example.com`, `.invalid`) nunca reciben correo.
- **Ficha que ya no está disponible:** un producto archivado o eliminado redirige al inicio con un aviso. Si la ficha se abrió desde la caché (volver atrás tras comprar la última unidad), el stock se confirma en vivo (`/api/stock`) y, si se agotó, también lleva al inicio.
- **Edición en la lista:** cada producto se edita en un desplegable dentro de `/admin/productos`; se pueden abrir varios, guardarlos juntos ("Guardar todos") o seleccionarlos para publicar, archivar o agotar en bloque. Publicar exige al menos una foto.
- **Organizador:** fija el orden de "Destacados" en la tienda arrastrando las tarjetas (en el celular, mantener presionado; con teclado, espacio y flechas). Con "agotados al final" activo (por defecto) los agotados van siempre al final, en gris.
- **Estadísticas:** venta = pedido con pago confirmado y no cancelado, fechado por `paid_at` en hora de Lima (`sales_kpis`, `sales_series`, `sales_breakdown`).
- **Eliminar un producto borra sus imágenes en Cloudinary.** Un trigger encola cada imagen que sale de la base; el servidor la destruye y el cron reintenta lo que falle. Agotar o archivar no toca las imágenes. Si era el último reloj de su marca o categoría, esa marca o categoría también se elimina (trigger `products_remove_unused_taxonomy`), así desaparece de la selección rápida.
- **Los pedidos se crean en la base con `create_order`**: precios y stock se leen y descuentan en una transacción; el navegador solo envía IDs y cantidades.
- **La anon key solo lee el catálogo activo y los ajustes.** Pedidos, administradores y la cola de borrado no son accesibles desde el navegador.
- **Acceso al panel:** usuario de Supabase Auth con fila en `admin_users`. El registro público está desactivado. Con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`, el ingreso pasa primero por el verificador de Cloudflare Turnstile (corta los intentos automáticos por fuerza bruta antes de llegar a Supabase); sin esas claves el formulario funciona igual.
- **Un cliente por número de WhatsApp.** Compras, registro en `/registro`, mensajes entrantes y altas manuales pasan por `upsert_customer`, que normaliza el teléfono y completa datos sin duplicar.
- **WhatsApp:** solo el primer mensaje de una campaña (o escribir a alguien que no escribe hace más de 24 h) usa plantilla aprobada. Dentro de las 24 h siguientes a un mensaje del cliente, la IA y el equipo escriben libremente.
- **Campañas solo a clientes con consentimiento vigente**, de 9:00 a 21:00 (Lima) y con límite diario. "BAJA" da de baja y "ALTA" vuelve a suscribir.
- **El asistente no inventa relojes ni precios:** el modelo elige ids de productos consultando el stock con herramientas; nombres, precios, enlaces y fotos los arma el servidor desde la base. Deriva al equipo cuando el cliente quiere comprar, pagar o reclamar, y se pausa cuando alguien del equipo escribe.

## Comparación visual

`TIME_DATA_SOURCE=fixtures` hace que la app lea `tools/visual-baseline/fixtures` en lugar de Supabase, para compararla contra las capturas del sitio legado (ver el README de esa carpeta).
