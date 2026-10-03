create table if not exists public.inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inventory_date date not null default current_date,
  status text not null default 'draft' check(status in ('draft','validated')),
  notes text, validated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists inventory_sessions_user_date_idx on public.inventory_sessions(user_id, inventory_date desc);
alter table public.inventory_sessions enable row level security;
revoke all on public.inventory_sessions from anon, authenticated;
grant select, insert, update on public.inventory_sessions to authenticated;
create policy "Users read own inventories" on public.inventory_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy "Users create own inventories" on public.inventory_sessions for insert to authenticated with check(user_id=(select auth.uid()));
create policy "Users update own inventories" on public.inventory_sessions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table if not exists public.inventory_counts (
  inventory_session_id uuid not null references public.inventory_sessions(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  expected_qty numeric not null, counted_qty numeric, unit_cost numeric not null default 0,
  primary key(inventory_session_id, ingredient_id)
);
create index if not exists inventory_counts_ingredient_idx on public.inventory_counts(ingredient_id);
alter table public.inventory_counts enable row level security;
revoke all on public.inventory_counts from anon, authenticated;
grant select, insert, update on public.inventory_counts to authenticated;
create policy "Users manage own inventory counts" on public.inventory_counts for all to authenticated
  using(exists(select 1 from public.inventory_sessions s where s.id=inventory_session_id and s.user_id=(select auth.uid())))
  with check(exists(select 1 from public.inventory_sessions s where s.id=inventory_session_id and s.user_id=(select auth.uid())));

create or replace function public.validate_inventory_session(p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_session public.inventory_sessions%rowtype; v_count integer:=0; v_value numeric:=0; r record;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  select * into v_session from public.inventory_sessions where id=p_session_id and user_id=(select auth.uid()) for update;
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
revoke all on function public.validate_inventory_session(uuid) from public,anon;
grant execute on function public.validate_inventory_session(uuid) to authenticated;
