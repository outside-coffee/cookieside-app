create table if not exists public.sale_price_history (
  id uuid primary key default gen_random_uuid(),
  variety_id uuid not null references public.varieties(id) on delete cascade,
  canal text not null,
  price numeric not null check (price >= 0),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists sale_price_history_variety_date_idx
  on public.sale_price_history (variety_id, changed_at desc);
create index if not exists sale_price_history_changed_by_idx
  on public.sale_price_history (changed_by) where changed_by is not null;

alter table public.sale_price_history enable row level security;
revoke all on table public.sale_price_history from anon, authenticated;
grant select on table public.sale_price_history to authenticated;

drop policy if exists "Authenticated users can read sale price history" on public.sale_price_history;
create policy "Authenticated users can read sale price history"
  on public.sale_price_history for select to authenticated
  using ((select auth.uid()) is not null);

create or replace function public.track_sale_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or old.price is distinct from new.price then
    insert into public.sale_price_history (variety_id, canal, price, changed_by, changed_at)
    values (new.variety_id, new.canal, new.price, auth.uid(), coalesce(new.updated_at, now()));
  end if;
  return new;
end;
$$;

revoke execute on function public.track_sale_price_change() from public, anon, authenticated;

drop trigger if exists track_sale_price_change on public.sale_prices;
create trigger track_sale_price_change
after insert or update of price on public.sale_prices
for each row execute function public.track_sale_price_change();

insert into public.sale_price_history (variety_id, canal, price, changed_at)
select sp.variety_id, sp.canal, sp.price, coalesce(sp.updated_at, now())
from public.sale_prices sp
where not exists (
  select 1 from public.sale_price_history h
  where h.variety_id = sp.variety_id and h.canal = sp.canal
);
