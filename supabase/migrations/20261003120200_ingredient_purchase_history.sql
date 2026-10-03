create table if not exists public.ingredient_purchase_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  format_name text,
  format_qty numeric,
  format_price numeric,
  price_per_unit numeric,
  unit text not null,
  source text not null default 'update' check (source in ('initial', 'update')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists ingredient_purchase_history_ingredient_date_idx
  on public.ingredient_purchase_history (ingredient_id, changed_at desc);

alter table public.ingredient_purchase_history enable row level security;
revoke all on table public.ingredient_purchase_history from anon, authenticated;
grant select on table public.ingredient_purchase_history to authenticated;

drop policy if exists "Authenticated users can read purchase history" on public.ingredient_purchase_history;
create policy "Authenticated users can read purchase history"
  on public.ingredient_purchase_history
  for select
  to authenticated
  using ((select auth.uid()) is not null);

create or replace function public.track_ingredient_purchase_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or
     old.purchase_format_name is distinct from new.purchase_format_name or
     old.purchase_format_qty is distinct from new.purchase_format_qty or
     old.purchase_format_price is distinct from new.purchase_format_price or
     old.price_per_unit is distinct from new.price_per_unit or
     old.unit is distinct from new.unit then
    insert into public.ingredient_purchase_history (
      ingredient_id, format_name, format_qty, format_price,
      price_per_unit, unit, source, changed_by
    ) values (
      new.id, nullif(trim(new.purchase_format_name), ''),
      new.purchase_format_qty, new.purchase_format_price,
      new.price_per_unit, new.unit, 'update', auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.track_ingredient_purchase_change() from public, anon, authenticated;

drop trigger if exists track_ingredient_purchase_change on public.ingredients;
create trigger track_ingredient_purchase_change
after insert or update of purchase_format_name, purchase_format_qty, purchase_format_price, price_per_unit, unit
on public.ingredients
for each row execute function public.track_ingredient_purchase_change();

insert into public.ingredient_purchase_history (
  ingredient_id, format_name, format_qty, format_price,
  price_per_unit, unit, source, changed_at
)
select i.id, nullif(trim(i.purchase_format_name), ''), i.purchase_format_qty,
       i.purchase_format_price, i.price_per_unit, i.unit, 'initial', now()
from public.ingredients i
where not exists (
  select 1 from public.ingredient_purchase_history h where h.ingredient_id = i.id
);
