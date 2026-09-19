-- Pruebas: las marcas y categorías que se quedan sin relojes se eliminan solas.
-- Corren dentro de una transacción con ROLLBACK (scripts/db-migrate.mjs).

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_admin uuid := gen_random_uuid();
  v_brand uuid;
  v_other_brand uuid;
  v_category uuid;
  v_a uuid;
  v_b uuid;
  v_kept boolean;
  v_brand_gone boolean;
  v_category_kept boolean;
  v_both_gone boolean;
begin
  insert into auth.users (id, email, aud, role) values (v_admin, 'admin-marcas@pruebas.invalid', 'authenticated', 'authenticated');
  insert into public.admin_users (user_id) values (v_admin);
  insert into public.brands (name, slug) values ('Marca Sola', 'marca-sola') returning id into v_brand;
  insert into public.brands (name, slug) values ('Marca Nueva', 'marca-nueva') returning id into v_other_brand;
  insert into public.categories (name, slug) values ('Categoría Sola', 'categoria-sola') returning id into v_category;
  insert into public.products (slug, name, price, status, brand_id, category_id) values ('reloj-marca-a', 'Reloj A', 100, 'active', v_brand, v_category) returning id into v_a;
  insert into public.products (slug, name, price, status, brand_id, category_id) values ('reloj-marca-b', 'Reloj B', 100, 'archived', v_brand, v_category) returning id into v_b;

  -- Como admin, igual que desde el panel. Las comprobaciones se guardan y se registran al volver al rol original.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  delete from public.products where id = v_a;
  v_kept := exists (select 1 from public.brands where id = v_brand) and exists (select 1 from public.categories where id = v_category);

  update public.products set brand_id = v_other_brand where id = v_b;
  v_brand_gone := not exists (select 1 from public.brands where id = v_brand);
  v_category_kept := exists (select 1 from public.categories where id = v_category);

  delete from public.products where id = v_b;
  v_both_gone := not exists (select 1 from public.brands where id = v_other_brand) and not exists (select 1 from public.categories where id = v_category);
  execute 'reset role';

  -- Una marca recién creada desde el formulario (sin relojes todavía) no se toca.
  insert into public.brands (name, slug) values ('Marca Recién Creada', 'marca-recien-creada') returning id into v_brand;
  insert into public.products (slug, name, price, status) values ('reloj-sin-marca', 'Reloj C', 100, 'draft') returning id into v_a;
  delete from public.products where id = v_a;

  insert into test_results (name, passed, detail) values
    ('con otro reloj (aunque esté archivado) la marca y la categoría se quedan', v_kept, null),
    ('cambiar el último reloj de marca elimina la marca que quedó vacía', v_brand_gone, null),
    ('la categoría sigue: el reloj no cambió de categoría', v_category_kept, null),
    ('eliminar el último reloj elimina su marca y su categoría', v_both_gone, null),
    ('una marca recién creada sin relojes no se borra por eliminar otro producto', exists (select 1 from public.brands where id = v_brand), null),
    ('la función del trigger no se puede llamar como RPC',
     not has_function_privilege('authenticated', 'public.remove_unused_taxonomy()', 'execute')
     and not has_function_privilege('anon', 'public.remove_unused_taxonomy()', 'execute'), null);
end;
$tests$;

select name, passed, detail from test_results order by id;
