create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  source text not null default 'Concours',
  promo_type text not null check (promo_type in ('percent','fixed','bogo')),
  promo_value numeric not null default 0 check (promo_value >= 0),
  channel text not null default 'ALL' check (channel in ('ALL','B2C','B2B')),
  starts_at date,
  ends_at date,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_period_check check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint promo_codes_value_check check (
    (promo_type='percent' and promo_value > 0 and promo_value <= 100)
    or (promo_type='fixed' and promo_value > 0)
    or (promo_type='bogo' and promo_value >= 0)
  )
);

create unique index if not exists promo_codes_code_ci_uidx
  on public.promo_codes (lower(btrim(code)));

alter table public.promo_codes enable row level security;

grant select, insert, update on table public.promo_codes to authenticated;

drop policy if exists "promo_codes_select_authenticated" on public.promo_codes;
create policy "promo_codes_select_authenticated"
  on public.promo_codes for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "promo_codes_insert_authenticated" on public.promo_codes;
create policy "promo_codes_insert_authenticated"
  on public.promo_codes for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "promo_codes_update_authenticated" on public.promo_codes;
create policy "promo_codes_update_authenticated"
  on public.promo_codes for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
