create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null, action text not null,
  old_data jsonb, new_data jsonb, changed_by uuid references auth.users(id) on delete set null, changed_at timestamptz not null default now()
);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type,entity_id,changed_at desc);
create index if not exists audit_events_changed_by_idx on public.audit_events(changed_by) where changed_by is not null;
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon,authenticated;
grant select on public.audit_events to authenticated;
create policy "Authenticated users read audit events" on public.audit_events for select to authenticated using((select auth.uid()) is not null);
create or replace function public.track_operational_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then insert into public.audit_events(entity_type,entity_id,action,old_data,new_data,changed_by) values(tg_argv[0],new.id,'update',to_jsonb(old),to_jsonb(new),auth.uid()); return new;
  elsif tg_op='INSERT' then insert into public.audit_events(entity_type,entity_id,action,new_data,changed_by) values(tg_argv[0],new.id,'insert',to_jsonb(new),auth.uid()); return new; end if;
  return null;
end $$;
revoke execute on function public.track_operational_change() from public,anon,authenticated;
drop trigger if exists audit_orders on public.orders;
create trigger audit_orders after update of status on public.orders for each row when(old.status is distinct from new.status) execute function public.track_operational_change('order');
drop trigger if exists audit_ingredients on public.ingredients;
create trigger audit_ingredients after update of alert_threshold,unit on public.ingredients for each row execute function public.track_operational_change('ingredient');
drop trigger if exists audit_recipes on public.recipes;
create trigger audit_recipes after insert or update on public.recipes for each row execute function public.track_operational_change('recipe');
