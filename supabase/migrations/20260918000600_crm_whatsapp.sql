-- Time: mini CRM (clientes deduplicados por teléfono), WhatsApp (conversaciones, mensajes,
-- plantillas, campañas) y ajustes del asistente de IA. Todo lo nuevo es solo para administradores;
-- el webhook y los envíos corren en el servidor con service_role.

-- Teléfonos ------------------------------------------------------------------------------
-- Clave de deduplicación: dígitos con código de país y sin "+". Un celular peruano de 9 dígitos
-- (9XXXXXXXX) recibe el prefijo 51; los números internacionales deben traer su código de país.
create function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^9\d{8}$' then '51' || d
    when d ~ '^0051\d{9,}$' then substr(d, 3)
    when d ~ '^[1-9]\d{9,14}$' then d
    else null
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) as digits;
$$;

-- Clientes -------------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone = public.normalize_phone(phone)),
  name text check (name is null or length(trim(name)) between 1 and 120),
  -- Nombre de perfil que envía WhatsApp; se usa si no conocemos el nombre real.
  whatsapp_name text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  document text,
  city text,
  source text not null check (source in ('checkout', 'registro', 'manual', 'whatsapp')),
  -- Consentimiento para mensajes promocionales (política de WhatsApp y Ley 29733).
  whatsapp_opt_in boolean not null default false,
  opt_in_at timestamptz,
  opt_in_source text,
  opt_out_at timestamptz,
  interests text[] not null default '{}',
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_tags_idx on public.customers using gin (tags);
create index customers_interests_idx on public.customers using gin (interests);
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

