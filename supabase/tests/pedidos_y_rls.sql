-- Pruebas de pedidos, stock, cola de borrado en Cloudinary y RLS.
-- scripts/db-migrate.mjs las ejecuta dentro de una transacción que termina en ROLLBACK:
-- crean datos de prueba y usuarios ficticios, pero no dejan rastro en la base.

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_brand uuid;
  v_category uuid;
  v_product uuid;
  v_draft uuid;
  v_var_a uuid;
  v_var_b uuid;
  v_var_draft uuid;
  v_order jsonb;
  v_order_id uuid;
  v_expiring jsonb;
  v_tracked jsonb;
  v_row public.orders;
  v_count integer;
  v_text text;
  v_ok boolean;
  v_stock_a integer;
  v_stock_b integer;
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_customer constant jsonb := '{"name":"Cliente Prueba","email":"Cliente@Example.com","phone":"900000000","address":"Av. Prueba 123"}';
begin
  -- Datos base ---------------------------------------------------------------------
  insert into public.brands (name, slug) values ('Marca Prueba', 'marca-prueba') returning id into v_brand;
  insert into public.categories (name, slug) values ('Categoría Prueba', 'categoria-prueba') returning id into v_category;
  insert into public.products (slug, name, brand_id, category_id, price, status)
  values ('reloj-prueba', 'Reloj Prueba', v_brand, v_category, 500, 'active')
  returning id into v_product;
  insert into public.product_variants (product_id, label, stock) values (v_product, '40 mm', 3) returning id into v_var_a;
  insert into public.product_variants (product_id, label, stock, price_override) values (v_product, '42 mm', 1, 550) returning id into v_var_b;
  insert into public.product_images (product_id, public_id, is_primary, position) values
    (v_product, 'test/reloj-prueba/principal', true, 0),
    (v_product, 'test/reloj-prueba/secundaria', false, 1);
  insert into public.products (slug, name, price, status) values ('reloj-borrador', 'Reloj Borrador', 300, 'draft') returning id into v_draft;
  insert into public.product_variants (product_id, stock) values (v_draft, 5) returning id into v_var_draft;

  insert into auth.users (id, email, aud, role) values
    (v_admin, 'admin@pruebas.invalid', 'authenticated', 'authenticated'),
    (v_user, 'cliente@pruebas.invalid', 'authenticated', 'authenticated');
  insert into public.admin_users (user_id) values (v_admin);

  -- Restricciones del catálogo ------------------------------------------------------------
  begin
    insert into public.products (slug, name, price, compare_at_price) values ('oferta-mal', 'Oferta mal', 500, 400);
    insert into test_results (name, passed, detail) values ('precio anterior debe ser mayor al actual', false, 'aceptó 400 < 500');
  exception when check_violation then
    insert into test_results (name, passed) values ('precio anterior debe ser mayor al actual', true);
  end;

  begin
    insert into public.product_images (product_id, public_id, is_primary) values (v_product, 'test/reloj-prueba/otra-principal', true);
    insert into test_results (name, passed, detail) values ('una sola imagen principal por producto', false, 'aceptó dos principales');
  exception when unique_violation then
    insert into test_results (name, passed) values ('una sola imagen principal por producto', true);
  end;

  -- create_order ------------------------------------------------------------------------
  v_order := public.create_order(
    v_customer,
    jsonb_build_array(
      jsonb_build_object('variant_id', v_var_a, 'quantity', 2),
      jsonb_build_object('variant_id', v_var_b, 'quantity', 1)
    ),
    'yape'
  );
  v_order_id := (v_order ->> 'id')::uuid;
  select stock into v_stock_a from public.product_variants where id = v_var_a;
  select stock into v_stock_b from public.product_variants where id = v_var_b;
  insert into test_results (name, passed, detail) values
    ('create_order toma precios de la base (2×500 + 1×550)', (v_order ->> 'total')::numeric = 1550, v_order::text),
    ('create_order descuenta stock', v_stock_a = 1 and v_stock_b = 0, format('40 mm=%s, 42 mm=%s', v_stock_a, v_stock_b)),
    ('create_order genera código legible', v_order ->> 'code' ~ '^TM-\d{6}$', v_order ->> 'code'),
    ('create_order guarda el email en minúsculas', (select customer_email = 'cliente@example.com' from public.orders where id = v_order_id), null),
    (
      'create_order guarda snapshot (marca, variante, imagen principal)',
      (
        select count(*) = 2 and bool_and(brand_name = 'Marca Prueba') and bool_or(image_public_id = 'test/reloj-prueba/principal')
        from public.order_items where order_id = v_order_id
      ),
      null
    ),
    ('create_order registra el historial', (select count(*) = 1 from public.order_status_history where order_id = v_order_id), null);

  begin
    perform public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_var_b, 'quantity', 1)), 'transfer');
    insert into test_results (name, passed, detail) values ('rechaza pedidos sin stock', false, 'no lanzó error');
  exception when others then
    insert into test_results (name, passed, detail) values ('rechaza pedidos sin stock', sqlerrm like 'No hay stock suficiente%', sqlerrm);
  end;

  begin
    perform public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_var_draft, 'quantity', 1)), 'transfer');
    insert into test_results (name, passed, detail) values ('rechaza productos no activos', false, 'no lanzó error');
  exception when others then
    insert into test_results (name, passed, detail) values ('rechaza productos no activos', sqlerrm like '%ya no está disponible%', sqlerrm);
  end;

  begin
    perform public.create_order(v_customer, '[{"variant_id":"no-es-uuid","quantity":1}]', 'transfer');
    insert into test_results (name, passed, detail) values ('rechaza ítems con formato inválido', false, 'no lanzó error');
  exception when others then
    insert into test_results (name, passed, detail) values ('rechaza ítems con formato inválido', sqlerrm like '%formato válido%', sqlerrm);
  end;

  begin
    perform public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_var_a, 'quantity', 11)), 'transfer');
    insert into test_results (name, passed, detail) values ('limita la cantidad por producto', false, 'aceptó 11 unidades');
  exception when others then
    insert into test_results (name, passed, detail) values ('limita la cantidad por producto', sqlerrm like '%formato válido%', sqlerrm);
  end;

  begin
    perform public.create_order('{"name":"X","email":"no-es-email","phone":"1","address":"x"}',
      jsonb_build_array(jsonb_build_object('variant_id', v_var_a, 'quantity', 1)), 'transfer');
    insert into test_results (name, passed, detail) values ('valida los datos del cliente', false, 'aceptó datos inválidos');
  exception when check_violation or not_null_violation then
    insert into test_results (name, passed, detail) values ('valida los datos del cliente', true, sqlerrm);
  end;

  -- track_order ---------------------------------------------------------------------------
  v_tracked := public.track_order(lower(v_order ->> 'code'), 'otra@persona.com');
  insert into test_results (name, passed, detail) values ('track_order no responde con un email ajeno', v_tracked is null, v_tracked::text);
  v_tracked := public.track_order(' ' || lower(v_order ->> 'code') || ' ', 'CLIENTE@example.com');
  insert into test_results (name, passed, detail) values
    ('track_order responde con código y email correctos', jsonb_array_length(v_tracked -> 'items') = 2, v_tracked::text),
    ('track_order no expone dirección ni teléfono', not (v_tracked ? 'shipping_address') and not (v_tracked ? 'customer_phone'), null);

  -- Estados ---------------------------------------------------------------------------------
  v_row := public.apply_order_status(v_order_id, 'paid', null, 'Yape recibido');
  insert into test_results (name, passed, detail) values
    ('marcar pagado registra paid_at', v_row.paid_at is not null, null),
    ('cada cambio queda en el historial', (select count(*) = 2 from public.order_status_history where order_id = v_order_id), null);

  v_row := public.apply_order_status(v_order_id, 'cancelled', null, null);
  select stock into v_stock_a from public.product_variants where id = v_var_a;
  select stock into v_stock_b from public.product_variants where id = v_var_b;
  insert into test_results (name, passed, detail) values
    ('cancelar devuelve el stock', v_stock_a = 3 and v_stock_b = 1, format('40 mm=%s, 42 mm=%s', v_stock_a, v_stock_b)),
    ('cancelar registra cancelled_at', v_row.cancelled_at is not null, null);

  begin
    perform public.apply_order_status(v_order_id, 'paid', null, null);
    insert into test_results (name, passed, detail) values ('un pedido cancelado no se reabre', false, 'lo reabrió');
  exception when others then
    insert into test_results (name, passed, detail) values ('un pedido cancelado no se reabre', sqlerrm like '%no puede reabrirse%', sqlerrm);
  end;

  -- Expiración de pedidos impagos ---------------------------------------------------------------
  v_expiring := public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_var_a, 'quantity', 1)), 'transfer');
  update public.orders set created_at = now() - interval '49 hours' where id = (v_expiring ->> 'id')::uuid;
  -- El ensayo corre contra la base real: si hay pedidos impagos vencidos de verdad, también se
  -- cancelan (y el ROLLBACK los devuelve). Por eso se cuenta "al menos uno", no exactamente uno.
  v_count := public.expire_pending_orders();
  select stock into v_stock_a from public.product_variants where id = v_var_a;
  insert into test_results (name, passed, detail) values (
    'expire_pending_orders cancela impagos vencidos y repone stock',
    v_count >= 1 and v_stock_a = 3 and (select status = 'cancelled' from public.orders where id = (v_expiring ->> 'id')::uuid),
    format('cancelados=%s, stock=%s', v_count, v_stock_a)
  );

  -- RLS: anónimo -----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.orders;
    v_text := 'pudo leer pedidos';
  exception when insufficient_privilege then
    v_text := null;
  end;
  select count(*) into v_count from public.products where id in (v_product, v_draft);
  begin
    perform public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_var_a, 'quantity', 1)), 'transfer');
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  execute 'reset role';
  insert into test_results (name, passed, detail) values
    ('anónimo no puede leer pedidos', v_text is null, v_text),
    ('anónimo solo ve productos activos', v_count = 1, format('ve %s de 2', v_count)),
    ('anónimo no puede crear pedidos directo contra la base', v_ok, null);

  execute 'set local role anon';
  select count(*) into v_count from public.product_variants where product_id = v_draft;
  begin
    insert into public.brands (name, slug) values ('Intrusa', 'intrusa');
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  begin
    perform public.is_admin();
    v_text := 'ejecutó is_admin()';
  exception when insufficient_privilege then
    v_text := null;
  end;
  execute 'reset role';
  insert into test_results (name, passed, detail) values
    ('anónimo no ve variantes de borradores', v_count = 0, format('ve %s', v_count)),
    ('anónimo no puede escribir en el catálogo', v_ok, null),
    ('anónimo no ejecuta is_admin()', v_text is null, v_text);

  -- RLS: usuario autenticado sin rol de admin -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.orders;
  begin
    insert into public.products (slug, name, price) values ('intruso', 'Intruso', 1);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  begin
    perform public.set_order_status(v_order_id, 'shipped', null);
    v_text := 'cambió el estado';
  exception when insufficient_privilege then
    v_text := null;
  end;
  v_ok := v_ok and not public.is_admin() and (select count(*) = 0 from public.admin_users);
  begin
    perform public.reorder_products(array[v_product]);
    v_ok := false;
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
  insert into test_results (name, passed, detail) values
    ('usuario sin rol no ve pedidos', v_count = 0, format('ve %s', v_count)),
    ('usuario sin rol no escribe, no es admin ni ve la lista de admins, ni reordena', v_ok, null),
    ('usuario sin rol no cambia estados', v_text is null, v_text);

  -- RLS: administrador --------------------------------------------------------------------------
  v_expiring := public.create_order(v_customer, jsonb_build_array(jsonb_build_object('variant_id', v_var_a, 'quantity', 1)), 'plin');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.orders;
  v_row := public.set_order_status((v_expiring ->> 'id')::uuid, 'preparing', 'Empaquetando');
  update public.orders set internal_notes = 'Cliente frecuente' where id = (v_expiring ->> 'id')::uuid;
  begin
    update public.orders set total = 1 where id = (v_expiring ->> 'id')::uuid;
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  perform public.reorder_products(array[v_draft, v_product]);
  execute 'reset role';
  insert into test_results (name, passed, detail) values
    ('admin ve los pedidos', v_count >= 1, format('ve %s', v_count)),
    ('admin cambia estados y queda registrado quién', (
      select changed_by = v_admin from public.order_status_history
      where order_id = (v_expiring ->> 'id')::uuid order by id desc limit 1
    ), null),
    ('pasar a preparación implica pagado', v_row.paid_at is not null, null),
    ('admin edita notas internas', (select internal_notes = 'Cliente frecuente' from public.orders where id = (v_expiring ->> 'id')::uuid), null),
    ('ni el admin puede tocar montos directamente', v_ok, null),
    ('reorder_products guarda el orden', (select position = 2 from public.products where id = v_product), null);

  -- Cola de borrado en Cloudinary: con la sesión del admin, que es el caso real ------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.product_images set public_id = 'test/reloj-prueba/secundaria-v2' where public_id = 'test/reloj-prueba/secundaria';
  delete from public.products where id = v_product;
  execute 'reset role';

  insert into test_results (name, passed, detail) values
    (
      'reemplazar una imagen encola la anterior',
      exists (select 1 from public.asset_deletion_queue where public_id = 'test/reloj-prueba/secundaria' and reason = 'image_replaced'),
      null
    ),
    (
      'eliminar un producto encola todas sus imágenes',
      (select count(*) = 2 from public.asset_deletion_queue
       where public_id in ('test/reloj-prueba/principal', 'test/reloj-prueba/secundaria-v2') and reason = 'image_deleted'),
      (select string_agg(public_id || ':' || reason, ', ') from public.asset_deletion_queue)
    ),
    (
      'eliminar un producto no rompe pedidos históricos',
      (select bool_and(product_id is null and variant_id is null and product_name = 'Reloj Prueba')
       from public.order_items where order_id = v_order_id),
      null
    );
end;
$tests$;

select name, passed, detail from test_results order by id;
