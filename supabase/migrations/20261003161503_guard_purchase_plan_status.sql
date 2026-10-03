create or replace function public.guard_purchase_plan_received()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.status='received' and old.status is distinct from 'received' then
    if not exists(select 1 from public.purchase_plan_items where purchase_plan_id=new.id)
       or exists(select 1 from public.purchase_plan_items where purchase_plan_id=new.id and received_qty<planned_qty) then
      raise exception 'Le plan ne peut être clôturé avant la réception complète de ses lignes';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_purchase_plan_received() from public,anon;
drop trigger if exists guard_purchase_plan_received on public.purchase_plans;
create trigger guard_purchase_plan_received before update of status on public.purchase_plans
for each row execute function public.guard_purchase_plan_received();
