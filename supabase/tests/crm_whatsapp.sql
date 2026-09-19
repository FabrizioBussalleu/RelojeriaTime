-- Pruebas del mini CRM: teléfonos, deduplicación, consentimiento, vínculo con pedidos,
-- segmentación y permisos. Corren dentro de una transacción con ROLLBACK (scripts/db-migrate.mjs).

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_vip uuid;
  v_lead uuid;
  v_old uuid;
  v_brand uuid;
  v_product uuid;
  v_variant uuid;
  v_order jsonb;
  v_count integer;
  v_ok boolean;
  v_text text;
  v_customer public.customers;
  v_user uuid := gen_random_uuid();
  v_customer_json jsonb;
begin
  -- Teléfonos -----------------------------------------------------------------------------
  insert into test_results (name, passed, detail) values
    ('celular peruano de 9 dígitos recibe el 51', public.normalize_phone('982 762 602') = '51982762602', public.normalize_phone('982 762 602')),
    ('formatos +51 y 0051 terminan igual',
      public.normalize_phone('+51 982-762-602') = '51982762602' and public.normalize_phone('0051982762602') = '51982762602', null),
    ('número internacional con código de país se conserva', public.normalize_phone('+1 (650) 555-1234') = '16505551234', public.normalize_phone('+1 (650) 555-1234')),
    ('teléfonos inválidos quedan en null', public.normalize_phone('01 234 5678') is null and public.normalize_phone('abc') is null and public.normalize_phone(null) is null, null);

  -- Deduplicación por teléfono -----------------------------------------------------------------
  v_a := public.upsert_customer('982762600', 'Ana Torres', null, 'registro', true, 'registro', null, null, null, array['Nordik']);
  v_b := public.upsert_customer('+51 982 762 600', 'Ana T.', 'ana@example.com', 'checkout', false);
  v_c := public.upsert_customer('0051982762600', null, null, 'manual');
  select * into v_customer from public.customers where id = v_a;
  insert into test_results (name, passed, detail) values
    ('registro, compra como invitado y alta manual con el mismo número son un solo cliente', v_a = v_b and v_b = v_c, format('%s %s %s', v_a, v_b, v_c)),
    ('se conserva el primer nombre y se completan datos vacíos', v_customer.name = 'Ana Torres' and v_customer.email = 'ana@example.com', row_to_json(v_customer)::text),
    ('un "no" en el checkout no revoca un consentimiento previo', v_customer.whatsapp_opt_in and v_customer.opt_in_source = 'registro', null),
    ('los intereses declarados se guardan', v_customer.interests = array['Nordik'], v_customer.interests::text);

  begin
    insert into public.customers (phone, source) values ('982762600', 'manual');
    insert into test_results (name, passed, detail) values ('la base rechaza un teléfono sin normalizar', false, 'aceptó 982762600');
  exception when check_violation then
    insert into test_results (name, passed) values ('la base rechaza un teléfono sin normalizar', true);
  end;

  -- Baja y re-alta de consentimiento
  update public.customers set whatsapp_opt_in = false, opt_out_at = now() where id = v_a;
  perform public.upsert_customer('982762600', null, null, 'checkout', true, 'checkout');
  select * into v_customer from public.customers where id = v_a;
  insert into test_results (name, passed) values
    ('volver a dar consentimiento limpia la baja anterior', v_customer.whatsapp_opt_in and v_customer.opt_out_at is null);

  -- Pedidos vinculados -------------------------------------------------------------------------
  insert into public.brands (name, slug) values ('Marca CRM', 'marca-crm') returning id into v_brand;
  insert into public.products (slug, name, brand_id, price, status, gender) values ('reloj-crm', 'Reloj CRM', v_brand, 700, 'active', 'mujer') returning id into v_product;
  insert into public.product_variants (product_id, stock) values (v_product, 10) returning id into v_variant;

  v_customer_json := '{"name":"Bruno Díaz","email":"bruno@example.com","phone":"+51 911 222 333","address":"Av. Prueba 123","whatsapp_opt_in":true}';
  v_order := public.create_order(v_customer_json, jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)), 'yape');
  select id into v_vip from public.customers where phone = '51911222333';
  insert into test_results (name, passed, detail) values
    ('el checkout crea el cliente y vincula el pedido', (select customer_id = v_vip from public.orders where id = (v_order ->> 'id')::uuid), v_vip::text),
    ('el checkout registra el consentimiento marcado', (select whatsapp_opt_in and opt_in_source = 'checkout' from public.customers where id = v_vip), null);

  insert into public.orders (customer_name, customer_email, customer_phone, shipping_address, payment_method, subtotal, total)
  values ('Pedido Directo', 'directo@example.com', '922333444', 'Calle 1 234', 'transfer', 100, 100);
  insert into test_results (name, passed) values
    ('cualquier pedido insertado se vincula por trigger', (select customer_id is not null from public.orders where customer_email = 'directo@example.com'));

  -- Segmentación -------------------------------------------------------------------------------
  perform public.apply_order_status((v_order ->> 'id')::uuid, 'paid', null, null);
  v_lead := public.upsert_customer('933444555', 'Lead Sin Compras', null, 'registro', true, 'registro');
  v_old := public.upsert_customer('944555666', 'Cliente Antiguo', null, 'manual', true, 'tienda');
  update public.customers set tags = array['vip'] where id = v_old;
  v_order := public.create_order('{"name":"Cliente Antiguo","email":"antiguo@example.com","phone":"944555666","address":"Av. Prueba 456"}',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 2)), 'transfer');
  perform public.apply_order_status((v_order ->> 'id')::uuid, 'paid', null, null);
  update public.orders set paid_at = now() - interval '200 days' where id = (v_order ->> 'id')::uuid;
  perform public.upsert_customer('955666777', 'Sin Consentimiento', null, 'manual');

  select count(*) into v_count from public.crm_segment('{}') as s(id) where s.id in (v_a, v_vip, v_lead, v_old);
  insert into test_results (name, passed, detail) values ('por defecto solo entran clientes con consentimiento', v_count = 4, format('%s de 4', v_count));
  select count(*) into v_count from public.crm_segment('{}') as s(id) where s.id = (select id from public.customers where phone = '51955666777');
  insert into test_results (name, passed) values ('quien no dio consentimiento no entra en envíos masivos', v_count = 0);

  insert into test_results (name, passed, detail) values
    ('filtro sin compras (leads)', (select array_agg(s.id) from public.crm_segment('{"audiencia":"sin_compras"}') as s(id) where s.id in (v_a, v_vip, v_lead, v_old)) @> array[v_lead, v_a]
      and not exists (select 1 from public.crm_segment('{"audiencia":"sin_compras"}') as s(id) where s.id in (v_vip, v_old)), null),
    ('filtro sin compra hace más de 90 días', (select array_agg(s.id) = array[v_old] from public.crm_segment('{"sin_compra_dias":90}') as s(id) where s.id in (v_a, v_vip, v_lead, v_old)), null),
    ('filtro compra reciente (30 días)', (select array_agg(s.id) = array[v_vip] from public.crm_segment('{"compra_reciente_dias":30}') as s(id) where s.id in (v_a, v_vip, v_lead, v_old)), null),
    ('filtro gasto mínimo', (select array_agg(s.id) = array[v_old] from public.crm_segment('{"gasto_min":1000}') as s(id) where s.id in (v_a, v_vip, v_lead, v_old)), null),
    ('filtro por marca comprada', (select count(*) = 2 from public.crm_segment('{"marcas":["marca crm"]}') as s(id) where s.id in (v_vip, v_old)), null),
    ('filtro por marca de interés declarada', (select count(*) = 1 from public.crm_segment('{"marcas":["NORDIK"]}') as s(id) where s.id = v_a), null),
    ('filtro por género del reloj comprado', (select count(*) = 2 from public.crm_segment('{"generos":["mujer"]}') as s(id) where s.id in (v_vip, v_old)), null),
    ('filtro por etiqueta', (select array_agg(s.id) = array[v_old] from public.crm_segment('{"etiquetas":["vip"]}') as s(id) where s.id in (v_a, v_vip, v_lead, v_old)), null);

  select count(*) into v_count from public.customer_overview where id = v_old and paid_orders_count = 1 and total_spent = 1400;
  insert into test_results (name, passed) values ('la vista de clientes calcula compras y gasto', v_count = 1);

  -- Permisos ---------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.customers;
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  begin
    perform count(*) from public.customer_overview;
    v_ok := false;
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.upsert_customer('966777888', 'Intruso', null, 'registro', true);
    v_ok := false;
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
  insert into test_results (name, passed) values ('anónimo no lee clientes ni crea clientes directo contra la base', v_ok);

  insert into auth.users (id, email, aud, role) values (v_user, 'no-admin@pruebas.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.customers;
  v_text := v_count::text;
  select count(*) into v_count from public.crm_segment('{"solo_contactables":false}');
  execute 'reset role';
  insert into test_results (name, passed, detail) values ('un usuario sin rol de admin no ve clientes ni segmentos', v_text = '0' and v_count = 0, format('clientes=%s segmento=%s', v_text, v_count));
end;
$tests$;

select name, passed, detail from test_results order by id;
