-- Panel: guardado atómico de productos, orden de agotados y estadísticas de ventas.

-- Organizador: si está activo, la tienda muestra los agotados al final aunque el orden manual diga
-- otra cosa. Apagado, el orden del organizador manda en todo.
alter table public.store_settings add column sold_out_last boolean not null default true;

-- Productos ---------------------------------------------------------------------------------------
-- Guarda un producto con sus variantes e imágenes en una sola transacción. El id lo genera el panel
-- al abrir el formulario (las fotos se suben a la carpeta de ese id antes de guardar).
--   p_product: { id, slug, name, description, brand_id, category_id, gender, movement, price,
--                compare_at_price, status, featured, specs: [...],
--                variants: [{ id?, label, sku, stock, price_override }],
--                images: [{ public_id, width, height, is_primary, crop, brightness, contrast }] }
-- Devuelve { id, slug, created, removed_images }: las imágenes quitadas quedan en la cola de borrado
-- (trigger) y el servidor las destruye en Cloudinary apenas termina.
create function public.save_product(p_product jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_product ->> 'id')::uuid;
  v_created boolean;
  v_base text := p_product ->> 'slug';
  v_slug text;
  v_suffix integer := 1;
  v_variant record;
  v_variant_id uuid;
  v_keep_variants uuid[] := '{}';
  v_image record;
  v_public_ids text[];
  v_removed text[];
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Falta el id del producto.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_product -> 'variants') is distinct from 'array' or jsonb_array_length(p_product -> 'variants') = 0 then
    raise exception 'El producto necesita al menos una variante.' using errcode = '22023';
  end if;

  -- Slug único: "casio-mtp" → "casio-mtp-2" si ya lo usa otro producto.
  v_slug := v_base;
  while exists (select 1 from public.products where slug = v_slug and id <> v_id) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix;
  end loop;

  v_created := not exists (select 1 from public.products where id = v_id);
  if v_created then
    -- Los productos nuevos aparecen primero en el organizador.
    insert into public.products (id, slug, name, description, brand_id, category_id, gender, movement, price,
                                 compare_at_price, status, featured, specs, position)
    values (
      v_id, v_slug, p_product ->> 'name', coalesce(p_product ->> 'description', ''),
      (p_product ->> 'brand_id')::uuid, (p_product ->> 'category_id')::uuid,
      (p_product ->> 'gender')::public.watch_gender, (p_product ->> 'movement')::public.watch_movement,
      (p_product ->> 'price')::numeric, (p_product ->> 'compare_at_price')::numeric,
      coalesce((p_product ->> 'status')::public.product_status, 'draft'),
      coalesce((p_product ->> 'featured')::boolean, false),
      coalesce(p_product -> 'specs', '[]'::jsonb),
      (select coalesce(min(position), 1) - 1 from public.products)
    );
  else
    update public.products
    set slug = v_slug,
        name = p_product ->> 'name',
        description = coalesce(p_product ->> 'description', ''),
        brand_id = (p_product ->> 'brand_id')::uuid,
        category_id = (p_product ->> 'category_id')::uuid,
        gender = (p_product ->> 'gender')::public.watch_gender,
        movement = (p_product ->> 'movement')::public.watch_movement,
        price = (p_product ->> 'price')::numeric,
        compare_at_price = (p_product ->> 'compare_at_price')::numeric,
        status = coalesce((p_product ->> 'status')::public.product_status, status),
        featured = coalesce((p_product ->> 'featured')::boolean, featured),
        specs = coalesce(p_product -> 'specs', '[]'::jsonb)
    where id = v_id;
    if not found then
      raise exception 'No tienes permiso para editar este producto.' using errcode = '42501';
    end if;
  end if;

  -- Variantes: se actualizan las que siguen, se crean las nuevas y se borran las quitadas.
  -- Los pedidos históricos no se rompen: order_items guarda una copia y variant_id pasa a null.
  for v_variant in
    select value, ordinality from jsonb_array_elements(p_product -> 'variants') with ordinality
  loop
    v_variant_id := nullif(v_variant.value ->> 'id', '')::uuid;
    if v_variant_id is not null and exists (select 1 from public.product_variants where id = v_variant_id and product_id = v_id) then
      update public.product_variants
      set label = coalesce(nullif(trim(v_variant.value ->> 'label'), ''), 'Única'),
          sku = nullif(trim(v_variant.value ->> 'sku'), ''),
          stock = (v_variant.value ->> 'stock')::integer,
          price_override = (v_variant.value ->> 'price_override')::numeric,
          position = v_variant.ordinality
      where id = v_variant_id;
    else
      insert into public.product_variants (product_id, label, sku, stock, price_override, position)
      values (
        v_id,
        coalesce(nullif(trim(v_variant.value ->> 'label'), ''), 'Única'),
        nullif(trim(v_variant.value ->> 'sku'), ''),
        (v_variant.value ->> 'stock')::integer,
        (v_variant.value ->> 'price_override')::numeric,
        v_variant.ordinality
      )
      returning id into v_variant_id;
    end if;
    v_keep_variants := v_keep_variants || v_variant_id;
  end loop;
  delete from public.product_variants where product_id = v_id and id <> all (v_keep_variants);

  -- Imágenes: en el orden recibido; exactamente una principal si hay alguna.
  select coalesce(array_agg(value ->> 'public_id'), '{}') into v_public_ids
  from jsonb_array_elements(coalesce(p_product -> 'images', '[]'::jsonb));
  if exists (select 1 from public.product_images where public_id = any (v_public_ids) and product_id <> v_id) then
    raise exception 'Una de las imágenes pertenece a otro producto.' using errcode = '22023';
  end if;

  with removed as (
    delete from public.product_images where product_id = v_id and public_id <> all (v_public_ids)
    returning public_id
  )
  select coalesce(array_agg(public_id), '{}') into v_removed from removed;

  update public.product_images set is_primary = false where product_id = v_id and is_primary;
  for v_image in
    select value, ordinality from jsonb_array_elements(coalesce(p_product -> 'images', '[]'::jsonb)) with ordinality
  loop
    insert into public.product_images (product_id, public_id, width, height, position, is_primary, crop, brightness, contrast)
    values (
      v_id,
      v_image.value ->> 'public_id',
      (v_image.value ->> 'width')::integer,
      (v_image.value ->> 'height')::integer,
      v_image.ordinality,
      coalesce((v_image.value ->> 'is_primary')::boolean, false),
      nullif(v_image.value -> 'crop', 'null'::jsonb),
      coalesce((v_image.value ->> 'brightness')::smallint, 0),
      coalesce((v_image.value ->> 'contrast')::smallint, 0)
    )
    on conflict (public_id) do update
    set position = excluded.position,
        is_primary = excluded.is_primary,
        crop = excluded.crop,
        brightness = excluded.brightness,
        contrast = excluded.contrast,
        width = coalesce(excluded.width, public.product_images.width),
        height = coalesce(excluded.height, public.product_images.height);
  end loop;
  if not exists (select 1 from public.product_images where product_id = v_id and is_primary) then
    update public.product_images set is_primary = true
    where id = (select id from public.product_images where product_id = v_id order by position limit 1);
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'created', v_created, 'removed_images', to_jsonb(v_removed));
end;
$$;

