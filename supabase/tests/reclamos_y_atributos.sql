-- Pruebas del Libro de Reclamaciones y de los atributos de reloj. Mismo esquema que pedidos_y_rls.sql:
-- corren dentro de una transacción con ROLLBACK y no dejan datos.

create temp table if not exists test_results (id serial primary key, name text not null, passed boolean not null, detail text);

do $tests$
declare
  v_code text;
  v_ok boolean;
  v_count integer;
begin
  insert into public.complaints (kind, consumer_name, consumer_document, consumer_email, consumer_address, item_type, item_description, amount, detail, consumer_request)
  values ('reclamo', 'Cliente Prueba', '12345678', 'cliente@example.com', 'Av. Prueba 123', 'producto', 'Reloj de prueba', 100, 'El reloj llegó con la correa dañada.', 'Cambio de correa')
  returning code into v_code;
  insert into test_results (name, passed, detail) values ('el reclamo recibe un correlativo LR-AAAA-NNNNNN', v_code ~ '^LR-\d{4}-\d{6}$', v_code);

  begin
    insert into public.complaints (kind, consumer_name, consumer_document, consumer_email, consumer_address, item_type, item_description, detail, consumer_request, is_minor)
    values ('queja', 'Menor Prueba', '12345678', 'menor@example.com', 'Av. Prueba 123', 'servicio', 'Atención', 'Detalle suficientemente largo.', 'Respuesta', true);
    insert into test_results (name, passed, detail) values ('un menor de edad requiere apoderado', false, 'aceptó sin apoderado');
  exception when check_violation then
    insert into test_results (name, passed) values ('un menor de edad requiere apoderado', true);
  end;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.complaints;
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  begin
    insert into public.complaints (kind, consumer_name, consumer_document, consumer_email, consumer_address, item_type, item_description, detail, consumer_request)
    values ('queja', 'Intruso', '12345678', 'x@example.com', 'Av. Prueba 123', 'servicio', 'Atención', 'Detalle suficientemente largo.', 'Respuesta');
    v_ok := false;
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';
  insert into test_results (name, passed) values ('anónimo no lee ni escribe reclamos directo contra la base', v_ok);

  insert into public.products (slug, name, price, status, gender, movement) values ('reloj-atributos', 'Reloj Atributos', 100, 'active', 'unisex', 'automatico');
  select count(*) into v_count from public.products where slug = 'reloj-atributos' and gender = 'unisex' and movement = 'automatico';
  insert into test_results (name, passed) values ('los productos guardan género y movimiento', v_count = 1);

  select count(*) into v_count from public.store_settings where yape_number = '982762602' and whatsapp_number = '51982762602';
  insert into test_results (name, passed) values ('los datos de Yape y WhatsApp están cargados', v_count = 1);
end;
$tests$;

select name, passed, detail from test_results order by id;
