drop function if exists public.delete_stock_movement(uuid,text);

create function public.delete_stock_movement(
  p_movement_id uuid,
  p_reason text,
  p_preserve_stock boolean
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_movement public.stock_movements%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_previous public.stock_movements%rowtype;
  v_new_stock numeric;
  v_stock_preserved boolean:=false;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Le motif de suppression est obligatoire'; end if;
  select * into v_movement from public.stock_movements where id=p_movement_id for update;
  if not found then raise exception 'Mouvement introuvable'; end if;
  if v_movement.movement_type in ('production_use','inventory') then raise exception 'Ce mouvement doit être corrigé depuis sa production ou son inventaire'; end if;
  select * into v_ingredient from public.ingredients where id=v_movement.ingredient_id for update;
  if not found then raise exception 'Article introuvable'; end if;

  v_new_stock:=round(coalesce(v_ingredient.stock_qty,0)-v_movement.qty,3);
  if v_new_stock<0 then
    if v_movement.movement_type='entry' and coalesce(p_preserve_stock,false) then
      v_new_stock:=coalesce(v_ingredient.stock_qty,0);
      v_stock_preserved:=true;
    else
      raise exception 'Suppression impossible : une partie de cette entrée a déjà été consommée';
    end if;
  end if;

  if not v_stock_preserved then
    update public.ingredients set stock_qty=v_new_stock,updated_at=now() where id=v_ingredient.id;
  end if;
  if v_movement.finance_entry_id is not null then
    update public.finance_entries set deleted_at=now(),updated_at=now(),notes=concat_ws(' · ',notes,'Réception supprimée : '||trim(p_reason)) where id=v_movement.finance_entry_id;
  end if;
  if v_movement.purchase_plan_item_id is not null then
    update public.purchase_plan_items set
      received_qty=greatest(0,received_qty-v_movement.qty),
      actual_cost=greatest(0,actual_cost-coalesce(v_movement.purchase_total,0))
    where id=v_movement.purchase_plan_item_id;
    update public.purchase_plans p set status=case
      when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then 'received'
      when exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty>0) then 'partially_received' else 'ordered' end,
      received_at=case when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then coalesce(p.received_at,now()) else null end,
      updated_at=now() where p.id=v_movement.purchase_plan_id;
  end if;
  insert into public.stock_movement_corrections(movement_id,ingredient_id,action,before_data,after_data,reason)
  values(v_movement.id,v_movement.ingredient_id,'delete',to_jsonb(v_movement),
    case when v_stock_preserved then jsonb_build_object('stock_preserved',true,'stock_qty',v_new_stock) else null end,
    trim(p_reason));
  delete from public.stock_movements where id=p_movement_id;
  if v_movement.movement_type='entry' and not exists(select 1 from public.stock_movements where ingredient_id=v_movement.ingredient_id and movement_type='entry' and created_at>v_movement.created_at) then
    select * into v_previous from public.stock_movements where ingredient_id=v_movement.ingredient_id and movement_type='entry' order by created_at desc limit 1;
    if found and coalesce(v_previous.purchase_format_qty,0)>0 then
      update public.ingredients set purchase_format_name=v_previous.purchase_format_name,purchase_format_qty=v_previous.purchase_format_qty,
        purchase_format_price=v_previous.purchase_format_price,price_per_unit=round(v_previous.purchase_format_price/v_previous.purchase_format_qty,8),updated_at=now()
      where id=v_movement.ingredient_id;
    end if;
  end if;
  return jsonb_build_object('movement_id',p_movement_id,'new_stock',v_new_stock,'deleted',true,'stock_preserved',v_stock_preserved);
end $$;

revoke all on function public.delete_stock_movement(uuid,text,boolean) from public,anon;
grant execute on function public.delete_stock_movement(uuid,text,boolean) to authenticated;
