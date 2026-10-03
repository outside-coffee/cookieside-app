create table public.b2b_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  contact_email text,
  contact_phone text,
  deliveries_per_month integer not null default 4 check(deliveries_per_month in (1,2,4)),
  delivery_weekday integer not null default 1 check(delivery_weekday between 1 and 7),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check(status in ('active','paused','archived')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date is null or end_date>=start_date)
);

create table public.b2b_subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.b2b_subscriptions(id) on delete cascade,
  variety_id uuid not null references public.varieties(id),
  variety_name text not null,
  monthly_qty integer not null check(monthly_qty>0),
  price_per_unit numeric not null check(price_per_unit>=0),
  unique(subscription_id,variety_id)
);

create table public.b2b_subscription_orders (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.b2b_subscriptions(id) on delete cascade,
  order_id uuid not null unique references public.orders(id),
  period_month date not null,
  delivery_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(subscription_id,delivery_date),
  check(period_month=date_trunc('month',period_month)::date)
);

create index b2b_subscriptions_status_idx on public.b2b_subscriptions(status,start_date);
create index b2b_subscription_items_subscription_idx on public.b2b_subscription_items(subscription_id);
create index b2b_subscription_orders_period_idx on public.b2b_subscription_orders(subscription_id,period_month);

alter table public.b2b_subscriptions enable row level security;
alter table public.b2b_subscription_items enable row level security;
alter table public.b2b_subscription_orders enable row level security;
revoke all on public.b2b_subscriptions,public.b2b_subscription_items,public.b2b_subscription_orders from anon,authenticated;
grant select,insert,update on public.b2b_subscriptions to authenticated;
grant select,insert,update,delete on public.b2b_subscription_items to authenticated;
grant select,insert on public.b2b_subscription_orders to authenticated;

create policy "Team manages B2B subscriptions" on public.b2b_subscriptions for all to authenticated
  using((select auth.uid()) is not null) with check((select auth.uid()) is not null);
create policy "Team manages B2B subscription items" on public.b2b_subscription_items for all to authenticated
  using((select auth.uid()) is not null) with check((select auth.uid()) is not null);
create policy "Team reads B2B subscription orders" on public.b2b_subscription_orders for select to authenticated
  using((select auth.uid()) is not null);
create policy "Team creates B2B subscription orders" on public.b2b_subscription_orders for insert to authenticated
  with check((select auth.uid()) is not null);

create or replace function public.generate_b2b_subscription_order(p_subscription_id uuid,p_delivery_date date)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_subscription public.b2b_subscriptions%rowtype; v_month date; v_generated integer; v_remaining_deliveries integer;
  v_item record; v_already integer; v_qty integer; v_items jsonb:='[]'::jsonb; v_order public.orders%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  select * into v_subscription from public.b2b_subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Forfait introuvable'; end if;
  if v_subscription.status<>'active' then raise exception 'Ce forfait n’est pas actif'; end if;
  if p_delivery_date<v_subscription.start_date or (v_subscription.end_date is not null and p_delivery_date>v_subscription.end_date) then raise exception 'Date hors période du forfait'; end if;
  v_month:=date_trunc('month',p_delivery_date)::date;
  select count(*) into v_generated from public.b2b_subscription_orders where subscription_id=p_subscription_id and period_month=v_month;
  if v_generated>=v_subscription.deliveries_per_month then raise exception 'Toutes les livraisons du mois ont déjà été générées'; end if;
  if exists(select 1 from public.b2b_subscription_orders where subscription_id=p_subscription_id and delivery_date=p_delivery_date) then raise exception 'Une commande existe déjà pour cette date'; end if;
  v_remaining_deliveries:=v_subscription.deliveries_per_month-v_generated;
  for v_item in select * from public.b2b_subscription_items where subscription_id=p_subscription_id order by variety_name loop
    select coalesce(sum(s.qty),0)::integer into v_already from public.b2b_subscription_orders so join public.sales s on s.order_id=so.order_id
      where so.subscription_id=p_subscription_id and so.period_month=v_month and s.variety_id=v_item.variety_id and s.status<>'Annulée';
    v_qty:=ceil(greatest(0,v_item.monthly_qty-v_already)::numeric/v_remaining_deliveries)::integer;
    if v_qty>0 then v_items:=v_items||jsonb_build_array(jsonb_build_object('variety_id',v_item.variety_id,'qty',v_qty,'price',v_item.price_per_unit)); end if;
  end loop;
  if jsonb_array_length(v_items)=0 then raise exception 'Le forfait mensuel est déjà entièrement consommé'; end if;
  select * into v_order from public.create_multi_product_order(v_subscription.client,'B2B',p_delivery_date,
    concat('Forfait mensuel B2B · ',to_char(v_month,'MM/YYYY'),case when v_subscription.notes is not null then ' · '||v_subscription.notes else '' end),v_items);
  insert into public.b2b_subscription_orders(subscription_id,order_id,period_month,delivery_date)
  values(p_subscription_id,v_order.id,v_month,p_delivery_date);
  return jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'total_amount',v_order.total_amount,'delivery_date',p_delivery_date);
end $$;

revoke all on function public.generate_b2b_subscription_order(uuid,date) from public,anon;
grant execute on function public.generate_b2b_subscription_order(uuid,date) to authenticated;