-- Alta o actualización por teléfono: el mismo número siempre es el mismo cliente.
-- Solo completa datos vacíos (no pisa lo que el equipo ya corrigió) y el consentimiento solo
-- se otorga con p_opt_in = true; un "no" en el checkout no revoca un consentimiento previo.
create function public.upsert_customer(
  p_phone text,
  p_name text default null,
  p_email text default null,
  p_source text default 'manual',
  p_opt_in boolean default null,
  p_opt_in_source text default null,
  p_whatsapp_name text default null,
  p_document text default null,
  p_city text default null,
  p_interests text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_id uuid;
begin
  if v_phone is null then
    return null;
  end if;

  insert into public.customers (phone, name, whatsapp_name, email, document, city, source, interests,
                                whatsapp_opt_in, opt_in_at, opt_in_source)
  values (
    v_phone,
    nullif(trim(p_name), ''),
    nullif(trim(p_whatsapp_name), ''),
    nullif(lower(trim(p_email)), ''),
    nullif(trim(p_document), ''),
    nullif(trim(p_city), ''),
    p_source,
    coalesce(p_interests, '{}'),
    coalesce(p_opt_in, false),
    case when p_opt_in then now() end,
    case when p_opt_in then coalesce(p_opt_in_source, p_source) end
  )
  on conflict (phone) do update set
    name = coalesce(public.customers.name, excluded.name),
    whatsapp_name = coalesce(excluded.whatsapp_name, public.customers.whatsapp_name),
    email = coalesce(public.customers.email, excluded.email),
    document = coalesce(public.customers.document, excluded.document),
    city = coalesce(public.customers.city, excluded.city),
    interests = (select coalesce(array_agg(distinct interest), '{}') from unnest(public.customers.interests || excluded.interests) as interest),
    whatsapp_opt_in = public.customers.whatsapp_opt_in or coalesce(p_opt_in, false),
    opt_in_at = case when p_opt_in and not public.customers.whatsapp_opt_in then now() else public.customers.opt_in_at end,
    opt_in_source = case when p_opt_in and not public.customers.whatsapp_opt_in then coalesce(p_opt_in_source, p_source) else public.customers.opt_in_source end,
    opt_out_at = case when p_opt_in then null else public.customers.opt_out_at end
  returning id into v_id;

  return v_id;
end;
$$;

-- Pedidos vinculados a clientes ---------------------------------------------------------------
alter table public.orders add column customer_id uuid references public.customers (id) on delete set null;
create index orders_customer_id_idx on public.orders (customer_id);

-- Cualquier pedido nuevo queda asociado a su cliente (por teléfono), sin importar cómo se cree.
create function public.link_order_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is null then
    new.customer_id := public.upsert_customer(
      new.customer_phone, new.customer_name, new.customer_email, 'checkout',
      null, null, null, new.customer_document, new.shipping_city
    );
  end if;
  return new;
end;
$$;

create trigger orders_link_customer before insert on public.orders
for each row execute function public.link_order_customer();

-- Pedidos existentes (pruebas, demo) también se vinculan.
update public.orders o
set customer_id = public.upsert_customer(o.customer_phone, o.customer_name, o.customer_email, 'checkout')
where o.customer_id is null;

-- WhatsApp: conversaciones y mensajes ------------------------------------------------------------
create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers (id) on delete cascade,
  -- 'ai': responde el asistente. 'human': el equipo tomó la conversación y la IA calla.
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  human_since timestamptz,
  human_by uuid references auth.users (id) on delete set null,
  -- Último mensaje del cliente: abre la ventana de 24 horas para mensajes libres.
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_human_message_at timestamptz,
  unread_count integer not null default 0,
  needs_attention boolean not null default false,
  attention_reason text,
  -- Evita que dos procesos del asistente respondan a la vez la misma conversación.
  ai_lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wa_conversations_last_message_idx on public.wa_conversations (last_message_at desc);
create trigger wa_conversations_set_updated_at before update on public.wa_conversations
for each row execute function public.set_updated_at();

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  -- 'chat': texto para abrir WhatsApp desde el panel (wa.me). 'campaign': plantilla aprobada por Meta.
  kind text not null check (kind in ('chat', 'campaign')),
  body text not null check (length(trim(body)) between 2 and 1024),
  footer text check (footer is null or length(footer) <= 60),
  button_text text check (button_text is null or length(button_text) <= 25),
  button_url text,
  -- Datos de la plantilla en WhatsApp (solo kind = 'campaign').
  wa_template_name text unique check (wa_template_name is null or (wa_template_name ~ '^[a-z0-9_]+$' and length(wa_template_name) <= 512)),
  wa_language text not null default 'es',
  wa_category text not null default 'MARKETING' check (wa_category in ('MARKETING', 'UTILITY')),
  wa_status text not null default 'draft' check (wa_status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled')),
  wa_rejection_reason text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index message_templates_one_default_chat_idx on public.message_templates (kind) where is_default;
create trigger message_templates_set_updated_at before update on public.message_templates
for each row execute function public.set_updated_at();

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  template_id uuid not null references public.message_templates (id) on delete restrict,
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled', 'failed')),
  recipients_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campaigns_set_updated_at before update on public.campaigns
for each row execute function public.set_updated_at();

create table public.campaign_recipients (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  wa_message_id text unique,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  unique (campaign_id, customer_id)
);
create index campaign_recipients_pending_idx on public.campaign_recipients (campaign_id) where status = 'pending';
create index campaign_recipients_customer_idx on public.campaign_recipients (customer_id, sent_at desc);

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  -- Quién lo escribió: cliente, asistente, persona del equipo (panel o app del celular), campaña o sistema.
  sender text not null check (sender in ('customer', 'ai', 'agent', 'campaign', 'system')),
  type text not null check (type in ('text', 'image', 'template', 'other')),
  body text,
  media_url text,
  wa_message_id text unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error text,
  product_id uuid references public.products (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  agent_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index wa_messages_conversation_idx on public.wa_messages (conversation_id, created_at);

-- Ajustes del asistente (una fila; no son públicos, a diferencia de store_settings) -------------
create table public.assistant_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  model text not null default 'claude-opus-5' check (model in ('claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5')),
  effort text not null default 'medium' check (effort in ('low', 'medium', 'high')),
  max_products integer not null default 3 check (max_products between 1 and 6),
  max_photos_per_product integer not null default 3 check (max_photos_per_product between 1 and 10),
  -- 'caption': nombre y precio van como texto de la primera foto (menos mensajes, menos costo).
  -- 'separate': un mensaje de texto con nombre y precio y luego las fotos.
  photos_mode text not null default 'caption' check (photos_mode in ('caption', 'separate')),
  resume_ai_after_hours integer not null default 12 check (resume_ai_after_hours between 1 and 168),
  instructions text not null default '',
  handoff_message text not null default 'Te comunico con una persona de nuestro equipo. En breve te escribe por aquí.',
  daily_campaign_limit integer not null default 250 check (daily_campaign_limit between 1 and 100000),
  updated_at timestamptz not null default now()
);
insert into public.assistant_settings (id) values (true);
create trigger assistant_settings_set_updated_at before update on public.assistant_settings
for each row execute function public.set_updated_at();

-- Plantillas iniciales (editables desde el panel).
insert into public.message_templates (name, kind, body, is_default)
values ('Saludo', 'chat', 'Hola {{nombre}}, te escribimos de Time Relojería. ¿En qué te podemos ayudar?', true);

insert into public.message_templates (name, kind, body, footer, button_text, button_url, wa_template_name, wa_category)
values (
  'Novedades del catálogo',
  'campaign',
  'Hola {{nombre}}, llegaron relojes nuevos a Time Relojería. Responde este mensaje y te enviamos fotos y precios de los modelos que te interesen.',
  'Responde BAJA para no recibir novedades.',
  'Ver catálogo',
  null,
  'novedades_catalogo',
  'MARKETING'
);

-- Vista de clientes con métricas de compra ----------------------------------------------------
-- security_invoker: respeta la RLS de quien consulta (solo admins ven filas).
create view public.customer_overview with (security_invoker = true) as
select
  c.*,
  coalesce(c.name, c.whatsapp_name) as display_name,
  coalesce(stats.orders_count, 0) as orders_count,
  coalesce(stats.paid_orders_count, 0) as paid_orders_count,
  coalesce(stats.total_spent, 0) as total_spent,
  stats.first_order_at,
  stats.last_order_at,
  stats.last_paid_at,
  coalesce(stats.pending_orders, 0) as pending_orders,
  conversation.id as conversation_id,
  conversation.mode as conversation_mode,
  conversation.last_inbound_at,
  conversation.last_message_at,
  conversation.unread_count,
  coalesce(conversation.needs_attention, false) as needs_attention
from public.customers c
left join lateral (
  select
    count(*) filter (where o.status <> 'cancelled') as orders_count,
    count(*) filter (where o.paid_at is not null and o.status <> 'cancelled') as paid_orders_count,
    sum(o.total) filter (where o.paid_at is not null and o.status <> 'cancelled') as total_spent,
    min(o.created_at) as first_order_at,
    max(o.created_at) as last_order_at,
    max(o.paid_at) filter (where o.status <> 'cancelled') as last_paid_at,
    count(*) filter (where o.status = 'pending_payment') as pending_orders
  from public.orders o
  where o.customer_id = c.id
) as stats on true
left join public.wa_conversations conversation on conversation.customer_id = c.id;

-- Segmentación para envíos masivos ------------------------------------------------------------
-- Todos los filtros son opcionales y se combinan con AND:
--   audiencia: 'todos' | 'compradores' | 'sin_compras'
--   sin_compra_dias: n   → compraron alguna vez pero no en los últimos n días
--   compra_reciente_dias: n → pagaron un pedido en los últimos n días
--   marcas: [..]         → compraron o declararon interés en alguna de esas marcas
--   generos: [..]        → compraron o declararon interés en relojes de ese género
--   gasto_min: n         → gasto total pagado ≥ n (S/)
--   etiquetas: [..]      → tienen alguna de esas etiquetas del equipo
--   solo_contactables: true (por defecto) → con consentimiento vigente para mensajes promocionales
create function public.crm_segment(p_filters jsonb)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select
      coalesce(p_filters ->> 'audiencia', 'todos') as audiencia,
      (p_filters ->> 'sin_compra_dias')::integer as sin_compra_dias,
      (p_filters ->> 'compra_reciente_dias')::integer as compra_reciente_dias,
      (p_filters ->> 'gasto_min')::numeric as gasto_min,
      coalesce((select array_agg(lower(value)) from jsonb_array_elements_text(coalesce(p_filters -> 'marcas', '[]')) as value), '{}') as marcas,
      coalesce((select array_agg(lower(value)) from jsonb_array_elements_text(coalesce(p_filters -> 'generos', '[]')) as value), '{}') as generos,
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_filters -> 'etiquetas', '[]')) as value), '{}') as etiquetas,
      coalesce((p_filters ->> 'solo_contactables')::boolean, true) as solo_contactables
  )
  select c.id
  from public.customer_overview c, f
  where (not f.solo_contactables or (c.whatsapp_opt_in and c.opt_out_at is null))
    and (f.audiencia = 'todos'
         or (f.audiencia = 'compradores' and c.paid_orders_count > 0)
         or (f.audiencia = 'sin_compras' and c.paid_orders_count = 0))
    and (f.sin_compra_dias is null or (c.paid_orders_count > 0 and c.last_paid_at < now() - make_interval(days => f.sin_compra_dias)))
    and (f.compra_reciente_dias is null or c.last_paid_at >= now() - make_interval(days => f.compra_reciente_dias))
    and (f.gasto_min is null or c.total_spent >= f.gasto_min)
    and (cardinality(f.etiquetas) = 0 or c.tags && f.etiquetas)
    and (cardinality(f.marcas) = 0
         or exists (select 1 from unnest(c.interests) as interest where lower(interest) = any (f.marcas))
         or exists (
           select 1 from public.orders o
           join public.order_items i on i.order_id = o.id
           where o.customer_id = c.id and o.paid_at is not null and o.status <> 'cancelled'
             and lower(i.brand_name) = any (f.marcas)
         ))
    and (cardinality(f.generos) = 0
         or exists (select 1 from unnest(c.interests) as interest where lower(interest) = any (f.generos))
         or exists (
           select 1 from public.orders o
           join public.order_items i on i.order_id = o.id
           join public.products p on p.id = i.product_id
           where o.customer_id = c.id and o.paid_at is not null and o.status <> 'cancelled'
             and p.gender::text = any (f.generos)
         ));
