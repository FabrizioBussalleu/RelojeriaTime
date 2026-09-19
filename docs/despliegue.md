# Despliegue de Time

Guía para publicar la tienda en Vercel y mantenerla. La base (Supabase, proyecto `tdtieaqsgnpfrnkoqsne`, São Paulo) y Cloudinary (`e3hbuvdz`) ya están en producción: las migraciones están aplicadas.

## 1. Proyecto en Vercel

1. En Vercel: **Add New → Project → Import** el repositorio de GitHub.
2. Framework: Next.js (se detecta solo). Node.js 22. Sin cambios en comandos de build.
3. `vercel.json` ya fija:
   - **Región `gru1` (São Paulo)**, junto a la base: cada consulta evita cruzar el continente.
   - **Cron diario** a las 10:00 de Lima (`/api/cron/maintenance`): vence pedidos sin pagar, reintenta borrados en Cloudinary, limpia fotos huérfanas, actualiza plantillas de WhatsApp y continúa campañas.
4. Variables de entorno (Settings → Environment Variables). *Secreta* = marcarla como Sensitive.

| Variable | Entornos | Secreta | De dónde sale |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | no | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview | no | Supabase → API keys (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | **sí** | Supabase → API keys (secret) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Production, Preview | no | `e3hbuvdz` |
| `CLOUDINARY_API_KEY` | Production, Preview | **sí** | Cloudinary → Settings → API Keys |
| `CLOUDINARY_API_SECRET` | Production, Preview | **sí** | ídem |
| `CLOUDINARY_FOLDER` | Production, Preview | no | `imagenes` |
| `NEXT_PUBLIC_SITE_URL` | Production | no | `https://tu-dominio` (en Preview se usa la URL del despliegue) |
| `CRON_SECRET` | Production | **sí** | Texto aleatorio largo: `openssl rand -base64 32` |
| `ORDER_LINK_SECRET` | Production, Preview | **sí** | Texto aleatorio largo (firma los enlaces de pedido; si cambia, los enlaces ya enviados dejan de funcionar) |
| `ANTHROPIC_API_KEY` | Production | **sí** | console.anthropic.com (asistente de WhatsApp; sin ella los mensajes quedan para el equipo) |
| `WHATSAPP_PROVIDER` | Production | no | `sandbox` hasta conectar WhatsApp; luego `meta` o `360dialog` |
| `SMTP_USER` | Production | no | Correo que envía los avisos de pedido, p. ej. `contact.time.pe@gmail.com` |
| `SMTP_PASSWORD` | Production | **sí** | Contraseña de aplicación de esa cuenta de Gmail (ver abajo) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Production, Preview | no | Cloudflare → Turnstile → widget → Site Key |
| `TURNSTILE_SECRET_KEY` | Production, Preview | **sí** | Ídem → Secret Key |

   Solo si se conecta WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (Meta) o `D360_API_KEY`, `WHATSAPP_WEBHOOK_SECRET` (360dialog). Webhook: `https://tu-dominio/api/whatsapp/webhook`.

   **Correos de pedido (gratis con Gmail):** en la cuenta de la tienda activar la verificación en 2 pasos y crear una contraseña de aplicación en myaccount.google.com/apppasswords (16 letras). Con `SMTP_USER` y `SMTP_PASSWORD` cada pedido envía un aviso al correo de contacto de Ajustes (o a `ORDER_NOTIFICATION_EMAIL`) y la confirmación al cliente, con el código, el detalle y cómo pagar. Gmail permite unos 500 destinatarios al día. Con dominio propio conviene pasar a Brevo o Resend cambiando `SMTP_HOST`, `SMTP_PORT` y las credenciales. Los pedidos con correos de prueba (`@example.com`, `.test`, `.invalid`) no envían nada.

   **Verificador del panel (Cloudflare Turnstile, gratis):** en dash.cloudflare.com → Turnstile → *Add widget*, modo **Managed**, y agregar los dominios donde corre el panel (el dominio propio, `www`, el `*.vercel.app` del proyecto y `localhost` para probar en la computadora). Con las dos claves puestas, el ingreso al panel exige la verificación antes de consultar la contraseña; sin claves, el formulario funciona igual (desarrollo). Si Cloudflare no responde, el ingreso sigue habilitado para no dejar a la dueña fuera del panel.

   **No** van en Vercel: `SUPABASE_PROJECT_REF` y `SUPABASE_ACCESS_TOKEN` (solo para las migraciones desde una computadora o GitHub Actions).

5. Deploy. Cada push a `main` publica en producción; cada rama o pull request genera una vista previa.

## 2. Dominio

Settings → Domains → agregar `tu-dominio` y `www.tu-dominio` (Vercel indica los registros DNS: `A 76.76.21.21` para el dominio raíz y `CNAME cname.vercel-dns.com` para `www`). Después, actualizar `NEXT_PUBLIC_SITE_URL` y volver a desplegar.

## 3. Ajustes fuera del código

- **Supabase → Authentication → Settings:** activar *Leaked password protection*. El registro público debe seguir desactivado (los administradores se crean en Authentication → Users y se les da acceso en el panel → Ajustes).
- **Netlify:** el sitio viejo (`alex-artesano.netlify.app`) se puede borrar o redirigir al dominio nuevo (Site configuration → Domain management o un `_redirects` con `/* https://tu-dominio/:splat 301!`).
- **Credenciales compartidas durante el desarrollo:** rotar el token `sbp_` de Supabase y el API secret de Cloudinary, y actualizar Vercel y `.env.local`.

## 4. Verificación después de publicar

1. Home, un producto y "Ver más". Compartir el enlace de un producto por WhatsApp muestra foto, nombre y precio.
2. Pedido real de prueba (Yape) con tu correo → llegan los dos correos (tienda y cliente) → aparece en Panel → Pedidos → cancelarlo (el stock vuelve).
3. Panel: ingresar (aparece el verificador de Cloudflare), crear un producto con una foto, editarla, publicarla, verla en la tienda y eliminarlo (la foto desaparece de Cloudinary).
4. Cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/maintenance` responde `{"ok":true,...}`.
5. Rendimiento: PageSpeed Insights de la home y de un producto (objetivo ≥ 90 en celular).

## 5. Migraciones y pruebas

- `npm run db:check` ensaya las migraciones pendientes y todas las pruebas SQL en una transacción que se revierte.
- `npm run db:migrate` aplica las pendientes (primero en un momento tranquilo; son hacia adelante, no se deshacen solas).
- En GitHub Actions, **CI** corre tipos, lint, pruebas y build en cada push y pull request; el ensayo de base corre si el repo tiene los secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_PROJECT_REF`.
- **E2E** (manual, Actions → E2E → Run workflow) recorre la tienda, el panel y el CRM contra producción con datos de prueba que se borran al final. Necesita además los secretos `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ORDER_LINK_SECRET`, `CRON_SECRET` y las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. En local: `npm run build && npm start` y `npm run e2e`.

## 6. Volver atrás

- **Código:** Vercel → Deployments → el despliegue anterior → *Instant Rollback*.
- **Base:** las migraciones no se revierten solas; ante un problema, escribir una migración correctiva y ensayarla con `npm run db:check`.
