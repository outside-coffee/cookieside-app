create table if not exists public.packaging_formats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  capacity integer not null check (capacity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.packaging_formats enable row level security;

drop policy if exists packaging_formats_select_authenticated on public.packaging_formats;
create policy packaging_formats_select_authenticated
on public.packaging_formats for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists packaging_formats_insert_authenticated on public.packaging_formats;
create policy packaging_formats_insert_authenticated
on public.packaging_formats for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists packaging_formats_update_authenticated on public.packaging_formats;
create policy packaging_formats_update_authenticated
on public.packaging_formats for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

insert into public.packaging_formats(code,name,capacity)
values ('BOX4','Box 4',4),('BOX6','Box 6',6)
on conflict (code) do update set
  name=excluded.name,
  capacity=excluded.capacity,
  active=true,
  updated_at=now();

alter table public.orders
  add column if not exists packaging_format_id uuid null
  references public.packaging_formats(id) on delete set null;

create index if not exists orders_packaging_format_id_idx
  on public.orders(packaging_format_id);

grant select,insert,update on public.packaging_formats to authenticated;
