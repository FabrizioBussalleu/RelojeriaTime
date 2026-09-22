-- Pruebas de la venta al por mayor: marca "solo al por mayor" y los dos órdenes del organizador.
-- Corren dentro de una transacción con ROLLBACK (scripts/db-migrate.mjs).

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_admin uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_guardado jsonb;
  v_solo_mayor boolean;
  v_orden_tienda text;
  v_orden_mayor text;
  v_error_ambito boolean := false;
begin
  insert into auth.users (id, email, aud, role) values (v_admin, 'admin-mayor@pruebas.invalid', 'authenticated', 'authenticated');
  insert into public.admin_users (user_id) values (v_admin);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Guardar un reloj marcado como "solo al por mayor".
  v_guardado := public.save_product(jsonb_build_object(
    'id', v_a, 'slug', 'reloj-mayor', 'name', 'Reloj Mayor', 'description', '',
    'brand_id', null, 'category_id', null, 'gender', null, 'movement', null,
    'price', 500, 'compare_at_price', null, 'status', 'active', 'wholesale_only', true,
    'specs', '[]'::jsonb, 'variants', '[{"label":"Única","stock":10}]'::jsonb, 'images', '[]'::jsonb
  ));
  select wholesale_only into v_solo_mayor from public.products where id = v_a;

  -- Y otro normal, para ordenar los dos.
  perform public.save_product(jsonb_build_object(
    'id', v_b, 'slug', 'reloj-tienda', 'name', 'Reloj Tienda', 'description', '',
    'brand_id', null, 'category_id', null, 'gender', null, 'movement', null,
    'price', 600, 'compare_at_price', null, 'status', 'active', 'wholesale_only', false,
    'specs', '[]'::jsonb, 'variants', '[{"label":"Única","stock":4}]'::jsonb, 'images', '[]'::jsonb
  ));

  -- Cada ámbito toca su propia columna.
  perform public.reorder_products(array[v_a, v_b], 'tienda');
  perform public.reorder_products(array[v_b, v_a], 'por_mayor');
  select string_agg(name || ':' || position, ' ' order by position) into v_orden_tienda from public.products where id in (v_a, v_b);
  select string_agg(name || ':' || wholesale_position, ' ' order by wholesale_position) into v_orden_mayor from public.products where id in (v_a, v_b);

  begin
    perform public.reorder_products(array[v_a], 'inventado');
  exception
    when others then v_error_ambito := true;
  end;
  execute 'reset role';

  insert into test_results (name, passed, detail) values
    ('save_product guarda "solo al por mayor"', v_solo_mayor, null),
    ('el orden de la tienda usa position', v_orden_tienda = 'Reloj Mayor:1 Reloj Tienda:2', v_orden_tienda),
    ('el orden de por mayor usa wholesale_position', v_orden_mayor = 'Reloj Tienda:1 Reloj Mayor:2', v_orden_mayor),
    ('un ámbito desconocido se rechaza', v_error_ambito, null),
    ('el anónimo no puede reordenar', not has_function_privilege('anon', 'public.reorder_products(uuid[], text)', 'execute'), null);
end;
$tests$;

select name, passed, detail from test_results order by id;
