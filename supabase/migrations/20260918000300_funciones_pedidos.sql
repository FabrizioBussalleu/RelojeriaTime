-- Time: funciones de pedidos y catálogo.
-- create_order y track_order solo se ejecutan desde el servidor de Next (service_role), donde
-- se validan los datos y se limita la frecuencia. Las de admin verifican is_admin() adentro.

-- Crea un pedido con precios y stock leídos de la base, en una sola transacción. ----------
-- p_customer: { name, email, phone, address, city?, document?, notes? }
-- p_items:    [{ variant_id, quantity }, ...]
create function public.create_order(
  p_customer jsonb,
  p_items jsonb,
  p_payment_method public.payment_method
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.store_settings;
  v_order public.orders;
  v_line record;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(10, 2) := 0;
  v_shipping numeric(10, 2);
  v_unit_price numeric(10, 2);
  v_requested integer;
  v_found integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'El pedido tiene demasiados productos.' using errcode = '22023';
  end if;
  -- CASE garantiza el orden de evaluación: nunca se castea un valor que no pasó el formato.
  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where case
      when coalesce(item ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when coalesce(item ->> 'quantity', '') !~ '^[0-9]{1,2}$' then true
      else (item ->> 'quantity')::integer not between 1 and 10
    end
  ) then
    raise exception 'Los productos del pedido no tienen un formato válido.' using errcode = '22023';
  end if;

  -- Bloquea las variantes en orden estable para evitar deadlocks entre compras simultáneas.
  perform 1
  from public.product_variants v
  where v.id in (select (item ->> 'variant_id')::uuid from jsonb_array_elements(p_items) as item)
  order by v.id
  for update;

  select count(distinct lower(item ->> 'variant_id')) into v_requested from jsonb_array_elements(p_items) as item;

  for v_line in
    with requested as (
      select (item ->> 'variant_id')::uuid as variant_id, sum((item ->> 'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) as item
      group by 1
    )
    select
      r.variant_id,
      r.quantity,
      v.stock,
      v.label as variant_label,
      v.price_override,
      p.id as product_id,
      p.name as product_name,
      p.price,
      p.status,
      b.name as brand_name,
      c.name as category_name,
      (
        select i.public_id
        from public.product_images i
        where i.product_id = p.id
        order by i.is_primary desc, i.position
        limit 1
      ) as image_public_id
    from requested r
    join public.product_variants v on v.id = r.variant_id
    join public.products p on p.id = v.product_id
    left join public.brands b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
    order by r.variant_id
  loop
    v_found := v_found + 1;
    if v_line.status <> 'active' then
      raise exception '"%" ya no está disponible.', v_line.product_name using errcode = 'P0001';
    end if;
    if v_line.quantity > 10 then
      raise exception 'Solo puedes llevar hasta 10 unidades de "%".', v_line.product_name using errcode = '22023';
    end if;
    if v_line.stock < v_line.quantity then
      raise exception 'No hay stock suficiente de "%".', v_line.product_name
        using errcode = 'P0001', detail = v_line.variant_id::text, hint = v_line.stock::text;
    end if;

    v_unit_price := coalesce(v_line.price_override, v_line.price);
    v_subtotal := v_subtotal + v_unit_price * v_line.quantity;

    update public.product_variants set stock = stock - v_line.quantity where id = v_line.variant_id;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_line.product_id,
      'variant_id', v_line.variant_id,
      'product_name', v_line.product_name,
      'brand_name', v_line.brand_name,
      'category_name', v_line.category_name,
      'variant_label', v_line.variant_label,
      'image_public_id', v_line.image_public_id,
      'unit_price', v_unit_price,
      'quantity', v_line.quantity
    );
  end loop;

  if v_found <> v_requested then
    raise exception 'Uno de los productos del carrito ya no existe.' using errcode = 'P0001';
  end if;

  select * into v_settings from public.store_settings where id;
  v_shipping := case
    when v_settings.free_shipping_threshold is not null and v_subtotal >= v_settings.free_shipping_threshold then 0
    else coalesce(v_settings.shipping_flat_fee, 0)
  end;

  insert into public.orders (
    customer_name, customer_email, customer_phone, customer_document,
    shipping_address, shipping_city, notes, payment_method,
    subtotal, shipping_cost, total
  )
  values (
    trim(p_customer ->> 'name'),
    lower(trim(p_customer ->> 'email')),
    trim(p_customer ->> 'phone'),
    nullif(trim(p_customer ->> 'document'), ''),
    trim(p_customer ->> 'address'),
    nullif(trim(p_customer ->> 'city'), ''),
    nullif(trim(p_customer ->> 'notes'), ''),
    p_payment_method,
    v_subtotal,
    v_shipping,
    v_subtotal + v_shipping
  )
  returning * into v_order;

  insert into public.order_items (
    order_id, product_id, variant_id, product_name, brand_name, category_name,
    variant_label, image_public_id, unit_price, quantity
  )
  select v_order.id, x.product_id, x.variant_id, x.product_name, x.brand_name, x.category_name,
         x.variant_label, x.image_public_id, x.unit_price, x.quantity
  from jsonb_to_recordset(v_lines) as x(
    product_id uuid, variant_id uuid, product_name text, brand_name text, category_name text,
    variant_label text, image_public_id text, unit_price numeric, quantity integer
  );

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order.id, null, v_order.status, 'Pedido creado');

  return jsonb_build_object(
    'id', v_order.id,
    'code', v_order.code,
    'status', v_order.status,
    'subtotal', v_order.subtotal,
    'shipping_cost', v_order.shipping_cost,
    'total', v_order.total
  );
end;
$$;

-- Seguimiento: requiere código y email; devuelve solo lo que el cliente ya conoce. ------------
create function public.track_order(p_code text, p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'customer_name', o.customer_name,
    'payment_method', o.payment_method,
    'created_at', o.created_at,
    'paid_at', o.paid_at,
    'subtotal', o.subtotal,
    'shipping_cost', o.shipping_cost,
    'total', o.total,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', i.product_name,
        'brand_name', i.brand_name,
        'variant_label', i.variant_label,
        'image_public_id', i.image_public_id,
        'unit_price', i.unit_price,
        'quantity', i.quantity
      ) order by i.product_name)
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at)
      from public.order_status_history h
      where h.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.code = upper(trim(p_code))
    and o.customer_email = lower(trim(p_email));
