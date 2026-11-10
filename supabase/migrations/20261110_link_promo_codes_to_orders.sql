alter table public.promo_codes
  add column if not exists free_delivery boolean not null default false;

alter table public.orders
  add column if not exists promo_code_id uuid null references public.promo_codes(id) on delete set null;

create index if not exists orders_promo_code_id_idx on public.orders(promo_code_id);

create or replace function public.sync_promo_code_used_count()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if tg_op in ('UPDATE','DELETE') and old.promo_code_id is not null then
    update public.promo_codes pc
    set used_count=(
      select count(*)::integer
      from public.orders o
      where o.promo_code_id=old.promo_code_id
        and o.status<>'Annulée'
    ),
    updated_at=now()
    where pc.id=old.promo_code_id;
  end if;

  if tg_op in ('INSERT','UPDATE') and new.promo_code_id is not null then
    update public.promo_codes pc
    set used_count=(
      select count(*)::integer
      from public.orders o
      where o.promo_code_id=new.promo_code_id
        and o.status<>'Annulée'
    ),
    updated_at=now()
    where pc.id=new.promo_code_id;
  end if;

  return coalesce(new,old);
end
$function$;

drop trigger if exists sync_promo_code_used_count_trg on public.orders;
create trigger sync_promo_code_used_count_trg
after insert or delete or update of promo_code_id,status
on public.orders
for each row execute function public.sync_promo_code_used_count();

grant select,insert,update on public.promo_codes to authenticated;
