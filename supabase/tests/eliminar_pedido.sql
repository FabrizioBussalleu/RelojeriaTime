-- Pruebas de delete_order: borra el pedido con sus ítems e historial y devuelve el stock.
-- Corren dentro de una transacción con ROLLBACK (scripts/db-migrate.mjs).

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_product uuid;
  v_variant uuid;
  v_order jsonb;
  v_order_id uuid;
  v_otro_id uuid;
  v_code text;
  v_stock integer;
  v_restos integer;
  v_no_admin boolean := false;
  v_inexistente boolean := false;
  v_customer constant jsonb := '{"name":"Cliente Prueba","email":"borrar@example.com","phone":"900000111","address":"Av. Prueba 123"}';
begin
  insert into public.products (slug, name, price, status) values ('reloj-borrar', 'Reloj Borrar', 400, 'active') returning id into v_product;
  insert into public.product_variants (product_id, label, stock) values (v_product, 'Única', 5) returning id into v_variant;
  insert into auth.users (id, email, aud, role) values
    (v_admin, 'admin-borrar@pruebas.invalid', 'authenticated', 'authenticated'),
    (v_user, 'cliente-borrar@pruebas.invalid', 'authenticated', 'authenticated');
  insert into public.admin_users (user_id) values (v_admin);

  -- Dos pedidos: uno se borra vivo (el stock vuelve) y otro se cancela antes de borrarlo.
  v_order := public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 2)), 'yape');
  v_order_id := (v_order ->> 'id')::uuid;
  v_order := public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)), 'yape');
  v_otro_id := (v_order ->> 'id')::uuid;

  -- Un usuario que no es admin no puede borrar.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.delete_order(v_order_id);
  exception when others then v_no_admin := true;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select stock into v_stock from public.product_variants where id = v_variant;  -- 5 - 2 - 1 = 2
  v_code := public.delete_order(v_order_id);

  begin
    perform public.delete_order(v_order_id);
  exception when others then v_inexistente := true;
  end;

  -- El cancelado ya devolvió su unidad: borrarlo no la suma dos veces.
  perform public.set_order_status(v_otro_id, 'cancelled', 'prueba');
  perform public.delete_order(v_otro_id);
  execute 'reset role';

  select count(*) into v_restos from public.order_items where order_id in (v_order_id, v_otro_id);

  insert into test_results (name, passed, detail) values
    ('el pedido desaparece', not exists (select 1 from public.orders where id = v_order_id), null),
    ('devuelve el código del pedido borrado', v_code like 'TM-%', v_code),
    ('los ítems caen en cascada', v_restos = 0, v_restos::text),
    ('el historial cae en cascada', not exists (select 1 from public.order_status_history where order_id in (v_order_id, v_otro_id)), null),
    ('el stock vuelve una sola vez', (select stock from public.product_variants where id = v_variant) = 5,
      (select stock::text from public.product_variants where id = v_variant)),
    ('el stock antes de borrar estaba reservado', v_stock = 2, v_stock::text),
    ('quien no es admin no puede borrar', v_no_admin, null),
    ('borrar un pedido inexistente falla', v_inexistente, null),
    ('el anónimo no puede borrar', not has_function_privilege('anon', 'public.delete_order(uuid)', 'execute'), null);
end;
$tests$;

select name, passed, detail from test_results order by id;
