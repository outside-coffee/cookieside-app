create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, phone text, email text, notes text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  minimum_order numeric check (minimum_order is null or minimum_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, name)
);
create index if not exists suppliers_user_name_idx on public.suppliers(user_id, name);
alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;
create policy "Users read own suppliers" on public.suppliers for select to authenticated using(user_id=(select auth.uid()));
create policy "Users create own suppliers" on public.suppliers for insert to authenticated with check(user_id=(select auth.uid()));
create policy "Users update own suppliers" on public.suppliers for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table if not exists public.supplier_ingredients (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  primary key(supplier_id, ingredient_id)
);
create index if not exists supplier_ingredients_ingredient_idx on public.supplier_ingredients(ingredient_id);
alter table public.supplier_ingredients enable row level security;
revoke all on public.supplier_ingredients from anon, authenticated;
grant select, insert, delete on public.supplier_ingredients to authenticated;
create policy "Users manage own supplier ingredients" on public.supplier_ingredients for all to authenticated
  using(exists(select 1 from public.suppliers s where s.id=supplier_id and s.user_id=(select auth.uid())))
  with check(exists(select 1 from public.suppliers s where s.id=supplier_id and s.user_id=(select auth.uid())));

alter table public.stock_movements add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.finance_entries add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists stock_movements_supplier_idx on public.stock_movements(supplier_id) where supplier_id is not null;
create index if not exists finance_entries_supplier_idx on public.finance_entries(supplier_id) where supplier_id is not null;
