-- Campañas: más filtros de segmentación, inicio atómico del envío y bloqueo del proceso de envío.

-- Índices de claves foráneas señalados por el linter de Supabase -------------------------------
create index campaigns_created_by_idx on public.campaigns (created_by);
create index campaigns_template_id_idx on public.campaigns (template_id);
create index wa_conversations_human_by_idx on public.wa_conversations (human_by);
create index wa_messages_agent_id_idx on public.wa_messages (agent_id);
create index wa_messages_campaign_id_idx on public.wa_messages (campaign_id);
create index wa_messages_product_id_idx on public.wa_messages (product_id);

-- Envío por tandas: un solo proceso a la vez por campaña.
alter table public.campaigns add column processing_until timestamptz;
-- Envíos de campaña de las últimas 24 horas (límite diario de WhatsApp).
create index campaign_recipients_sent_at_idx on public.campaign_recipients (sent_at) where sent_at is not null;

-- Segmentación ---------------------------------------------------------------------------------
-- Filtros nuevos (además de los de la migración anterior):
--   origen: [..]              → cómo llegó el cliente: checkout, registro, manual, whatsapp
--   conversacion_dias: n      → escribió por WhatsApp en los últimos n días
--   pedido_sin_pagar_dias: n  → hizo un pedido en los últimos n días que no pagó (y no compró después)
--   excluir_campana_dias: n   → no recibió otra campaña en los últimos n días (evita saturar)
create or replace function public.crm_segment(p_filters jsonb)
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
      (p_filters ->> 'conversacion_dias')::integer as conversacion_dias,
      (p_filters ->> 'pedido_sin_pagar_dias')::integer as pedido_sin_pagar_dias,
      (p_filters ->> 'excluir_campana_dias')::integer as excluir_campana_dias,
      coalesce((select array_agg(lower(value)) from jsonb_array_elements_text(coalesce(p_filters -> 'marcas', '[]')) as value), '{}') as marcas,
      coalesce((select array_agg(lower(value)) from jsonb_array_elements_text(coalesce(p_filters -> 'generos', '[]')) as value), '{}') as generos,
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_filters -> 'etiquetas', '[]')) as value), '{}') as etiquetas,
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_filters -> 'origen', '[]')) as value), '{}') as origen,
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
    and (cardinality(f.origen) = 0 or c.source = any (f.origen))
    and (f.conversacion_dias is null or c.last_inbound_at >= now() - make_interval(days => f.conversacion_dias))
    and (f.pedido_sin_pagar_dias is null or exists (
           select 1 from public.orders o
           where o.customer_id = c.id and o.paid_at is null
             and o.created_at >= now() - make_interval(days => f.pedido_sin_pagar_dias)
             and not exists (
               select 1 from public.orders later
               where later.customer_id = c.id and later.paid_at is not null and later.created_at > o.created_at
             )
         ))
    and (f.excluir_campana_dias is null or not exists (
           select 1 from public.campaign_recipients r
           where r.customer_id = c.id and r.sent_at >= now() - make_interval(days => f.excluir_campana_dias)
         ))
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

-- Inicia una campaña: fija la lista de destinatarios (siempre con consentimiento vigente) y la
-- deja lista para enviar por tandas. Es atómica: dos clics seguidos no duplican destinatarios.
create function public.start_campaign(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns;
  v_template public.message_templates;
  v_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (select public.is_admin()) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'La campaña no existe.' using errcode = 'P0002';
  end if;
  if v_campaign.status <> 'draft' then
    raise exception 'La campaña ya fue enviada o cancelada.' using errcode = '22023';
  end if;

  select * into v_template from public.message_templates where id = v_campaign.template_id;
  if v_template.kind <> 'campaign' or v_template.wa_status <> 'approved' then
    raise exception 'La plantilla todavía no está aprobada por WhatsApp.' using errcode = '22023';
  end if;

  insert into public.campaign_recipients (campaign_id, customer_id, phone)
  select v_campaign.id, c.id, c.phone
  from public.crm_segment(v_campaign.filters || '{"solo_contactables": true}'::jsonb) as segment(id)
  join public.customers c on c.id = segment.id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Ningún cliente con consentimiento cumple los filtros.' using errcode = '22023';
  end if;

  update public.campaigns
  set status = 'sending', recipients_count = v_count, started_at = now(),
      filters = v_campaign.filters || '{"solo_contactables": true}'::jsonb
  where id = v_campaign.id;
  return v_count;
end;
$$;

revoke execute on function public.start_campaign(uuid) from public, anon;
grant execute on function public.start_campaign(uuid) to authenticated, service_role;