$$;

-- create_order también registra el consentimiento de WhatsApp si el cliente lo marcó ----------------
create or replace function public.create_order(
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
  v_customer_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'El pedido tiene demasiados productos.' using errcode = '22023';
  end if;
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
      r.variant_id, r.quantity, v.stock, v.label as variant_label, v.price_override,
      p.id as product_id, p.name as product_name, p.price, p.status,
      b.name as brand_name, c.name as category_name,
      (select i.public_id from public.product_images i where i.product_id = p.id order by i.is_primary desc, i.position limit 1) as image_public_id
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
      'product_id', v_line.product_id, 'variant_id', v_line.variant_id, 'product_name', v_line.product_name,
      'brand_name', v_line.brand_name, 'category_name', v_line.category_name, 'variant_label', v_line.variant_label,
      'image_public_id', v_line.image_public_id, 'unit_price', v_unit_price, 'quantity', v_line.quantity
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

  v_customer_id := public.upsert_customer(
    p_customer ->> 'phone', p_customer ->> 'name', p_customer ->> 'email', 'checkout',
    coalesce((p_customer ->> 'whatsapp_opt_in')::boolean, false), 'checkout', null,
    p_customer ->> 'document', p_customer ->> 'city'
  );

  insert into public.orders (
    customer_id, customer_name, customer_email, customer_phone, customer_document,
    shipping_address, shipping_city, notes, payment_method, subtotal, shipping_cost, total
  )
  values (
    v_customer_id,
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
    'id', v_order.id, 'code', v_order.code, 'status', v_order.status,
    'subtotal', v_order.subtotal, 'shipping_cost', v_order.shipping_cost, 'total', v_order.total
  );
end;
$$;

-- RLS: todo el CRM es solo para administradores ----------------------------------------------------
alter table public.customers enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.message_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.assistant_settings enable row level security;

revoke all on table
  public.customers, public.wa_conversations, public.wa_messages, public.message_templates,
  public.campaigns, public.campaign_recipients, public.assistant_settings, public.customer_overview
from anon;

create policy "Admin: gestiona clientes" on public.customers for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: gestiona conversaciones" on public.wa_conversations for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: ve mensajes" on public.wa_messages for select to authenticated
using ((select public.is_admin()));
create policy "Admin: gestiona plantillas" on public.message_templates for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: gestiona campañas" on public.campaigns for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin: ve destinatarios" on public.campaign_recipients for select to authenticated
using ((select public.is_admin()));
create policy "Admin: gestiona ajustes del asistente" on public.assistant_settings for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

-- Los mensajes y destinatarios solo los escribe el servidor (service_role), que es quien habla con WhatsApp.
revoke insert, update, delete on table public.wa_messages, public.campaign_recipients from authenticated;

revoke execute on function
  public.upsert_customer(text, text, text, text, boolean, text, text, text, text, text[]),
  public.link_order_customer()
from public, anon, authenticated;
grant execute on function public.upsert_customer(text, text, text, text, boolean, text, text, text, text, text[]) to service_role;
revoke execute on function public.crm_segment(jsonb) from public, anon;
grant execute on function public.crm_segment(jsonb) to authenticated, service_role;
