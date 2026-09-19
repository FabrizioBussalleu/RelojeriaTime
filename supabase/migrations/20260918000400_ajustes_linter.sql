-- Time: ajustes tras el linter de Supabase (advisors de seguridad y rendimiento).
-- 1) is_admin() pasa a SECURITY INVOKER: cada usuario solo puede leer su propia fila en
--    admin_users, que es todo lo que la función necesita. El rol anónimo ya no la ejecuta.
-- 2) Una sola política permisiva por rol y acción: las "for all" del admin duplicaban la lectura.
-- 3) reorder_products() pasa a SECURITY INVOKER: las políticas del admin alcanzan.
-- 4) La función del trigger de borrado no se expone como RPC.
-- 5) Índices para claves foráneas sin cubrir.
-- set_order_status() sigue siendo SECURITY DEFINER a propósito: toca stock y columnas que el
-- admin no puede escribir directo, y valida is_admin() por dentro.

-- 1) Administradores ----------------------------------------------------------------
drop policy "Admin: ve administradores" on public.admin_users;
create policy "Usuario: ve su propia fila de admin" on public.admin_users
for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2) Catálogo: lectura anónima sin is_admin(), lectura autenticada combinada, escritura por acción
drop policy "Admin: gestiona marcas" on public.brands;
create policy "Admin: crea marcas" on public.brands for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edita marcas" on public.brands for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: elimina marcas" on public.brands for delete to authenticated using ((select public.is_admin()));

drop policy "Admin: gestiona categorías" on public.categories;
create policy "Admin: crea categorías" on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edita categorías" on public.categories for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: elimina categorías" on public.categories for delete to authenticated using ((select public.is_admin()));

drop policy "Público: lee productos activos" on public.products;
drop policy "Admin: gestiona productos" on public.products;
create policy "Anónimo: lee productos activos" on public.products for select to anon using (status = 'active');
create policy "Autenticado: lee activos, o todo si es admin" on public.products for select to authenticated
using (status = 'active' or (select public.is_admin()));
create policy "Admin: crea productos" on public.products for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edita productos" on public.products for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: elimina productos" on public.products for delete to authenticated using ((select public.is_admin()));

drop policy "Público: lee variantes de productos activos" on public.product_variants;
drop policy "Admin: gestiona variantes" on public.product_variants;
create policy "Anónimo: lee variantes de productos activos" on public.product_variants for select to anon
using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy "Autenticado: lee variantes visibles" on public.product_variants for select to authenticated
using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'active' or (select public.is_admin()))));
create policy "Admin: crea variantes" on public.product_variants for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edita variantes" on public.product_variants for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: elimina variantes" on public.product_variants for delete to authenticated using ((select public.is_admin()));

drop policy "Público: lee imágenes de productos activos" on public.product_images;
drop policy "Admin: gestiona imágenes" on public.product_images;
create policy "Anónimo: lee imágenes de productos activos" on public.product_images for select to anon
using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy "Autenticado: lee imágenes visibles" on public.product_images for select to authenticated
using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'active' or (select public.is_admin()))));
create policy "Admin: crea imágenes" on public.product_images for insert to authenticated with check ((select public.is_admin()));
create policy "Admin: edita imágenes" on public.product_images for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: elimina imágenes" on public.product_images for delete to authenticated using ((select public.is_admin()));

-- 3) Organizador ---------------------------------------------------------------------
create or replace function public.reorder_products(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  update public.products p
  set position = ordered.position
  from unnest(p_ids) with ordinality as ordered(id, position)
  where p.id = ordered.id;
end;
$$;

-- 4) Trigger de borrado --------------------------------------------------------------
revoke execute on function public.enqueue_image_deletion() from public, anon, authenticated;

-- 5) Índices -----------------------------------------------------------------------
create index order_items_variant_id_idx on public.order_items (variant_id);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);
