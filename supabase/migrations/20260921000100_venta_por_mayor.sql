-- Time: venta al por mayor.
-- Un reloj publicado se ve en la tienda y también en la página de por mayor. Marcado como
-- "solo al por mayor" desaparece del catálogo normal y queda únicamente en esa página, donde no se
-- muestran precios: el cliente arma una lista y pide cotización por WhatsApp.
-- La página de por mayor tiene su propio orden (wholesale_position), independiente del de la tienda.

alter table public.products
  add column wholesale_only boolean not null default false,
  add column wholesale_position integer not null default 0;

-- Arranca con el mismo orden que la tienda; desde el organizador se acomoda aparte.
update public.products set wholesale_position = position;

create index products_wholesale_position_idx on public.products (wholesale_position);

-- save_product: guarda la marca de "solo al por mayor" y coloca los nuevos al inicio de ambos órdenes.
-- (copia de la versión anterior con esos dos cambios)
create or replace function public.save_product(p_product jsonb)
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
                                 compare_at_price, status, featured, specs, position, wholesale_only, wholesale_position)
    values (
      v_id, v_slug, p_product ->> 'name', coalesce(p_product ->> 'description', ''),
      (p_product ->> 'brand_id')::uuid, (p_product ->> 'category_id')::uuid,
      (p_product ->> 'gender')::public.watch_gender, (p_product ->> 'movement')::public.watch_movement,
      (p_product ->> 'price')::numeric, (p_product ->> 'compare_at_price')::numeric,
      coalesce((p_product ->> 'status')::public.product_status, 'draft'),
      coalesce((p_product ->> 'featured')::boolean, false),
      coalesce(p_product -> 'specs', '[]'::jsonb),
      (select coalesce(min(position), 1) - 1 from public.products),
      coalesce((p_product ->> 'wholesale_only')::boolean, false),
      (select coalesce(min(wholesale_position), 1) - 1 from public.products)
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
        wholesale_only = coalesce((p_product ->> 'wholesale_only')::boolean, wholesale_only),
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

-- reorder_products: el mismo organizador guarda el orden de la tienda o el de por mayor.
drop function if exists public.reorder_products(uuid[]);

create function public.reorder_products(p_ids uuid[], p_scope text default 'tienda')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_scope not in ('tienda', 'por_mayor') then
    raise exception 'Orden desconocido.' using errcode = '22023';
  end if;
  if p_scope = 'tienda' then
    update public.products p
    set position = ordered.position
    from unnest(p_ids) with ordinality as ordered(id, position)
    where p.id = ordered.id;
  else
    update public.products p
    set wholesale_position = ordered.position
    from unnest(p_ids) with ordinality as ordered(id, position)
    where p.id = ordered.id;
  end if;
end;
$$;

revoke execute on function public.reorder_products(uuid[], text) from public, anon;
grant execute on function public.reorder_products(uuid[], text) to authenticated;
