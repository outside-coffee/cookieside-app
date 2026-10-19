-- Product formats support: L 100g default, M 60g test.
-- This migration is idempotent and matches the production database migration already applied.

create table if not exists public.product_formats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  weight_g integer not null check (weight_g > 0),
  cost_factor numeric(8,4) not null check (cost_factor > 0),
  status text not null default 'active' check (status in ('active','test','inactive')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.product_formats(code,name,weight_g,cost_factor,status,is_default)
values ('L','L — 100 g',100,1.0000,'active',true),
       ('M','M — 60 g',60,0.6000,'test',false)
on conflict (code) do update set
  name=excluded.name, weight_g=excluded.weight_g, cost_factor=excluded.cost_factor,
  status=excluded.status, is_default=excluded.is_default, updated_at=now();

create or replace function public.default_product_format_id()
returns uuid language sql stable set search_path=public,pg_temp as $$
  select id from public.product_formats where is_default=true order by created_at limit 1
$$;

alter table public.sales add column if not exists format_id uuid references public.product_formats(id);
alter table public.production add column if not exists format_id uuid references public.product_formats(id);
alter table public.sale_prices add column if not exists format_id uuid references public.product_formats(id);
alter table public.sale_price_history add column if not exists format_id uuid references public.product_formats(id);
alter table public.b2b_subscription_items add column if not exists format_id uuid references public.product_formats(id);

update public.sales set format_id=public.default_product_format_id() where format_id is null;
update public.production set format_id=public.default_product_format_id() where format_id is null;
update public.sale_prices set format_id=public.default_product_format_id() where format_id is null;
update public.sale_price_history set format_id=public.default_product_format_id() where format_id is null;
update public.b2b_subscription_items set format_id=public.default_product_format_id() where format_id is null;

alter table public.sales alter column format_id set default public.default_product_format_id();
alter table public.production alter column format_id set default public.default_product_format_id();
alter table public.sale_prices alter column format_id set default public.default_product_format_id();
alter table public.sale_price_history alter column format_id set default public.default_product_format_id();
alter table public.b2b_subscription_items alter column format_id set default public.default_product_format_id();

alter table public.sales alter column format_id set not null;
alter table public.production alter column format_id set not null;
alter table public.sale_prices alter column format_id set not null;
alter table public.sale_price_history alter column format_id set not null;
alter table public.b2b_subscription_items alter column format_id set not null;

alter table public.sale_prices drop constraint if exists sale_prices_variety_id_canal_key;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='sale_prices_variety_format_canal_key') then
    alter table public.sale_prices add constraint sale_prices_variety_format_canal_key unique(variety_id,format_id,canal);
  end if;
end $$;

alter table public.b2b_subscription_items drop constraint if exists b2b_subscription_items_subscription_id_variety_id_key;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='b2b_subscription_items_subscription_variety_format_key') then
    alter table public.b2b_subscription_items add constraint b2b_subscription_items_subscription_variety_format_key unique(subscription_id,variety_id,format_id);
  end if;
end $$;

create or replace function public.track_sale_price_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' or old.price is distinct from new.price then
    insert into public.sale_price_history(variety_id,format_id,canal,price,changed_by,changed_at)
    values(new.variety_id,new.format_id,new.canal,new.price,auth.uid(),coalesce(new.updated_at,now()));
  end if;
  return new;
end $$;

create or replace function public.create_production_batch(
  p_variety_id uuid, p_format_id uuid, p_qty integer, p_produced_at date, p_notes text default null
) returns public.production
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_product public.varieties%rowtype;
  v_format public.product_formats%rowtype;
  v_row record;
  v_production public.production%rowtype;
  v_cost numeric := 0;
  v_count integer := 0;
  v_needed numeric;
