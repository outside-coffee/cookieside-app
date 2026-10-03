-- Inside operates as one shared organization. user_id remains the immutable
-- creator/audit field, while every authenticated teammate can use the records.

create or replace function public.preserve_creator_user_id()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if tg_op='INSERT' then new.user_id:=(select auth.uid());
  else new.user_id:=old.user_id;
  end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['finance_entries','purchase_plans','suppliers','inventory_sessions','attachments'] loop
    execute format('drop trigger if exists preserve_creator on public.%I',table_name);
    execute format('create trigger preserve_creator before insert or update on public.%I for each row execute function public.preserve_creator_user_id()',table_name);
  end loop;
end $$;

drop policy if exists "Users can read their finance entries" on public.finance_entries;
drop policy if exists "Users can create their finance entries" on public.finance_entries;
drop policy if exists "Users can update their finance entries" on public.finance_entries;
drop policy if exists "Users can delete their finance entries" on public.finance_entries;
create policy "Team reads finance entries" on public.finance_entries for select to authenticated using((select auth.uid()) is not null);
create policy "Team creates finance entries" on public.finance_entries for insert to authenticated with check((select auth.uid()) is not null);
create policy "Team updates finance entries" on public.finance_entries for update to authenticated using((select auth.uid()) is not null) with check((select auth.uid()) is not null);
create policy "Team deletes finance entries" on public.finance_entries for delete to authenticated using((select auth.uid()) is not null);

drop policy if exists "Users can read their purchase plans" on public.purchase_plans;
drop policy if exists "Users can create their purchase plans" on public.purchase_plans;
drop policy if exists "Users can update their purchase plans" on public.purchase_plans;
drop policy if exists "Users can delete their purchase plans" on public.purchase_plans;
create policy "Team reads purchase plans" on public.purchase_plans for select to authenticated using((select auth.uid()) is not null);
create policy "Team creates purchase plans" on public.purchase_plans for insert to authenticated with check((select auth.uid()) is not null);
create policy "Team updates purchase plans" on public.purchase_plans for update to authenticated using((select auth.uid()) is not null) with check((select auth.uid()) is not null);
create policy "Team deletes purchase plans" on public.purchase_plans for delete to authenticated using((select auth.uid()) is not null);

drop policy if exists "Users read own purchase plan items" on public.purchase_plan_items;
drop policy if exists "Users create own purchase plan items" on public.purchase_plan_items;
drop policy if exists "Users update own purchase plan items" on public.purchase_plan_items;
create policy "Team reads purchase plan items" on public.purchase_plan_items for select to authenticated using((select auth.uid()) is not null);
create policy "Team creates purchase plan items" on public.purchase_plan_items for insert to authenticated with check((select auth.uid()) is not null);
create policy "Team updates purchase plan items" on public.purchase_plan_items for update to authenticated using((select auth.uid()) is not null) with check((select auth.uid()) is not null);

drop policy if exists "Users read own suppliers" on public.suppliers;
drop policy if exists "Users create own suppliers" on public.suppliers;
drop policy if exists "Users update own suppliers" on public.suppliers;
create policy "Team reads suppliers" on public.suppliers for select to authenticated using((select auth.uid()) is not null);
create policy "Team creates suppliers" on public.suppliers for insert to authenticated with check((select auth.uid()) is not null);
create policy "Team updates suppliers" on public.suppliers for update to authenticated using((select auth.uid()) is not null) with check((select auth.uid()) is not null);

drop policy if exists "Users manage own supplier ingredients" on public.supplier_ingredients;
create policy "Team manages supplier ingredients" on public.supplier_ingredients for all to authenticated
  using((select auth.uid()) is not null) with check((select auth.uid()) is not null);

drop policy if exists "Users read own inventories" on public.inventory_sessions;
drop policy if exists "Users create own inventories" on public.inventory_sessions;
drop policy if exists "Users update own inventories" on public.inventory_sessions;
create policy "Team reads inventories" on public.inventory_sessions for select to authenticated using((select auth.uid()) is not null);
create policy "Team creates inventories" on public.inventory_sessions for insert to authenticated with check((select auth.uid()) is not null);
create policy "Team updates inventories" on public.inventory_sessions for update to authenticated using((select auth.uid()) is not null) with check((select auth.uid()) is not null);

