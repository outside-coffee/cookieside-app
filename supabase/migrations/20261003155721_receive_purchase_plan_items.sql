create or replace function public.receive_stock_purchase(
  p_ingredient_id uuid, p_format_name text, p_format_qty numeric, p_format_price numeric, p_format_count numeric,
  p_supplier text default null, p_received_at date default current_date, p_payment_status text default 'paid',
  p_notes text default null, p_purchase_plan_item_id uuid default null, p_supplier_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_ingredient public.ingredients%rowtype; v_received_qty numeric; v_total numeric; v_new_stock numeric;
  v_category text; v_finance_id uuid; v_movement_id uuid; v_item public.purchase_plan_items%rowtype; v_plan_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_format_name),'')='' or p_format_qty<=0 or p_format_price<=0 or p_format_count<=0 then raise exception 'Format, contenu, prix et nombre reçus invalides'; end if;
  if p_payment_status not in ('paid','due') then raise exception 'Statut de paiement invalide'; end if;
  select * into v_ingredient from public.ingredients where id=p_ingredient_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  if p_purchase_plan_item_id is not null then
    select pi.* into v_item from public.purchase_plan_items pi join public.purchase_plans p on p.id=pi.purchase_plan_id
    where pi.id=p_purchase_plan_item_id and pi.ingredient_id=p_ingredient_id and p.user_id=(select auth.uid()) and p.status in ('ordered','partially_received') for update of pi;
    if not found then raise exception 'Ligne d’achat introuvable ou non réceptionnable'; end if;
    v_plan_id:=v_item.purchase_plan_id;
  end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.user_id=(select auth.uid())) then raise exception 'Fournisseur invalide'; end if;
  v_received_qty:=round(p_format_qty*p_format_count,3); v_total:=round(p_format_price*p_format_count,3);
  v_new_stock:=round(coalesce(v_ingredient.stock_qty,0)+v_received_qty,3);
  v_category:=case when v_ingredient.item_type='consumable' and v_ingredient.consumable_category='cleaning' then 'Consommables · Hygiène et nettoyage'
    when v_ingredient.item_type='consumable' and v_ingredient.consumable_category='production' then 'Consommables · Production'
    when v_ingredient.item_type='consumable' and v_ingredient.consumable_category='packaging' then 'Consommables · Emballages'
    when v_ingredient.item_type='consumable' then 'Consommables · Bureau et divers' else 'Achats matières' end;
  update public.ingredients set stock_qty=v_new_stock,purchase_format_name=trim(p_format_name),purchase_format_qty=p_format_qty,
    purchase_format_price=p_format_price,price_per_unit=round(p_format_price/p_format_qty,8),updated_at=now() where id=p_ingredient_id;
  insert into public.finance_entries(user_id,entry_type,category,label,amount,entry_date,supplier,supplier_id,notes,payment_status,paid_at)
  values((select auth.uid()),'expense',v_category,'Achat '||v_ingredient.name,v_total,p_received_at,nullif(trim(p_supplier),''),p_supplier_id,p_notes,p_payment_status,
    case when p_payment_status='paid' then p_received_at else null end) returning id into v_finance_id;
  insert into public.stock_movements(ingredient_id,ingredient_name,movement_type,qty,notes,created_at,purchase_format_name,purchase_format_qty,
    purchase_format_price,purchase_format_count,purchase_total,supplier,supplier_id,finance_entry_id,purchase_plan_id,purchase_plan_item_id)
  values(p_ingredient_id,v_ingredient.name,'entry',v_received_qty,p_notes,p_received_at::timestamp+interval '12 hours',trim(p_format_name),p_format_qty,
    p_format_price,p_format_count,v_total,nullif(trim(p_supplier),''),p_supplier_id,v_finance_id,v_plan_id,p_purchase_plan_item_id) returning id into v_movement_id;
  if p_purchase_plan_item_id is not null then
    update public.purchase_plan_items set received_qty=received_qty+v_received_qty,actual_cost=actual_cost+v_total where id=p_purchase_plan_item_id;
    update public.purchase_plans p set status=case
      when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then 'received' else 'partially_received' end,
      received_at=case when not exists(select 1 from public.purchase_plan_items pi where pi.purchase_plan_id=p.id and pi.received_qty<pi.planned_qty) then now() else null end,
      updated_at=now() where p.id=v_plan_id;
  end if;
  return jsonb_build_object('new_stock',v_new_stock,'received_qty',v_received_qty,'purchase_total',v_total,
    'finance_entry_id',v_finance_id,'movement_id',v_movement_id,'purchase_plan_id',v_plan_id);
end $$;
revoke all on function public.receive_stock_purchase(uuid,text,numeric,numeric,numeric,text,date,text,text,uuid,uuid) from public,anon;
grant execute on function public.receive_stock_purchase(uuid,text,numeric,numeric,numeric,text,date,text,text,uuid,uuid) to authenticated;