begin
  if p_qty is null or p_qty<=0 then raise exception 'La quantité doit être positive'; end if;
  select * into v_format from public.product_formats where id=p_format_id and status<>'inactive';
  if not found then raise exception 'Format introuvable ou inactif'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_variety_id::text||':'||p_format_id::text,0));
  select * into v_product from public.varieties where id=p_variety_id and active=true;
  if not found then raise exception 'Produit introuvable ou inactif'; end if;

  for v_row in
    select r.qty_per_cookie,i.id,i.name,i.stock_qty,i.price_per_unit
    from public.recipes r join public.ingredients i on i.id=r.ingredient_id
    where r.variety_id=p_variety_id order by i.id for update of i
  loop
    v_count:=v_count+1;
    v_needed:=v_row.qty_per_cookie*v_format.cost_factor*p_qty;
    if v_row.qty_per_cookie<=0 or coalesce(v_row.stock_qty,0)<v_needed then
      raise exception 'Stock insuffisant ou recette invalide : %',v_row.name;
    end if;
    v_cost:=v_cost+(v_row.qty_per_cookie*v_format.cost_factor*coalesce(v_row.price_per_unit,0));
  end loop;
  if v_count=0 then raise exception 'La recette doit contenir au moins un ingrédient'; end if;

  insert into public.production(variety_id,format_id,variety_name,qty,cost_per_cookie,total_cost,notes,produced_at)
  values(p_variety_id,p_format_id,v_product.name,p_qty,round(v_cost,4),round(v_cost*p_qty,3),p_notes,p_produced_at)
  returning * into v_production;

  for v_row in
    select r.qty_per_cookie,i.id,i.name
    from public.recipes r join public.ingredients i on i.id=r.ingredient_id
    where r.variety_id=p_variety_id order by i.id
  loop
    v_needed:=v_row.qty_per_cookie*v_format.cost_factor*p_qty;
    update public.ingredients set stock_qty=stock_qty-v_needed where id=v_row.id;
    insert into public.stock_movements(ingredient_id,ingredient_name,movement_type,qty,reference_id,notes)
    values(v_row.id,v_row.name,'production_use',-v_needed,v_production.id,
      'Production : '||v_product.name||' '||v_format.code||' '||v_format.weight_g||'g ×'||p_qty);
  end loop;
  return v_production;
end $$;

create or replace function public.delete_production_batch(p_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_production public.production%rowtype;
  v_remaining integer;
  v_movement record;
begin
  select * into v_production from public.production where id=p_id;
  if not found then raise exception 'Lot introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_production.variety_id::text||':'||v_production.format_id::text,0));
  select * into v_production from public.production where id=p_id for update;
  select coalesce((select sum(qty) from public.production where variety_id=v_production.variety_id and format_id=v_production.format_id),0)
       - coalesce((select sum(qty) from public.sales where variety_id=v_production.variety_id and format_id=v_production.format_id and status<>'Annulée'),0)
    into v_remaining;
  if v_remaining<v_production.qty then raise exception 'Impossible de supprimer un lot dont les unités sont déjà vendues'; end if;
  for v_movement in select ingredient_id,qty from public.stock_movements
    where reference_id=p_id and movement_type='production_use' for update
  loop
    update public.ingredients set stock_qty=stock_qty-v_movement.qty where id=v_movement.ingredient_id;
  end loop;
  delete from public.stock_movements where reference_id=p_id and movement_type='production_use';
  delete from public.production where id=p_id;
end $$;

create or replace function public.create_multi_product_order(
  p_client text,p_canal text,p_delivery_date date,p_notes text,p_items jsonb
) returns public.orders
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_order public.orders%rowtype; v_item jsonb; v_product public.varieties%rowtype; v_format public.product_formats%rowtype;
  v_qty integer; v_price numeric; v_cost numeric; v_total numeric:=0; v_margin numeric:=0;
begin
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit'; end if;
  insert into public.orders(client,canal,delivery_date,notes) values(p_client,p_canal,p_delivery_date,p_notes) returning * into v_order;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'qty')::integer; v_price:=(v_item->>'price')::numeric;
    select * into v_product from public.varieties where id=(v_item->>'variety_id')::uuid and active=true;
    select * into v_format from public.product_formats where id=coalesce(nullif(v_item->>'format_id','')::uuid,public.default_product_format_id()) and status<>'inactive';
    if not found or v_qty<=0 or v_price<0 then raise exception 'Ligne de commande invalide'; end if;
    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0)*v_format.cost_factor into v_cost
      from public.recipes r join public.ingredients i on i.id=r.ingredient_id where r.variety_id=v_product.id;
    insert into public.sales(order_id,variety_id,format_id,variety_name,qty,price_per_unit,total_amount,margin,margin_pct,client,canal,status,sold_at)
    values(v_order.id,v_product.id,v_format.id,v_product.name,v_qty,v_price,round(v_qty*v_price,3),round(v_qty*(v_price-v_cost),3),
      case when v_price>0 then round((v_price-v_cost)/v_price*100,1) else 0 end,p_client,p_canal,'Vendu',p_delivery_date);
    v_total:=v_total+v_qty*v_price; v_margin:=v_margin+v_qty*(v_price-v_cost);
  end loop;
  update public.orders set total_amount=round(v_total,3),margin=round(v_margin,3) where id=v_order.id returning * into v_order;
  return v_order;