drop policy if exists "Users manage own inventory counts" on public.inventory_counts;
create policy "Team manages inventory counts" on public.inventory_counts for all to authenticated
  using((select auth.uid()) is not null) with check((select auth.uid()) is not null);

drop policy if exists "Users read own attachments" on public.attachments;
drop policy if exists "Users create own attachments" on public.attachments;
drop policy if exists "Users delete own attachments" on public.attachments;
create policy "Team reads attachments" on public.attachments for select to authenticated using((select auth.uid()) is not null);
create policy "Team creates attachments" on public.attachments for insert to authenticated with check((select auth.uid()) is not null);
create policy "Team deletes attachments" on public.attachments for delete to authenticated using((select auth.uid()) is not null);

drop policy if exists "Users read own inside documents" on storage.objects;
drop policy if exists "Users upload own inside documents" on storage.objects;
drop policy if exists "Users delete own inside documents" on storage.objects;
create policy "Team reads inside documents" on storage.objects for select to authenticated using(bucket_id='inside-documents' and (select auth.uid()) is not null);
create policy "Team uploads inside documents" on storage.objects for insert to authenticated with check(bucket_id='inside-documents' and (select auth.uid()) is not null);
create policy "Team deletes inside documents" on storage.objects for delete to authenticated using(bucket_id='inside-documents' and (select auth.uid()) is not null);

create or replace function public.validate_inventory_session(p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_session public.inventory_sessions%rowtype; v_count integer:=0; v_value numeric:=0; r record;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  select * into v_session from public.inventory_sessions where id=p_session_id for update;
  if not found then raise exception 'Inventaire introuvable'; end if;
  if v_session.status='validated' then raise exception 'Inventaire déjà validé'; end if;
  if exists(select 1 from public.inventory_counts where inventory_session_id=p_session_id and counted_qty is null) then raise exception 'Toutes les quantités doivent être comptées'; end if;
  for r in select c.*,i.name,i.stock_qty from public.inventory_counts c join public.ingredients i on i.id=c.ingredient_id where c.inventory_session_id=p_session_id for update of i loop
    if r.counted_qty is distinct from r.stock_qty then
      update public.ingredients set stock_qty=r.counted_qty,updated_at=now() where id=r.ingredient_id;
      insert into public.stock_movements(ingredient_id,ingredient_name,movement_type,qty,notes,created_at)
      values(r.ingredient_id,r.name,'inventory',round(r.counted_qty-r.stock_qty,3),'Inventaire '||v_session.inventory_date,v_session.inventory_date::timestamp+interval '18 hours');
      v_count:=v_count+1; v_value:=v_value+abs(r.counted_qty-r.stock_qty)*r.unit_cost;
    end if;
  end loop;
  update public.inventory_sessions set status='validated',validated_at=now(),updated_at=now() where id=p_session_id;
  return jsonb_build_object('adjustments',v_count,'adjustment_value',round(v_value,3));
end $$;

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
    where pi.id=p_purchase_plan_item_id and pi.ingredient_id=p_ingredient_id and p.status in ('ordered','partially_received') for update of pi;
    if not found then raise exception 'Ligne d’achat introuvable ou non réceptionnable'; end if;
    v_plan_id:=v_item.purchase_plan_id;
  end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id) then raise exception 'Fournisseur invalide'; end if;
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

revoke all on function public.preserve_creator_user_id() from public,anon;
grant execute on function public.preserve_creator_user_id() to authenticated;
revoke all on function public.validate_inventory_session(uuid) from public,anon;
grant execute on function public.validate_inventory_session(uuid) to authenticated;
revoke all on function public.receive_stock_purchase(uuid,text,numeric,numeric,numeric,text,date,text,text,uuid,uuid) from public,anon;
grant execute on function public.receive_stock_purchase(uuid,text,numeric,numeric,numeric,text,date,text,text,uuid,uuid) to authenticated;
