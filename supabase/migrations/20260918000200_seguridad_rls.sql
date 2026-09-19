-- Time: RLS y permisos.
-- Regla general: el público solo lee el catálogo activo y los ajustes de la tienda.
-- Pedidos, administradores y la cola de borrado nunca son accesibles con la anon key:
-- los pedidos se crean y consultan desde el servidor mediante funciones (20260918000300).

alter table public.admin_users enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.asset_deletion_queue enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

-- Defensa en profundidad: además de RLS, el rol anónimo no tiene privilegios sobre lo sensible.
revoke all on table
  public.admin_users,
  public.asset_deletion_queue,
  public.orders,
  public.order_items,
  public.order_status_history
from anon;
revoke all on sequence public.order_code_seq from anon, authenticated;

-- Lectura pública del catálogo ----------------------------------------------------
create policy "Público: lee marcas" on public.brands
for select to anon, authenticated using (true);

create policy "Público: lee categorías" on public.categories
for select to anon, authenticated using (true);

create policy "Público: lee productos activos" on public.products
for select to anon, authenticated
using (status = 'active' or (select public.is_admin()));

create policy "Público: lee variantes de productos activos" on public.product_variants
for select to anon, authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and (p.status = 'active' or (select public.is_admin()))
  )
);

create policy "Público: lee imágenes de productos activos" on public.product_images
for select to anon, authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and (p.status = 'active' or (select public.is_admin()))
  )
);

-- Los datos de pago (cuentas, Yape, Plin) se muestran al cliente tras su pedido: son públicos.
create policy "Público: lee ajustes de la tienda" on public.store_settings
for select to anon, authenticated using (true);

-- Administración ----------------------------------------------------------------
create policy "Admin: gestiona marcas" on public.brands
for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: gestiona categorías" on public.categories
for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: gestiona productos" on public.products
for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: gestiona variantes" on public.product_variants
for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: gestiona imágenes" on public.product_images
for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: actualiza ajustes" on public.store_settings
for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: ve administradores" on public.admin_users
for select to authenticated using ((select public.is_admin()));

create policy "Admin: ve la cola de borrado" on public.asset_deletion_queue
for select to authenticated using ((select public.is_admin()));

-- Pedidos: el admin los lee y edita notas internas. Los cambios de estado pasan por
-- set_order_status() para mantener stock, fechas e historial consistentes.
create policy "Admin: ve pedidos" on public.orders
for select to authenticated using ((select public.is_admin()));

create policy "Admin: edita pedidos" on public.orders
for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin: ve ítems de pedidos" on public.order_items
for select to authenticated using ((select public.is_admin()));

create policy "Admin: ve historial de pedidos" on public.order_status_history
for select to authenticated using ((select public.is_admin()));

-- Un admin solo puede editar columnas "blandas" del pedido desde la API;
-- estado, montos y fechas quedan en manos de las funciones.
revoke update on table public.orders from authenticated;
grant update (internal_notes, customer_phone, shipping_address, shipping_city, notes) on table public.orders to authenticated;
