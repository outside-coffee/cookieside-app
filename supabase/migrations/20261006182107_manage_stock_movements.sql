create table public.stock_movement_corrections (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  action text not null check(action in ('update','delete')),
  before_data jsonb not null,
  after_data jsonb,
  reason text not null,
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);

create index stock_movement_corrections_movement_idx on public.stock_movement_corrections(movement_id,changed_at desc);
alter table public.stock_movement_corrections enable row level security;
revoke all on public.stock_movement_corrections from anon,authenticated;
grant select,insert on public.stock_movement_corrections to authenticated;
create policy "Team reads stock movement corrections" on public.stock_movement_corrections for select to authenticated using((select auth.uid()) is not null);
create policy "Team records stock movement corrections" on public.stock_movement_corrections for insert to authenticated with check(changed_by=(select auth.uid()));

create or replace function public.update_stock_movement(
  p_movement_id uuid,p_qty numeric,p_movement_date date,p_notes text,p_purchase_total numeric,p_reason text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_movement public.stock_movements%rowtype; v_ingredient public.ingredients%rowtype;
  v_new_stock numeric; v_qty_delta numeric; v_cost_delta numeric:=0; v_new_count numeric; v_new_format_price numeric;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Le motif de correction est obligatoire'; end if;
  select * into v_movement from public.stock_movements where id=p_movement_id for update;
  if not found then raise exception 'Mouvement introuvable'; end if;
  if v_movement.movement_type in ('production_use','inventory') then raise exception 'Ce mouvement doit être corrigé depuis sa production ou son inventaire'; end if;
  if v_movement.movement_type='entry' and p_qty<=0 then raise exception 'Une entrée doit avoir une quantité positive'; end if;
  if v_movement.movement_type='loss' and p_qty>=0 then raise exception 'Une perte doit avoir une quantité négative'; end if;
  if p_qty=0 then raise exception 'La quantité ne peut pas être nulle'; end if;
  select * into v_ingredient from public.ingredients where id=v_movement.ingredient_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  v_qty_delta:=round(p_qty-v_movement.qty,3);
  v_new_stock:=round(coalesce(v_ingredient.stock_qty,0)+v_qty_delta,3);
  if v_new_stock<0 then raise exception 'Correction impossible : le stock deviendrait négatif'; end if;
  if v_movement.movement_type='entry' then
    if coalesce(p_purchase_total,0)<=0 then raise exception 'Le coût total de la réception doit être positif'; end if;
    v_cost_delta:=round(p_purchase_total-coalesce(v_movement.purchase_total,0),3);
    if coalesce(v_movement.purchase_format_qty,0)>0 then
      v_new_count:=round(p_qty/v_movement.purchase_format_qty,3);
      v_new_format_price:=round(p_purchase_total/v_new_count,3);
    end if;
  end if;
  update public.ingredients set stock_qty=v_new_stock,updated_at=now() where id=v_ingredient.id;
  if v_movement.finance_entry_id is not null then
    update public.finance_entries set amount=p_purchase_total,entry_date=p_movement_date,notes=nullif(trim(p_notes),''),updated_at=now() where id=v_movement.finance_entry_id;
  end if;
  if v_movement.purchase_plan_item_id is not null then
    if exists(select 1 from public.purchase_plan_items where id=v_movement.purchase_plan_item_id and (received_qty+v_qty_delta<0 or actual_cost+v_cost_delta<0)) then
      raise exception 'Correction incohérente avec le plan d’achat';
    end if;
    update public.purchase_plan_items set received_qty=received_qty+v_qty_delta,actual_cost=actual_cost+v_cost_delta where id=v_movement.purchase_plan_item_id;
    update public.purchase_plans p set status=case
      when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then 'received'
      when exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty>0) then 'partially_received' else 'ordered' end,
      received_at=case when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then coalesce(p.received_at,now()) else null end,
      updated_at=now() where p.id=v_movement.purchase_plan_id;
  end if;
  update public.stock_movements set qty=round(p_qty,3),notes=nullif(trim(p_notes),''),created_at=p_movement_date::timestamp+interval '12 hours',
    purchase_total=case when movement_type='entry' then p_purchase_total else purchase_total end,
    purchase_format_count=case when movement_type='entry' and v_new_count is not null then v_new_count else purchase_format_count end,
    purchase_format_price=case when movement_type='entry' and v_new_format_price is not null then v_new_format_price else purchase_format_price end
    where id=p_movement_id;
  if v_movement.movement_type='entry' and v_new_format_price is not null and not exists(
    select 1 from public.stock_movements sm where sm.ingredient_id=v_movement.ingredient_id and sm.movement_type='entry' and sm.id<>p_movement_id and sm.created_at>p_movement_date::timestamp+interval '12 hours'
  ) then
    update public.ingredients set purchase_format_name=v_movement.purchase_format_name,purchase_format_qty=v_movement.purchase_format_qty,
      purchase_format_price=v_new_format_price,price_per_unit=round(v_new_format_price/v_movement.purchase_format_qty,8),updated_at=now() where id=v_movement.ingredient_id;
  end if;
  insert into public.stock_movement_corrections(movement_id,ingredient_id,action,before_data,after_data,reason)
  select p_movement_id,v_movement.ingredient_id,'update',to_jsonb(v_movement),to_jsonb(sm),trim(p_reason) from public.stock_movements sm where sm.id=p_movement_id;
  return jsonb_build_object('movement_id',p_movement_id,'new_stock',v_new_stock,'qty_delta',v_qty_delta);
