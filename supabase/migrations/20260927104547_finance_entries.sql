create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('expense', 'investment')),
  category text not null,
  label text not null,
  amount numeric(12,3) not null check (amount >= 0),
  entry_date date not null default current_date,
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_entries_user_date_idx
  on public.finance_entries (user_id, entry_date desc);

alter table public.finance_entries enable row level security;
revoke all on table public.finance_entries from anon, authenticated;
grant select, insert, update, delete on table public.finance_entries to authenticated;

drop policy if exists "Users can read their finance entries" on public.finance_entries;
drop policy if exists "Users can create their finance entries" on public.finance_entries;
drop policy if exists "Users can update their finance entries" on public.finance_entries;
drop policy if exists "Users can delete their finance entries" on public.finance_entries;

create policy "Users can read their finance entries" on public.finance_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their finance entries" on public.finance_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their finance entries" on public.finance_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their finance entries" on public.finance_entries for delete to authenticated using ((select auth.uid()) = user_id);
