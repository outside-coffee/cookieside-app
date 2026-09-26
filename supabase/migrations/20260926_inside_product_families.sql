-- Existing varieties remain cookies. A batch yield is expressed in sale units.
alter table public.varieties
  add column if not exists family text not null default 'Cookies',
  add column if not exists unit_label text not null default 'pièce',
  add column if not exists batch_yield integer not null default 28;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'varieties_batch_yield_positive') then
    alter table public.varieties add constraint varieties_batch_yield_positive check (batch_yield > 0);
  end if;
end $$;

comment on column public.recipes.qty_per_cookie is
  'Legacy column name: quantity of ingredient per unit sold, in the ingredient stock unit.';
comment on column public.production.cost_per_cookie is
  'Legacy column name: ingredient cost per unit sold, in TND.';

-- All ingredient deductions for a lot are committed together. The function
-- runs as the caller, so existing authenticated RLS policies still apply.
create or replace function public.create_production_batch(
  p_variety_id uuid, p_qty integer, p_produced_at date, p_notes text default null
) returns public.production
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_product public.varieties%rowtype;
  v_row record;
  v_production public.production%rowtype;
  v_cost numeric := 0;
  v_count integer := 0;
  v_needed numeric;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'La quantité doit être positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_variety_id::text, 0));
  select * into v_product from public.varieties where id = p_variety_id and active = true;
  if not found then raise exception 'Produit introuvable ou inactif'; end if;

  for v_row in
    select r.qty_per_cookie, i.id, i.name, i.stock_qty, i.price_per_unit
    from public.recipes r join public.ingredients i on i.id = r.ingredient_id
    where r.variety_id = p_variety_id order by i.id for update of i
  loop
    v_count := v_count + 1;
    v_needed := v_row.qty_per_cookie * p_qty;
    if v_row.qty_per_cookie <= 0 or coalesce(v_row.stock_qty, 0) < v_needed then
      raise exception 'Stock insuffisant ou recette invalide : %', v_row.name;
    end if;
    v_cost := v_cost + v_row.qty_per_cookie * coalesce(v_row.price_per_unit, 0);
  end loop;
  if v_count = 0 then raise exception 'La recette doit contenir au moins un ingrédient'; end if;

  insert into public.production(variety_id, variety_name, qty, cost_per_cookie, total_cost, notes, produced_at)
  values(p_variety_id, v_product.name, p_qty, round(v_cost, 4), round(v_cost * p_qty, 3), p_notes, p_produced_at)
  returning * into v_production;

  for v_row in
    select r.qty_per_cookie, i.id, i.name
    from public.recipes r join public.ingredients i on i.id = r.ingredient_id
    where r.variety_id = p_variety_id order by i.id
  loop
    v_needed := v_row.qty_per_cookie * p_qty;
    update public.ingredients set stock_qty = stock_qty - v_needed where id = v_row.id;
    insert into public.stock_movements(ingredient_id, ingredient_name, movement_type, qty, reference_id, notes)
    values(v_row.id, v_row.name, 'production_use', -v_needed, v_production.id,
           'Production : ' || v_product.name || ' ×' || p_qty);
  end loop;
  return v_production;
end $$;

create or replace function public.delete_production_batch(p_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_production public.production%rowtype;
  v_remaining integer;
  v_movement record;
begin
  select * into v_production from public.production where id = p_id;
  if not found then raise exception 'Lot introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_production.variety_id::text, 0));
  select * into v_production from public.production where id = p_id for update;
  select coalesce((select sum(qty) from public.production where variety_id = v_production.variety_id), 0)
       - coalesce((select sum(qty) from public.sales where variety_id = v_production.variety_id), 0)
    into v_remaining;
  if v_remaining < v_production.qty then
    raise exception 'Impossible de supprimer un lot dont les unités sont déjà vendues';
  end if;
  for v_movement in select ingredient_id, qty from public.stock_movements
      where reference_id = p_id and movement_type = 'production_use' for update
  loop
    update public.ingredients set stock_qty = stock_qty - v_movement.qty
    where id = v_movement.ingredient_id;
  end loop;
  delete from public.stock_movements where reference_id = p_id and movement_type = 'production_use';
  delete from public.production where id = p_id;
end $$;

revoke all on function public.create_production_batch(uuid, integer, date, text) from public, anon;
revoke all on function public.delete_production_batch(uuid) from public, anon;
grant execute on function public.create_production_batch(uuid, integer, date, text) to authenticated;
grant execute on function public.delete_production_batch(uuid) to authenticated;