end $$;

create or replace function public.update_multi_product_order(
  p_order_id uuid,p_client text,p_canal text,p_delivery_date date,p_notes text,p_items jsonb
) returns public.orders
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_order public.orders%rowtype; v_item jsonb; v_product public.varieties%rowtype; v_format public.product_formats%rowtype;
  v_qty integer; v_price numeric; v_cost numeric; v_total numeric:=0; v_margin numeric:=0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.status not in ('Vendu','Prête') then raise exception 'Seules les commandes à préparer ou prêtes peuvent être modifiées'; end if;
  if p_delivery_date is null then raise exception 'La date de livraison est obligatoire'; end if;
  if p_canal is not null and p_canal not in ('B2B','B2C') then raise exception 'Canal invalide'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit'; end if;
  delete from public.sales where order_id=p_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'qty')::integer; v_price:=(v_item->>'price')::numeric;
    select * into v_product from public.varieties where id=(v_item->>'variety_id')::uuid and active=true;
    select * into v_format from public.product_formats where id=coalesce(nullif(v_item->>'format_id','')::uuid,public.default_product_format_id()) and status<>'inactive';
    if not found or v_qty<=0 or v_price<0 then raise exception 'Ligne de commande invalide'; end if;
    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0)*v_format.cost_factor into v_cost
      from public.recipes r join public.ingredients i on i.id=r.ingredient_id where r.variety_id=v_product.id;
    insert into public.sales(order_id,variety_id,format_id,variety_name,qty,price_per_unit,total_amount,margin,margin_pct,client,canal,status,sold_at)
    values(p_order_id,v_product.id,v_format.id,v_product.name,v_qty,v_price,round(v_qty*v_price,3),round(v_qty*(v_price-v_cost),3),
      case when v_price>0 then round((v_price-v_cost)/v_price*100,1) else 0 end,
      nullif(btrim(p_client),''),p_canal,v_order.status,p_delivery_date);
    v_total:=v_total+v_qty*v_price; v_margin:=v_margin+v_qty*(v_price-v_cost);
  end loop;
  update public.orders set client=nullif(btrim(p_client),''),canal=p_canal,delivery_date=p_delivery_date,
    notes=nullif(btrim(p_notes),''),total_amount=round(v_total,3),margin=round(v_margin,3)
  where id=p_order_id returning * into v_order;
  return v_order;
end $$;

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
    select coalesce(sum(s.qty),0)::integer into v_already
      from public.b2b_subscription_orders so join public.sales s on s.order_id=so.order_id
      where so.subscription_id=p_subscription_id and so.period_month=v_month
        and s.variety_id=v_item.variety_id and s.format_id=v_item.format_id and s.status<>'Annulée';
    v_qty:=ceil(greatest(0,v_item.monthly_qty-v_already)::numeric/v_remaining_deliveries)::integer;
    if v_qty>0 then
      v_items:=v_items||jsonb_build_array(jsonb_build_object('variety_id',v_item.variety_id,'format_id',v_item.format_id,'qty',v_qty,'price',v_item.price_per_unit));
    end if;
  end loop;
  if jsonb_array_length(v_items)=0 then raise exception 'Le forfait mensuel est déjà entièrement consommé'; end if;
  select * into v_order from public.create_multi_product_order(v_subscription.client,'B2B',p_delivery_date,
    concat('Forfait mensuel B2B · ',to_char(v_month,'MM/YYYY'),case when v_subscription.notes is not null then ' · '||v_subscription.notes else '' end),v_items);
  insert into public.b2b_subscription_orders(subscription_id,order_id,period_month,delivery_date)
  values(p_subscription_id,v_order.id,v_month,p_delivery_date);
  return jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'total_amount',v_order.total_amount,'delivery_date',p_delivery_date);
end $$;

revoke all on function public.create_production_batch(uuid,uuid,integer,date,text) from public,anon;
grant execute on function public.create_production_batch(uuid,uuid,integer,date,text) to authenticated;


-- Align reference-data security with the rest of Inside.
alter table public.product_formats enable row level security;
drop policy if exists auth_all on public.product_formats;
create policy auth_all on public.product_formats
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Validate product and format independently when creating/updating orders.
create or replace function public.create_multi_product_order(
  p_client text,p_canal text,p_delivery_date date,p_notes text,p_items jsonb
) returns public.orders
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_order public.orders%rowtype; v_item jsonb; v_product public.varieties%rowtype; v_format public.product_formats%rowtype;
  v_qty integer; v_price numeric; v_cost numeric; v_total numeric:=0; v_margin numeric:=0;
