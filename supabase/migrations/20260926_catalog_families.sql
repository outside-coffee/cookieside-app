create table if not exists public.product_families (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null unique,
  color text not null default '#FF5477',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.product_families enable row level security;

drop policy if exists product_families_authenticated_all on public.product_families;
create policy product_families_authenticated_all on public.product_families
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.product_families to authenticated;

insert into public.product_families(name, color, sort_order)
values
  ('Cookies', '#FF5477', 10),
  ('Brownies', '#3BC4AE', 20),
  ('Cinnamon rolls', '#142756', 30),
  ('Croissants', '#FF89A1', 40),
  ('Cheesecakes', '#6FD8C7', 50),
  ('Boissons', '#5573AA', 60),
  ('Coffrets & assortiments', '#E94669', 70),
  ('Saisonnier', '#168B78', 80),
  ('Autres', '#8799BE', 90)
on conflict (name) do nothing;

insert into public.product_families(name, sort_order)
select distinct trim(family), 100
from public.varieties
where nullif(trim(family), '') is not null
on conflict (name) do nothing;

alter table public.varieties
  add column if not exists family_id uuid references public.product_families(id),
  add column if not exists product_status text not null default 'active',
  add column if not exists min_stock integer not null default 0,
  add column if not exists shelf_life_days integer;

update public.varieties v
set family_id = f.id
from public.product_families f
where f.name = v.family and v.family_id is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'varieties_product_status_valid') then
    alter table public.varieties add constraint varieties_product_status_valid
      check (product_status in ('draft', 'active', 'seasonal', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'varieties_min_stock_nonnegative') then
    alter table public.varieties add constraint varieties_min_stock_nonnegative check (min_stock >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'varieties_shelf_life_positive') then
    alter table public.varieties add constraint varieties_shelf_life_positive
      check (shelf_life_days is null or shelf_life_days > 0);
  end if;
end $$;

create index if not exists varieties_family_id_idx on public.varieties(family_id);

comment on column public.varieties.family is 'Legacy family label retained for compatibility.';
comment on column public.varieties.min_stock is 'Target minimum finished-goods stock in sale units.';