end $$;

create or replace function public.delete_stock_movement(p_movement_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_movement public.stock_movements%rowtype; v_ingredient public.ingredients%rowtype; v_previous public.stock_movements%rowtype;
  v_new_stock numeric;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Le motif de suppression est obligatoire'; end if;
  select * into v_movement from public.stock_movements where id=p_movement_id for update;
  if not found then raise exception 'Mouvement introuvable'; end if;
  if v_movement.movement_type in ('production_use','inventory') then raise exception 'Ce mouvement doit être corrigé depuis sa production ou son inventaire'; end if;
  select * into v_ingredient from public.ingredients where id=v_movement.ingredient_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  v_new_stock:=round(coalesce(v_ingredient.stock_qty,0)-v_movement.qty,3);
  if v_new_stock<0 then raise exception 'Suppression impossible : une partie de cette entrée a déjà été consommée'; end if;
  update public.ingredients set stock_qty=v_new_stock,updated_at=now() where id=v_ingredient.id;
  if v_movement.finance_entry_id is not null then update public.finance_entries set deleted_at=now(),updated_at=now(),notes=concat_ws(' · ',notes,'Réception supprimée : '||trim(p_reason)) where id=v_movement.finance_entry_id; end if;
  if v_movement.purchase_plan_item_id is not null then
    if exists(select 1 from public.purchase_plan_items where id=v_movement.purchase_plan_item_id and (received_qty-v_movement.qty<0 or actual_cost-coalesce(v_movement.purchase_total,0)<0)) then raise exception 'Suppression incohérente avec le plan d’achat'; end if;
    update public.purchase_plan_items set received_qty=received_qty-v_movement.qty,actual_cost=actual_cost-coalesce(v_movement.purchase_total,0) where id=v_movement.purchase_plan_item_id;
    update public.purchase_plans p set status=case
      when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then 'received'
      when exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty>0) then 'partially_received' else 'ordered' end,
      received_at=case when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then coalesce(p.received_at,now()) else null end,
      updated_at=now() where p.id=v_movement.purchase_plan_id;
  end if;
  insert into public.stock_movement_corrections(movement_id,ingredient_id,action,before_data,after_data,reason)
  values(v_movement.id,v_movement.ingredient_id,'delete',to_jsonb(v_movement),null,trim(p_reason));
  delete from public.stock_movements where id=p_movement_id;
  if v_movement.movement_type='entry' and not exists(select 1 from public.stock_movements where ingredient_id=v_movement.ingredient_id and movement_type='entry' and created_at>v_movement.created_at) then
    select * into v_previous from public.stock_movements where ingredient_id=v_movement.ingredient_id and movement_type='entry' order by created_at desc limit 1;
    if found and coalesce(v_previous.purchase_format_qty,0)>0 then update public.ingredients set purchase_format_name=v_previous.purchase_format_name,purchase_format_qty=v_previous.purchase_format_qty,
      purchase_format_price=v_previous.purchase_format_price,price_per_unit=round(v_previous.purchase_format_price/v_previous.purchase_format_qty,8),updated_at=now() where id=v_movement.ingredient_id; end if;
  end if;
  return jsonb_build_object('movement_id',p_movement_id,'new_stock',v_new_stock,'deleted',true);
end $$;

revoke all on function public.update_stock_movement(uuid,numeric,date,text,numeric,text) from public,anon;
revoke all on function public.delete_stock_movement(uuid,text) from public,anon;
grant execute on function public.update_stock_movement(uuid,numeric,date,text,numeric,text) to authenticated;
grant execute on function public.delete_stock_movement(uuid,text) to authenticated;
