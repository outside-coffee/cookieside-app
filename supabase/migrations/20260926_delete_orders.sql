drop policy if exists orders_authenticated_delete on public.orders;
create policy orders_authenticated_delete on public.orders for delete to authenticated using (true);

drop policy if exists sales_authenticated_delete_order_lines on public.sales;
create policy sales_authenticated_delete_order_lines on public.sales for delete to authenticated using (true);

grant delete on public.orders, public.sales to authenticated;

create or replace function public.delete_order(p_order_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  delete from public.sales where order_id = p_order_id;
  delete from public.orders where id = p_order_id;
end;
$$;

revoke all on function public.delete_order(uuid) from public, anon;
grant execute on function public.delete_order(uuid) to authenticated;
