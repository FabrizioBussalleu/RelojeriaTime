-- Time: marcas y categorías sin relojes se eliminan solas.
-- Al eliminar un producto (o cambiarle la marca o la categoría), la marca o categoría que queda sin
-- ningún producto se borra, así desaparece de la selección rápida del panel (una marca discontinuada,
-- los datos de demostración). Agotar o archivar no la toca: el producto sigue existiendo.

create function public.remove_unused_taxonomy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.brand_id is not null and (tg_op = 'DELETE' or new.brand_id is distinct from old.brand_id) then
    delete from public.brands b
    where b.id = old.brand_id and not exists (select 1 from public.products p where p.brand_id = old.brand_id);
  end if;
  if old.category_id is not null and (tg_op = 'DELETE' or new.category_id is distinct from old.category_id) then
    delete from public.categories c
    where c.id = old.category_id and not exists (select 1 from public.products p where p.category_id = old.category_id);
  end if;
  return null;
end;
$$;

-- Solo la usa el trigger: no se expone como RPC.
revoke execute on function public.remove_unused_taxonomy() from public, anon, authenticated;

create trigger products_remove_unused_taxonomy
after delete or update of brand_id, category_id on public.products
for each row execute function public.remove_unused_taxonomy();
