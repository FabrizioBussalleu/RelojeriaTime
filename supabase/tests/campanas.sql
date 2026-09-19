-- Pruebas de campañas: filtros nuevos de segmentación e inicio atómico del envío.
-- Corren dentro de una transacción con ROLLBACK (scripts/db-migrate.mjs).

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_web uuid;
  v_chat uuid;
  v_unpaid uuid;
  v_recent uuid;
  v_no_consent uuid;
  v_brand uuid;
  v_product uuid;
  v_variant uuid;
  v_order jsonb;
  v_draft_template uuid;
  v_template uuid;
  v_campaign uuid;
  v_count integer;
  v_ok boolean;
  v_user uuid := gen_random_uuid();
  v_ids uuid[];
begin
  v_web := public.upsert_customer('971000001', 'Cliente Web', null, 'registro', true, 'registro');
  v_chat := public.upsert_customer('971000002', null, null, 'whatsapp', true, 'whatsapp', 'Chat Cliente');
  v_recent := public.upsert_customer('971000004', 'Ya Contactado', null, 'manual', true, 'tienda');
  v_no_consent := public.upsert_customer('971000005', 'Sin Consentimiento', null, 'registro');
  v_ids := array[v_web, v_chat, v_recent, v_no_consent];

  insert into public.wa_conversations (customer_id, last_inbound_at) values (v_chat, now() - interval '2 days');

  -- Pedido sin pagar (vencido) de hace 3 días, sin compras posteriores.
  insert into public.brands (name, slug) values ('Marca Campañas', 'marca-campanas') returning id into v_brand;
  insert into public.products (slug, name, brand_id, price, status) values ('reloj-campanas', 'Reloj Campañas', v_brand, 500, 'active') returning id into v_product;
  insert into public.product_variants (product_id, stock) values (v_product, 10) returning id into v_variant;
  v_order := public.create_order('{"name":"Pedido Sin Pagar","email":"sinpagar@example.com","phone":"971000003","address":"Av. Prueba 123","whatsapp_opt_in":true}',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)), 'yape');
  -- Ya vencido: cancelado sin pago (así no lo cuenta la prueba de expire_pending_orders).
  perform public.apply_order_status((v_order ->> 'id')::uuid, 'cancelled', null, null);
  update public.orders set created_at = now() - interval '3 days' where id = (v_order ->> 'id')::uuid;
  select id into v_unpaid from public.customers where phone = '51971000003';
  v_ids := v_ids || v_unpaid;

  insert into test_results (name, passed, detail) values
    ('filtro por origen del cliente',
      (select array_agg(s.id) = array[v_chat] from public.crm_segment('{"origen":["whatsapp"]}') as s(id) where s.id = any (v_ids)), null),
    ('filtro escribió por WhatsApp en los últimos 7 días',
      (select array_agg(s.id) = array[v_chat] from public.crm_segment('{"conversacion_dias":7}') as s(id) where s.id = any (v_ids)), null),
    ('filtro pedido sin pagar en los últimos 7 días',
      (select array_agg(s.id) = array[v_unpaid] from public.crm_segment('{"pedido_sin_pagar_dias":7}') as s(id) where s.id = any (v_ids)), null),
    ('un pedido sin pagar más antiguo que el filtro no cuenta',
      not exists (select 1 from public.crm_segment('{"pedido_sin_pagar_dias":2}') as s(id) where s.id = v_unpaid), null);

  -- Quien pagó un pedido después ya no aparece como "pedido sin pagar".
  v_order := public.create_order('{"name":"Pedido Sin Pagar","email":"sinpagar@example.com","phone":"971000003","address":"Av. Prueba 123"}',
    jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'quantity', 1)), 'yape');
  perform public.apply_order_status((v_order ->> 'id')::uuid, 'paid', null, null);
  insert into test_results (name, passed) values
    ('comprar después saca al cliente del filtro de pedido sin pagar',
      not exists (select 1 from public.crm_segment('{"pedido_sin_pagar_dias":7}') as s(id) where s.id = v_unpaid));

  -- Campañas ---------------------------------------------------------------------------------------
  insert into public.message_templates (name, kind, body, wa_template_name, wa_category, wa_status)
  values ('Prueba borrador', 'campaign', 'Hola {{nombre}}', 'prueba_borrador_campanas', 'MARKETING', 'pending') returning id into v_draft_template;
  insert into public.message_templates (name, kind, body, wa_template_name, wa_category, wa_status)
  values ('Prueba aprobada', 'campaign', 'Hola {{nombre}}', 'prueba_aprobada_campanas', 'MARKETING', 'approved') returning id into v_template;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into public.campaigns (name, template_id, filters) values ('Con plantilla pendiente', v_draft_template, '{}') returning id into v_campaign;
  begin
    perform public.start_campaign(v_campaign);
    v_ok := false;
  exception when invalid_parameter_value then
    v_ok := true;
  end;
  insert into test_results (name, passed) values ('no se envía una campaña con plantilla sin aprobar', v_ok);

  -- Contactado por otra campaña hace 2 días.
  insert into public.campaigns (name, template_id, status) values ('Anterior', v_template, 'sent') returning id into v_campaign;
  insert into public.campaign_recipients (campaign_id, customer_id, phone, status, sent_at)
  values (v_campaign, v_recent, '51971000004', 'sent', now() - interval '2 days');

  insert into test_results (name, passed) values
    ('excluir a quien recibió una campaña en los últimos 7 días',
      not exists (select 1 from public.crm_segment('{"excluir_campana_dias":7}') as s(id) where s.id = v_recent)
      and exists (select 1 from public.crm_segment('{"excluir_campana_dias":1}') as s(id) where s.id = v_recent));

  -- solo_contactables=false en los filtros no permite saltarse el consentimiento.
  insert into public.campaigns (name, template_id, filters)
  values ('Novedades', v_template, '{"origen":["registro","whatsapp","manual"],"solo_contactables":false}') returning id into v_campaign;
  v_count := public.start_campaign(v_campaign);
  insert into test_results (name, passed, detail) values
    ('iniciar la campaña fija destinatarios solo con consentimiento',
      (select array_agg(customer_id order by phone) from public.campaign_recipients where campaign_id = v_campaign and customer_id = any (v_ids))
        = array[v_web, v_chat, v_recent]
      and (select status = 'sending' and recipients_count = v_count and started_at is not null from public.campaigns where id = v_campaign),
      format('destinatarios=%s', v_count));

  begin
    perform public.start_campaign(v_campaign);
    v_ok := false;
  exception when invalid_parameter_value then
    v_ok := true;
  end;
  insert into test_results (name, passed) values ('una campaña ya iniciada no se vuelve a iniciar', v_ok);

  -- Un usuario autenticado sin rol de admin no puede iniciar campañas.
  insert into public.campaigns (name, template_id) values ('Intento', v_template) returning id into v_campaign;
  insert into auth.users (id, email, aud, role) values (v_user, 'no-admin-campanas@pruebas.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.start_campaign(v_campaign);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  execute 'reset role';
  insert into test_results (name, passed) values ('un usuario sin rol de admin no inicia campañas', v_ok);

  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.start_campaign(v_campaign);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  insert into test_results (name, passed) values ('sin sesión tampoco se inician campañas', v_ok);
end;
$tests$;

select name, passed, detail from test_results order by id;
