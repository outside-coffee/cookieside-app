create table public.purchase_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'received')),
  varieties jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  planned_units numeric not null default 0,
  production_cost numeric not null default 0,
  purchase_budget numeric not null default 0,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_plans_user_created_idx
  on public.purchase_plans (user_id, created_at desc);

alter table public.purchase_plans enable row level security;
revoke all on table public.purchase_plans from anon, authenticated;
grant select, insert, update, delete on table public.purchase_plans to authenticated;

create policy "Users can read their purchase plans"
  on public.purchase_plans for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their purchase plans"
  on public.purchase_plans for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their purchase plans"
  on public.purchase_plans for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their purchase plans"
  on public.purchase_plans for delete
  to authenticated
  using ((select auth.uid()) = user_id);
