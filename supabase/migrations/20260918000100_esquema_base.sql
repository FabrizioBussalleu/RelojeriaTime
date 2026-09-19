-- Time: esquema base (administradores, catálogo, pedidos y ajustes de la tienda).
-- Seguridad (RLS y permisos) en 20260918000200; funciones de pedidos en 20260918000300.

create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum ('pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled');
create type public.payment_method as enum ('transfer', 'yape', 'plin');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Administradores -------------------------------------------------------------
-- Solo quien figure aquí puede entrar al panel y escribir en el catálogo o los pedidos.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

-- Catálogo --------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index brands_name_key on public.brands (lower(name));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  brand_id uuid references public.brands (id) on delete restrict,
  category_id uuid references public.categories (id) on delete restrict,
  price numeric(10, 2) not null check (price >= 0),
  -- Precio anterior: si existe, activa el badge de oferta en la tienda.
  compare_at_price numeric(10, 2) check (compare_at_price is null or compare_at_price > price),
  status public.product_status not null default 'draft',
  featured boolean not null default false,
  -- Orden manual del organizador (drag and drop).
  position integer not null default 0,
  -- Especificaciones libres: [{ "label": "Diámetro", "value": "40 mm" }, ...]
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_status_position_idx on public.products (status, position);
create index products_brand_id_idx on public.products (brand_id);
create index products_category_id_idx on public.products (category_id);

-- Todo producto tiene al menos una variante; sin tallas o medidas visibles existe una "Única".
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null default 'Única' check (length(trim(label)) between 1 and 60),
  sku text unique,
  stock integer not null default 0 check (stock >= 0),
  price_override numeric(10, 2) check (price_override is null or price_override >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_variants_product_id_idx on public.product_variants (product_id, position);

-- Las ediciones (recorte, brillo, contraste) son no destructivas: se guardan como parámetros
-- y se aplican como transformaciones de Cloudinary en la URL. El original no se toca.
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  public_id text not null unique,
  width integer check (width > 0),
  height integer check (height > 0),
  position integer not null default 0,
  is_primary boolean not null default false,
  crop jsonb check (crop is null or (jsonb_typeof(crop) = 'object' and crop ?& array['x', 'y', 'width', 'height'])),
  brightness smallint not null default 0 check (brightness between -99 and 100),
  contrast smallint not null default 0 check (contrast between -100 and 100),
  created_at timestamptz not null default now()
);
create index product_images_product_id_idx on public.product_images (product_id, position);
create unique index product_images_one_primary_idx on public.product_images (product_id) where is_primary;

-- Cola de borrado en Cloudinary --------------------------------------------------
-- Cada imagen que desaparece de la base (producto eliminado, imagen quitada o reemplazada)
-- entra aquí automáticamente. El servidor hace el destroy y borra la fila; si Cloudinary
-- falla, la fila queda para el reintento del cron. Así nunca quedan huérfanas en silencio.
create table public.asset_deletion_queue (
  id bigint generated always as identity primary key,
  public_id text not null unique,
  reason text not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create function public.enqueue_image_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.asset_deletion_queue (public_id, reason)
    values (old.public_id, 'image_deleted')
    on conflict (public_id) do nothing;
    return old;
  end if;

  if new.public_id is distinct from old.public_id then
    insert into public.asset_deletion_queue (public_id, reason)
    values (old.public_id, 'image_replaced')
    on conflict (public_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger product_images_enqueue_deletion
after delete or update of public_id on public.product_images
for each row execute function public.enqueue_image_deletion();

-- Ajustes de la tienda (una sola fila) -----------------------------------------------
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Time',
  contact_email text,
  whatsapp_number text,
  instagram_url text,
  tiktok_url text,
  facebook_url text,
  -- [{ "bank": "BCP", "holder": "...", "account": "...", "cci": "..." }]
  bank_accounts jsonb not null default '[]'::jsonb check (jsonb_typeof(bank_accounts) = 'array'),
  yape_number text,
  plin_number text,
  payment_holder_name text,
  shipping_flat_fee numeric(10, 2) not null default 0 check (shipping_flat_fee >= 0),
  free_shipping_threshold numeric(10, 2) check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  -- Pedidos sin pagar pasado este plazo se cancelan y devuelven su stock.
  pending_order_ttl_hours integer not null default 48 check (pending_order_ttl_hours > 0),
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id) values (true);

-- Pedidos ---------------------------------------------------------------------
create sequence public.order_code_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TM-' || lpad(nextval('public.order_code_seq')::text, 6, '0')),
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  customer_email text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  customer_phone text not null check (length(trim(customer_phone)) between 6 and 30),
  customer_document text check (customer_document is null or length(trim(customer_document)) between 8 and 20),
  shipping_address text not null check (length(trim(shipping_address)) between 5 and 300),
  shipping_city text check (shipping_city is null or length(trim(shipping_city)) <= 80),
  notes text check (notes is null or length(notes) <= 1000),
  payment_method public.payment_method not null,
  -- Preparado para cuotas; en v1 siempre es 1 y no se muestra.
  installments_count smallint not null default 1 check (installments_count between 1 and 36),
  status public.order_status not null default 'pending_payment',
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  shipping_cost numeric(10, 2) not null default 0 check (shipping_cost >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  total numeric(10, 2) not null check (total >= 0),
  paid_at timestamptz,
  cancelled_at timestamptz,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.order_code_seq owned by public.orders.code;
create index orders_status_created_at_idx on public.orders (status, created_at desc);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_paid_at_idx on public.orders (paid_at) where paid_at is not null;
create index orders_customer_email_idx on public.orders (lower(customer_email));

-- Copia (snapshot) de lo vendido: borrar un producto nunca rompe un pedido histórico.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  brand_name text,
  category_name text,
  variant_label text,
  image_public_id text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_id_idx on public.order_status_history (order_id, created_at);

-- updated_at automático -----------------------------------------------------------
create trigger brands_set_updated_at before update on public.brands
for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();
create trigger store_settings_set_updated_at before update on public.store_settings
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
