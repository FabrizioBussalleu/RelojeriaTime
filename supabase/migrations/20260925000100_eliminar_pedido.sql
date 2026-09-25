-- Time: eliminar un pedido desde el panel.
-- Cancelar deja el pedido a la vista en la lista; para los creados por error (pruebas, duplicados)
-- hace falta borrarlo de verdad. Los ítems y el historial caen por cascada, y el stock vuelve a la
-- tienda igual que al cancelar, salvo que el pedido ya estuviera cancelado (ahí ya había vuelto).

create function public.delete_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;

  if v_order.status <> 'cancelled' then
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

  delete from public.orders where id = p_order_id;
  return v_order.code;
end;
$$;

revoke execute on function public.delete_order(uuid) from public, anon;
grant execute on function public.delete_order(uuid) to authenticated;