begin
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit'; end if;
  insert into public.orders(client,canal,delivery_date,notes) values(p_client,p_canal,p_delivery_date,p_notes) returning * into v_order;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'qty')::integer; v_price:=(v_item->>'price')::numeric;
    select * into v_product from public.varieties where id=(v_item->>'variety_id')::uuid and active=true;
    if not found then raise exception 'Produit introuvable ou inactif'; end if;
    select * into v_format from public.product_formats where id=coalesce(nullif(v_item->>'format_id','')::uuid,public.default_product_format_id()) and status<>'inactive';
    if not found then raise exception 'Format introuvable ou inactif'; end if;
    if v_qty<=0 or v_price<0 then raise exception 'Ligne de commande invalide'; end if;
    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0)*v_format.cost_factor into v_cost
      from public.recipes r join public.ingredients i on i.id=r.ingredient_id where r.variety_id=v_product.id;
    insert into public.sales(order_id,variety_id,format_id,variety_name,qty,price_per_unit,total_amount,margin,margin_pct,client,canal,status,sold_at)
    values(v_order.id,v_product.id,v_format.id,v_product.name,v_qty,v_price,round(v_qty*v_price,3),round(v_qty*(v_price-v_cost),3),
      case when v_price>0 then round((v_price-v_cost)/v_price*100,1) else 0 end,p_client,p_canal,'Vendu',p_delivery_date);
    v_total:=v_total+v_qty*v_price; v_margin:=v_margin+v_qty*(v_price-v_cost);
  end loop;
  update public.orders set total_amount=round(v_total,3),margin=round(v_margin,3) where id=v_order.id returning * into v_order;
  return v_order;
end $$;

create or replace function public.update_multi_product_order(
  p_order_id uuid,p_client text,p_canal text,p_delivery_date date,p_notes text,p_items jsonb
) returns public.orders
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_order public.orders%rowtype; v_item jsonb; v_product public.varieties%rowtype; v_format public.product_formats%rowtype;
  v_qty integer; v_price numeric; v_cost numeric; v_total numeric:=0; v_margin numeric:=0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.status not in ('Vendu','Prête') then raise exception 'Seules les commandes à préparer ou prêtes peuvent être modifiées'; end if;
  if p_delivery_date is null then raise exception 'La date de livraison est obligatoire'; end if;
  if p_canal is not null and p_canal not in ('B2B','B2C') then raise exception 'Canal invalide'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit'; end if;
  delete from public.sales where order_id=p_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'qty')::integer; v_price:=(v_item->>'price')::numeric;
    select * into v_product from public.varieties where id=(v_item->>'variety_id')::uuid and active=true;
    if not found then raise exception 'Produit introuvable ou inactif'; end if;
    select * into v_format from public.product_formats where id=coalesce(nullif(v_item->>'format_id','')::uuid,public.default_product_format_id()) and status<>'inactive';
    if not found then raise exception 'Format introuvable ou inactif'; end if;
    if v_qty<=0 or v_price<0 then raise exception 'Ligne de commande invalide'; end if;
    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0)*v_format.cost_factor into v_cost
      from public.recipes r join public.ingredients i on i.id=r.ingredient_id where r.variety_id=v_product.id;
    insert into public.sales(order_id,variety_id,format_id,variety_name,qty,price_per_unit,total_amount,margin,margin_pct,client,canal,status,sold_at)
    values(p_order_id,v_product.id,v_format.id,v_product.name,v_qty,v_price,round(v_qty*v_price,3),round(v_qty*(v_price-v_cost),3),
      case when v_price>0 then round((v_price-v_cost)/v_price*100,1) else 0 end,
      nullif(btrim(p_client),''),p_canal,v_order.status,p_delivery_date);
    v_total:=v_total+v_qty*v_price; v_margin:=v_margin+v_qty*(v_price-v_cost);
  end loop;
  update public.orders set client=nullif(btrim(p_client),''),canal=p_canal,delivery_date=p_delivery_date,
    notes=nullif(btrim(p_notes),''),total_amount=round(v_total,3),margin=round(v_margin,3)
  where id=p_order_id returning * into v_order;
  return v_order;
end $$;
