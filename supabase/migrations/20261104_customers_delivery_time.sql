-- Customer database and delivery time
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  customer_type text not null default 'B2C' check (customer_type in ('B2C','B2B')),
  phone text,
  instagram text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_name_unique_ci
  on public.customers (lower(btrim(name)));

alter table public.customers enable row level security;

drop policy if exists "Authenticated users can read customers" on public.customers;
create policy "Authenticated users can read customers"
on public.customers for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert customers" on public.customers;
create policy "Authenticated users can insert customers"
on public.customers for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update customers" on public.customers;
create policy "Authenticated users can update customers"
on public.customers for update
to authenticated
using (true)
with check (true);

grant select, insert, update on public.customers to authenticated;

alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists delivery_time time;

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_delivery_schedule_idx on public.orders(delivery_date,delivery_time);

insert into public.customers(name,customer_type)
select btrim(client) as name,
       case when bool_or(canal='B2B') then 'B2B' else 'B2C' end
from public.orders
where nullif(btrim(client),'') is not null
group by lower(btrim(client)), btrim(client)
on conflict do nothing;

update public.orders o
set customer_id=c.id
from public.customers c
where o.customer_id is null
  and nullif(btrim(o.client),'') is not null
  and lower(btrim(o.client))=lower(btrim(c.name));
