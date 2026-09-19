-- Pruebas del guardado de productos del panel y de las estadísticas de ventas.
-- Corren dentro de una transacción con ROLLBACK (scripts/db-migrate.mjs).

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_brand uuid;
  v_product uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_result jsonb;
  v_variant_keep uuid;
  v_ok boolean;
  v_detail text;
  v_order jsonb;
  v_order2 jsonb;
  v_order3 jsonb;
  v_variant uuid;
  v_kpis record;
  v_count integer;
begin
  insert into auth.users (id, email, aud, role) values
    (v_admin, 'admin-productos@pruebas.invalid', 'authenticated', 'authenticated'),
    (v_user, 'user-productos@pruebas.invalid', 'authenticated', 'authenticated');
  insert into public.admin_users (user_id) values (v_admin);
  insert into public.brands (name, slug) values ('Marca Panel', 'marca-panel') returning id into v_brand;
  insert into public.products (slug, name, price, status) values ('reloj-panel', 'Ocupa el slug', 100, 'draft');

  -- Como admin ---------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_result := public.save_product(jsonb_build_object(
    'id', v_product, 'slug', 'reloj-panel', 'name', 'Reloj Panel', 'description', 'Descripción',
    'brand_id', v_brand, 'category_id', null, 'gender', 'hombre', 'movement', 'automatico',
    'price', 900, 'compare_at_price', 1100, 'status', 'active', 'featured', true,
    'specs', '[{"label":"Diámetro","value":"42 mm"}]'::jsonb,
    'variants', '[{"label":"40 mm","sku":"RP-40","stock":3},{"label":"42 mm","sku":"RP-42","stock":0,"price_override":950}]'::jsonb,
    'images', '[{"public_id":"test/panel/a","width":1000,"height":1200},{"public_id":"test/panel/b","width":800,"height":800,"is_primary":true,"crop":{"x":10,"y":20,"width":500,"height":600},"brightness":15,"contrast":-10}]'::jsonb
  ));
  execute 'reset role';

  insert into test_results (name, passed, detail) values
    ('crear producto: slug único si ya existe', v_result ->> 'slug' = 'reloj-panel-2' and (v_result ->> 'created')::boolean, v_result::text),
    ('crear producto: guarda variantes en orden', (select array_agg(label order by position) = array['40 mm', '42 mm'] from public.product_variants where product_id = v_product), null),
    ('crear producto: guarda imágenes con principal y ediciones', (
      select bool_and(case public_id when 'test/panel/b' then is_primary and brightness = 15 and contrast = -10 and (crop ->> 'width')::int = 500 else not is_primary end)
      from public.product_images where product_id = v_product
    ), null),
    ('crear producto: aparece primero en el organizador', (select position < all (select position from public.products where id <> v_product) from public.products where id = v_product), null);

  -- Editar: quitar una variante y una imagen, cambiar la principal.
  select id into v_variant_keep from public.product_variants where product_id = v_product and label = '40 mm';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_result := public.save_product(jsonb_build_object(
    'id', v_product, 'slug', 'reloj-panel', 'name', 'Reloj Panel Editado', 'brand_id', v_brand, 'price', 850, 'compare_at_price', null,
    'status', 'active', 'featured', false, 'specs', '[]'::jsonb,
    'variants', jsonb_build_array(jsonb_build_object('id', v_variant_keep, 'label', '40 mm', 'sku', 'RP-40', 'stock', 5)),
    'images', '[{"public_id":"test/panel/c","width":900,"height":900},{"public_id":"test/panel/a"}]'::jsonb
  ));
  execute 'reset role';

  insert into test_results (name, passed, detail) values
    ('editar: conserva el slug propio', v_result ->> 'slug' = 'reloj-panel-2', v_result ->> 'slug'),
    ('editar: la variante que sigue conserva su id', (select count(*) = 1 and bool_and(id = v_variant_keep and stock = 5) from public.product_variants where product_id = v_product), null),
    ('editar: devuelve y encola la imagen quitada', v_result -> 'removed_images' = '["test/panel/b"]'::jsonb
      and exists (select 1 from public.asset_deletion_queue where public_id = 'test/panel/b'), v_result::text),
    ('editar: sin principal marcada, la primera pasa a serlo', (select is_primary from public.product_images where public_id = 'test/panel/c'), null),
    ('editar: conserva medidas si no se envían', (select width = 1000 from public.product_images where public_id = 'test/panel/a'), null);

  -- Validaciones
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.save_product(jsonb_build_object('id', v_other, 'slug', 'otro', 'name', 'Otro', 'price', 10, 'variants', '[]'::jsonb));
    v_ok := false;
  exception when invalid_parameter_value then
    v_ok := true;
  end;
  begin
    perform public.save_product(jsonb_build_object('id', v_other, 'slug', 'otro', 'name', 'Otro', 'price', 10,
      'variants', '[{"stock":1}]'::jsonb, 'images', '[{"public_id":"test/panel/a"}]'::jsonb));
    v_ok := false;
  exception when invalid_parameter_value then
    null;
  end;
  execute 'reset role';
  insert into test_results (name, passed) values ('rechaza productos sin variantes o con imágenes de otro producto', v_ok);

  -- Sin rol de admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.save_product(jsonb_build_object('id', v_other, 'slug', 'intruso', 'name', 'Intruso', 'price', 1, 'variants', '[{"stock":1}]'::jsonb));
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  select count(*) into v_count from public.sales_kpis(now() - interval '10 years', now() + interval '1 day') where orders > 0;
  execute 'reset role';
  insert into test_results (name, passed, detail) values
    ('un usuario sin rol de admin no guarda productos', v_ok, null),
    ('un usuario sin rol de admin no ve ventas', v_count = 0, v_count::text);

  -- Estadísticas ---------------------------------------------------------------------------------
  select id into v_variant from public.product_variants where product_id = v_product;
  update public.product_variants set stock = 50 where id = v_variant;
  -- Pagado el 1 de agosto de 2026 a las 03:00 UTC = 31 de julio 22:00 en Lima.
  v_order := public.create_order('{"name":"Ana Stats","email":"stats@example.com","phone":"981111111","address":"Av. Prueba 123"}',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 2)), 'yape');
  perform public.apply_order_status((v_order ->> 'id')::uuid, 'paid', null, null);
  update public.orders set paid_at = '2026-08-01 03:00:00+00' where id = (v_order ->> 'id')::uuid;
  v_order2 := public.create_order('{"name":"Ana Stats","email":"stats@example.com","phone":"981111111","address":"Av. Prueba 123"}',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)), 'transfer');
  perform public.apply_order_status((v_order2 ->> 'id')::uuid, 'paid', null, null);
  update public.orders set paid_at = '2026-08-15 15:00:00+00' where id = (v_order2 ->> 'id')::uuid;
  -- Pagado y luego cancelado: no cuenta.
  v_order3 := public.create_order('{"name":"Ana Stats","email":"stats@example.com","phone":"981111111","address":"Av. Prueba 123"}',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)), 'yape');
  perform public.apply_order_status((v_order3 ->> 'id')::uuid, 'paid', null, null);
  update public.orders set paid_at = '2026-08-16 15:00:00+00' where id = (v_order3 ->> 'id')::uuid;
  perform public.apply_order_status((v_order3 ->> 'id')::uuid, 'cancelled', null, null);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into v_kpis from public.sales_kpis('2026-08-01 05:00:00+00', '2026-09-01 05:00:00+00');
  select string_agg(format('%s=%s', bucket, revenue), ' ' order by bucket) into v_detail
  from public.sales_series('month', '2026-07-01 05:00:00+00', '2026-09-01 05:00:00+00');
  execute 'reset role';

  insert into test_results (name, passed, detail) values
    ('KPIs de agosto (hora de Lima): solo la venta del 15', v_kpis.orders = 1 and v_kpis.revenue = (v_order2 ->> 'total')::numeric and v_kpis.units = 1, format('%s pedidos, %s, %s u.', v_kpis.orders, v_kpis.revenue, v_kpis.units)),
    ('serie mensual: la venta del 1 de agosto UTC cae en julio (Lima)', v_detail = format('2026-07-01=%s 2026-08-01=%s', (v_order ->> 'total')::numeric, (v_order2 ->> 'total')::numeric), v_detail);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.sales_series('day', '2026-08-01 05:00:00+00', '2026-09-01 05:00:00+00');
  select string_agg(format('%s:%s:%s', label, units, orders), ' ') into v_detail
  from public.sales_breakdown('brand', '2026-07-01 05:00:00+00', '2026-09-01 05:00:00+00');
  v_ok := v_detail = 'Marca Panel:3:2';
  select string_agg(format('%s:%s', label, orders), ' ' order by label) into v_detail
  from public.sales_breakdown('payment_method', '2026-07-01 05:00:00+00', '2026-09-01 05:00:00+00');
  execute 'reset role';
  insert into test_results (name, passed, detail) values
    ('serie diaria de agosto: 31 días con los vacíos en cero', v_count = 31, v_count::text),
    ('ranking por marca excluye cancelados', v_ok, null),
    ('ranking por método de pago', v_detail = 'transfer:1 yape:1', v_detail);
end;
$tests$;

select name, passed, detail from test_results order by id;
