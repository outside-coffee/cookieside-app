alter table public.ingredient_purchase_history
  add column if not exists deleted_at timestamptz;
grant update (format_name,format_qty,format_price,price_per_unit,changed_at,deleted_at)
  on public.ingredient_purchase_history to authenticated;
drop policy if exists "Team corrects price history" on public.ingredient_purchase_history;
create policy "Team corrects price history" on public.ingredient_purchase_history
  for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create table if not exists public.ingredient_purchase_history_corrections (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  action text not null check (action in ('update','delete')),
  before_data jsonb not null,
  after_data jsonb,
  reason text not null,
  changed_by uuid not null default auth.uid() references auth.users(id),
  changed_at timestamptz not null default now()
);

create index if not exists ingredient_purchase_history_corrections_idx
  on public.ingredient_purchase_history_corrections(history_id,changed_at desc);
alter table public.ingredient_purchase_history_corrections enable row level security;
revoke all on public.ingredient_purchase_history_corrections from anon,authenticated;
grant select,insert on public.ingredient_purchase_history_corrections to authenticated;
drop policy if exists "Team reads price history corrections" on public.ingredient_purchase_history_corrections;
create policy "Team reads price history corrections" on public.ingredient_purchase_history_corrections
  for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists "Team records price history corrections" on public.ingredient_purchase_history_corrections;
create policy "Team records price history corrections" on public.ingredient_purchase_history_corrections
  for insert to authenticated with check (changed_by=(select auth.uid()));

create or replace function public.guard_price_history_change()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if current_setting('app.price_history_correction',true)<>'allowed' then
    raise exception 'Utilisez les actions de correction de l’historique';
  end if;
  return new;
end $$;
drop trigger if exists guard_price_history_change on public.ingredient_purchase_history;
create trigger guard_price_history_change before update on public.ingredient_purchase_history
  for each row execute function public.guard_price_history_change();

create or replace function public.sync_ingredient_from_latest_price(p_ingredient_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_latest public.ingredient_purchase_history%rowtype;
begin
  select * into v_latest from public.ingredient_purchase_history
  where ingredient_id=p_ingredient_id and deleted_at is null
  order by changed_at desc,id desc limit 1;
  if found then
    perform set_config('app.skip_purchase_history','on',true);
    update public.ingredients set
      purchase_format_name=v_latest.format_name,
      purchase_format_qty=v_latest.format_qty,
      purchase_format_price=v_latest.format_price,
      price_per_unit=v_latest.price_per_unit,
      unit=v_latest.unit,
      updated_at=now()
    where id=p_ingredient_id;
  end if;
end $$;

create or replace function public.track_ingredient_purchase_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_setting('app.skip_purchase_history',true)='on' then return new; end if;
  if tg_op='INSERT' or old.purchase_format_name is distinct from new.purchase_format_name or
     old.purchase_format_qty is distinct from new.purchase_format_qty or
     old.purchase_format_price is distinct from new.purchase_format_price or
     old.price_per_unit is distinct from new.price_per_unit or old.unit is distinct from new.unit then
    insert into public.ingredient_purchase_history(ingredient_id,format_name,format_qty,format_price,price_per_unit,unit,source,changed_by)
    values(new.id,nullif(trim(new.purchase_format_name),''),new.purchase_format_qty,new.purchase_format_price,new.price_per_unit,new.unit,'update',auth.uid());
  end if;
  return new;
end $$;

create or replace function public.update_ingredient_purchase_history(
  p_history_id uuid,p_format_name text,p_format_qty numeric,p_format_price numeric,p_changed_at timestamptz,p_reason text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row public.ingredient_purchase_history%rowtype; v_after public.ingredient_purchase_history%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Le motif de correction est obligatoire'; end if;
  if coalesce(trim(p_format_name),'')='' or p_format_qty<=0 or p_format_price<=0 or p_changed_at is null then raise exception 'Format, quantité, prix et date sont requis'; end if;
  select * into v_row from public.ingredient_purchase_history where id=p_history_id and deleted_at is null for update;
  if not found then raise exception 'Historique introuvable'; end if;
  perform set_config('app.price_history_correction','allowed',true);
  update public.ingredient_purchase_history set format_name=trim(p_format_name),format_qty=round(p_format_qty,3),format_price=round(p_format_price,3),
    price_per_unit=round(p_format_price/p_format_qty,8),changed_at=p_changed_at
  where id=p_history_id returning * into v_after;
  insert into public.ingredient_purchase_history_corrections(history_id,ingredient_id,action,before_data,after_data,reason)
  values(v_row.id,v_row.ingredient_id,'update',to_jsonb(v_row),to_jsonb(v_after),trim(p_reason));
  perform public.sync_ingredient_from_latest_price(v_row.ingredient_id);
  return to_jsonb(v_after);
end $$;

create or replace function public.delete_ingredient_purchase_history(p_history_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row public.ingredient_purchase_history%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Le motif de suppression est obligatoire'; end if;
  select * into v_row from public.ingredient_purchase_history where id=p_history_id and deleted_at is null for update;
  if not found then raise exception 'Historique introuvable'; end if;
  perform set_config('app.price_history_correction','allowed',true);
  update public.ingredient_purchase_history set deleted_at=now() where id=p_history_id;
  insert into public.ingredient_purchase_history_corrections(history_id,ingredient_id,action,before_data,after_data,reason)
  values(v_row.id,v_row.ingredient_id,'delete',to_jsonb(v_row),null,trim(p_reason));
  perform public.sync_ingredient_from_latest_price(v_row.ingredient_id);
  return jsonb_build_object('deleted',true,'history_id',p_history_id);
end $$;

revoke all on function public.sync_ingredient_from_latest_price(uuid) from public,anon;
grant execute on function public.sync_ingredient_from_latest_price(uuid) to authenticated;
revoke all on function public.guard_price_history_change() from public,anon,authenticated;
revoke all on function public.update_ingredient_purchase_history(uuid,text,numeric,numeric,timestamptz,text) from public,anon;
revoke all on function public.delete_ingredient_purchase_history(uuid,text) from public,anon;
grant execute on function public.update_ingredient_purchase_history(uuid,text,numeric,numeric,timestamptz,text) to authenticated;
grant execute on function public.delete_ingredient_purchase_history(uuid,text) to authenticated;
