-- Time: atributos de reloj filtrables, Libro de Reclamaciones y datos de pago iniciales.

-- Atributos de reloj --------------------------------------------------------------
-- Marca ya es una tabla (brands). Género y movimiento son filtros de la tienda; el resto de
-- especificaciones (diámetro, material, resistencia al agua…) sigue en products.specs.
create type public.watch_gender as enum ('hombre', 'mujer', 'unisex');
create type public.watch_movement as enum ('cuarzo', 'automatico', 'mecanico', 'solar', 'smartwatch');

alter table public.products
  add column gender public.watch_gender,
  add column movement public.watch_movement;

create index products_gender_idx on public.products (gender);
create index products_movement_idx on public.products (movement);

-- Libro de Reclamaciones virtual (Ley 29571, Código de Protección y Defensa del Consumidor) -----
create type public.complaint_kind as enum ('reclamo', 'queja');
create type public.complaint_status as enum ('recibido', 'en_proceso', 'respondido');

create sequence public.complaint_number_seq;

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default ('LR-' || to_char(now() at time zone 'America/Lima', 'YYYY') || '-' || lpad(nextval('public.complaint_number_seq')::text, 6, '0')),
  kind public.complaint_kind not null,
  consumer_name text not null check (length(trim(consumer_name)) between 2 and 120),
  consumer_document text not null check (length(trim(consumer_document)) between 8 and 20),
  consumer_email text not null check (consumer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consumer_phone text check (consumer_phone is null or length(trim(consumer_phone)) between 6 and 30),
  consumer_address text not null check (length(trim(consumer_address)) between 5 and 300),
  -- Si quien reclama es menor de edad, se registran los datos de su padre, madre o apoderado.
  is_minor boolean not null default false,
  guardian_name text check (guardian_name is null or length(trim(guardian_name)) between 2 and 120),
  item_type text not null check (item_type in ('producto', 'servicio')),
  item_description text not null check (length(trim(item_description)) between 3 and 500),
  amount numeric(10, 2) check (amount is null or amount >= 0),
  order_code text check (order_code is null or length(trim(order_code)) <= 20),
  detail text not null check (length(trim(detail)) between 10 and 3000),
  consumer_request text not null check (length(trim(consumer_request)) between 5 and 1500),
  status public.complaint_status not null default 'recibido',
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (not is_minor or guardian_name is not null)
);
alter sequence public.complaint_number_seq owned by public.complaints.code;
create index complaints_status_created_at_idx on public.complaints (status, created_at desc);

alter table public.complaints enable row level security;
-- Se registran solo desde el servidor (service_role), que valida los datos y limita la frecuencia.
revoke all on table public.complaints from anon;
revoke all on sequence public.complaint_number_seq from anon, authenticated;

create policy "Admin: ve reclamos" on public.complaints
for select to authenticated using ((select public.is_admin()));

create policy "Admin: responde reclamos" on public.complaints
for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

revoke insert, update, delete on table public.complaints from authenticated;
grant update (status, response, responded_at) on table public.complaints to authenticated;

-- Datos de pago y contacto iniciales (editables luego desde Ajustes) -------------------------
update public.store_settings
set whatsapp_number = '51982762602',
    yape_number = '982762602',
    bank_accounts = '[{"bank": "XXXXXXXXXXX", "holder": "XXXXXXXXXXX", "account": "XXXXXXXXXXX", "cci": "XXXXXXXXXXX"}]'::jsonb
where id;