$$;

-- Cambio de estado (interno): mantiene stock, fechas e historial consistentes. -------------
create function public.apply_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_changed_by uuid,
  p_note text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_previous public.order_status;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  if v_order.status = p_status then
    return v_order;
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Un pedido cancelado no puede reabrirse.' using errcode = 'P0001';
  end if;
  v_previous := v_order.status;

  -- Al cancelar, el stock vuelve a las variantes que todavía existen.
  if p_status = 'cancelled' then
    update public.product_variants v
    set stock = v.stock + returned.quantity
    from (
      select variant_id, sum(quantity) as quantity
      from public.order_items
      where order_id = p_order_id and variant_id is not null
      group by variant_id
    ) as returned
    where v.id = returned.variant_id;
  end if;

  update public.orders
  set status = p_status,
      paid_at = case
        when p_status = 'pending_payment' then null
        when p_status = 'cancelled' then paid_at
        else coalesce(paid_at, now())
      end,
      cancelled_at = case when p_status = 'cancelled' then now() else null end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_previous, p_status, p_changed_by, nullif(trim(p_note), ''));

  return v_order;
end;
$$;

-- Cambio de estado desde el panel. -------------------------------------------------------
create function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return public.apply_order_status(p_order_id, p_status, (select auth.uid()), p_note);
end;
$$;

-- Cancela los pedidos sin pagar que superaron el plazo y devuelve su stock (cron del servidor).
create function public.expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ttl integer;
  v_order_id uuid;
  v_count integer := 0;
begin
  select pending_order_ttl_hours into v_ttl from public.store_settings where id;
  for v_order_id in
    select id from public.orders
    where status = 'pending_payment' and created_at < now() - make_interval(hours => v_ttl)
    order by created_at
  loop
    perform public.apply_order_status(v_order_id, 'cancelled', null, 'Cancelado automáticamente: pago no recibido a tiempo');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Organizador: guarda el orden manual del catálogo. -----------------------------------------
create function public.reorder_products(p_ids uuid[])
returns void
language plpgsql
security definer
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

-- Permisos de ejecución ---------------------------------------------------------------
-- Postgres concede EXECUTE a PUBLIC por defecto: se revoca y se otorga solo a quien corresponde.
revoke execute on function
  public.create_order(jsonb, jsonb, public.payment_method),
  public.track_order(text, text),
  public.apply_order_status(uuid, public.order_status, uuid, text),
  public.set_order_status(uuid, public.order_status, text),
  public.expire_pending_orders(),
  public.reorder_products(uuid[])
from public, anon, authenticated;

grant execute on function
  public.create_order(jsonb, jsonb, public.payment_method),
  public.track_order(text, text),
  public.expire_pending_orders()
to service_role;

grant execute on function
  public.set_order_status(uuid, public.order_status, text),
  public.reorder_products(uuid[])
to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