revoke execute on function public.save_product(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated;

-- Estadísticas de ventas ------------------------------------------------------------------------
-- Venta = pedido con pago confirmado (paid_at) que no fue cancelado; se fecha por paid_at, en hora
-- de Lima. Son security invoker: sin rol de admin, RLS no deja ver pedidos y todo da cero.

create function public.sales_kpis(p_from timestamptz, p_to timestamptz)
returns table (revenue numeric, orders bigint, units bigint, avg_ticket numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(o.total), 0),
    count(o.id),
    coalesce(sum(items.units), 0)::bigint,
    coalesce(round(avg(o.total), 2), 0)
  from public.orders o
  left join lateral (select sum(i.quantity) as units from public.order_items i where i.order_id = o.id) as items on true
  where o.paid_at is not null and o.status <> 'cancelled' and o.paid_at >= p_from and o.paid_at < p_to;
$$;

-- Serie por día, mes o año, con los períodos vacíos en cero.
create function public.sales_series(p_granularity text, p_from timestamptz, p_to timestamptz)
returns table (bucket date, revenue numeric, orders bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_granularity not in ('day', 'month', 'year') then
    raise exception 'Granularidad inválida.' using errcode = '22023';
  end if;
  return query
  with buckets as (
    select generate_series(
      date_trunc(p_granularity, p_from at time zone 'America/Lima'),
      date_trunc(p_granularity, (p_to - interval '1 second') at time zone 'America/Lima'),
      ('1 ' || p_granularity)::interval
    ) as start
  ),
  sales as (
    select date_trunc(p_granularity, o.paid_at at time zone 'America/Lima') as start, o.total
    from public.orders o
    where o.paid_at is not null and o.status <> 'cancelled' and o.paid_at >= p_from and o.paid_at < p_to
  )
  select b.start::date, coalesce(sum(s.total), 0), count(s.total)
  from buckets b
  left join sales s on s.start = b.start
  group by b.start
  order by b.start;
end;
$$;

-- Ranking por producto, marca, categoría o método de pago.
create function public.sales_breakdown(p_dimension text, p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (label text, revenue numeric, units bigint, orders bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_dimension = 'payment_method' then
    return query
    select o.payment_method::text, sum(o.total), coalesce(sum(items.units), 0)::bigint, count(o.id)
    from public.orders o
    left join lateral (select sum(i.quantity) as units from public.order_items i where i.order_id = o.id) as items on true
    where o.paid_at is not null and o.status <> 'cancelled' and o.paid_at >= p_from and o.paid_at < p_to
    group by o.payment_method
    order by 2 desc
    limit p_limit;
    return;
  end if;
  if p_dimension not in ('product', 'brand', 'category') then
    raise exception 'Dimensión inválida.' using errcode = '22023';
  end if;
  return query
  select
    case p_dimension
      when 'product' then concat_ws(' ', i.brand_name, i.product_name)
      when 'brand' then coalesce(i.brand_name, 'Sin marca')
      else coalesce(i.category_name, 'Sin categoría')
    end as label,
    sum(i.line_total),
    sum(i.quantity)::bigint,
    count(distinct o.id)
  from public.orders o
  join public.order_items i on i.order_id = o.id
  where o.paid_at is not null and o.status <> 'cancelled' and o.paid_at >= p_from and o.paid_at < p_to
  group by 1
  order by 2 desc, 1
  limit p_limit;
end;
$$;

-- Primera venta registrada (para la vista histórica).
create function public.first_sale_at()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select min(paid_at) from public.orders where paid_at is not null and status <> 'cancelled';
$$;

revoke execute on function
  public.sales_kpis(timestamptz, timestamptz),
  public.sales_series(text, timestamptz, timestamptz),
  public.sales_breakdown(text, timestamptz, timestamptz, integer),
  public.first_sale_at()
from public, anon;
grant execute on function
  public.sales_kpis(timestamptz, timestamptz),
  public.sales_series(text, timestamptz, timestamptz),
  public.sales_breakdown(text, timestamptz, timestamptz, integer),
  public.first_sale_at()
to authenticated, service_role;
