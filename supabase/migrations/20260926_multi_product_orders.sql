create table if not exists public.orders (
  id uuid primary key default extensions.uuid_generate_v4(),
  order_number bigint generated always as identity unique,
  client text,
  canal text check (canal is null or canal in ('B2B', 'B2C')),
  delivery_date date not null default current_date,
  notes text,
  status text not null default 'Vendu' check (status in ('Vendu', 'Livré', 'Payé')),
  total_amount numeric not null default 0,
  margin numeric not null default 0,
  delivered_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
drop policy if exists orders_authenticated_read on public.orders;
drop policy if exists orders_authenticated_insert on public.orders;
drop policy if exists orders_authenticated_update on public.orders;
create policy orders_authenticated_read on public.orders for select to authenticated using (true);
create policy orders_authenticated_insert on public.orders for insert to authenticated with check (true);
create policy orders_authenticated_update on public.orders for update to authenticated using (true) with check (true);
grant select, insert, update on public.orders to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.sales add column if not exists order_id uuid references public.orders(id);
create index if not exists sales_order_id_idx on public.sales(order_id);

do $$
declare v_sale public.sales%rowtype; v_order_id uuid;
begin
  for v_sale in select * from public.sales where order_id is null order by created_at loop
    insert into public.orders(client, canal, delivery_date, status, total_amount, margin, delivered_at, paid_at, created_at)
    values(v_sale.client, v_sale.canal, v_sale.sold_at, v_sale.status, coalesce(v_sale.total_amount,0), coalesce(v_sale.margin,0), v_sale.delivered_at, v_sale.paid_at, v_sale.created_at)
    returning id into v_order_id;
    update public.sales set order_id = v_order_id where id = v_sale.id;
  end loop;
end $$;

create or replace function public.create_multi_product_order(
  p_client text, p_canal text, p_delivery_date date, p_notes text, p_items jsonb
) returns public.orders
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.varieties%rowtype;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_total numeric := 0;
  v_margin numeric := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Ajoutez au moins un produit'; end if;
  insert into public.orders(client, canal, delivery_date, notes) values(p_client, p_canal, p_delivery_date, p_notes) returning * into v_order;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::integer;
    v_price := (v_item->>'price')::numeric;
    select * into v_product from public.varieties where id=(v_item->>'variety_id')::uuid and active=true;
    if not found or v_qty <= 0 or v_price < 0 then raise exception 'Ligne de commande invalide'; end if;
    select coalesce(sum(r.qty_per_cookie * i.price_per_unit),0) into v_cost
      from public.recipes r join public.ingredients i on i.id=r.ingredient_id where r.variety_id=v_product.id;
    insert into public.sales(order_id,variety_id,variety_name,qty,price_per_unit,total_amount,margin,margin_pct,client,canal,status,sold_at)
    values(v_order.id,v_product.id,v_product.name,v_qty,v_price,round(v_qty*v_price,3),round(v_qty*(v_price-v_cost),3),
      case when v_price>0 then round((v_price-v_cost)/v_price*100,1) else 0 end,p_client,p_canal,'Vendu',p_delivery_date);
    v_total := v_total + v_qty*v_price;
    v_margin := v_margin + v_qty*(v_price-v_cost);
  end loop;
  update public.orders set total_amount=round(v_total,3), margin=round(v_margin,3) where id=v_order.id returning * into v_order;
  return v_order;
end $$;

revoke all on function public.create_multi_product_order(text,text,date,text,jsonb) from public, anon;
grant execute on function public.create_multi_product_order(text,text,date,text,jsonb) to authenticated;

