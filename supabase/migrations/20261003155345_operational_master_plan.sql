-- Purchase cycle
alter table public.purchase_plans drop constraint if exists purchase_plans_status_check;
alter table public.purchase_plans add constraint purchase_plans_status_check
  check (status in ('draft', 'ordered', 'partially_received', 'received'));

create table if not exists public.purchase_plan_items (
  id uuid primary key default gen_random_uuid(),
  purchase_plan_id uuid not null references public.purchase_plans(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  ingredient_name text not null,
  unit text not null,
  planned_qty numeric not null default 0 check (planned_qty >= 0),
  received_qty numeric not null default 0 check (received_qty >= 0),
  estimated_cost numeric not null default 0 check (estimated_cost >= 0),
  actual_cost numeric not null default 0 check (actual_cost >= 0),
  format_name text,
  created_at timestamptz not null default now(),
  unique (purchase_plan_id, ingredient_id)
);
create index if not exists purchase_plan_items_plan_idx on public.purchase_plan_items(purchase_plan_id);
create index if not exists purchase_plan_items_ingredient_idx on public.purchase_plan_items(ingredient_id);
alter table public.purchase_plan_items enable row level security;
revoke all on public.purchase_plan_items from anon, authenticated;
grant select, insert, update on public.purchase_plan_items to authenticated;
create policy "Users read own purchase plan items" on public.purchase_plan_items for select to authenticated
  using (exists(select 1 from public.purchase_plans p where p.id=purchase_plan_id and p.user_id=(select auth.uid())));
create policy "Users create own purchase plan items" on public.purchase_plan_items for insert to authenticated
  with check (exists(select 1 from public.purchase_plans p where p.id=purchase_plan_id and p.user_id=(select auth.uid())));
create policy "Users update own purchase plan items" on public.purchase_plan_items for update to authenticated
  using (exists(select 1 from public.purchase_plans p where p.id=purchase_plan_id and p.user_id=(select auth.uid())))
  with check (exists(select 1 from public.purchase_plans p where p.id=purchase_plan_id and p.user_id=(select auth.uid())));

insert into public.purchase_plan_items(purchase_plan_id, ingredient_id, ingredient_name, unit, planned_qty, estimated_cost, format_name)
select p.id, nullif(item->>'id','')::uuid, coalesce(item->>'name','Article'), coalesce(item->>'unit','unité(s)'),
       coalesce((item->>'buyQty')::numeric,0), coalesce((item->>'cost')::numeric,0), item->>'formatName'
from public.purchase_plans p cross join lateral jsonb_array_elements(p.items) item
where jsonb_typeof(p.items)='array'
on conflict (purchase_plan_id, ingredient_id) do nothing;

alter table public.stock_movements
  add column if not exists purchase_plan_id uuid references public.purchase_plans(id) on delete set null,
  add column if not exists purchase_plan_item_id uuid references public.purchase_plan_items(id) on delete set null;
create index if not exists stock_movements_purchase_plan_idx on public.stock_movements(purchase_plan_id) where purchase_plan_id is not null;
create index if not exists stock_movements_purchase_item_idx on public.stock_movements(purchase_plan_item_id) where purchase_plan_item_id is not null;

