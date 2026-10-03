create schema if not exists private;

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'manager' check(role in ('admin','manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
revoke all on public.team_members from anon,authenticated;
grant select,update on public.team_members to authenticated;

insert into public.team_members(user_id,email,role,created_at)
select id,email,case when row_number() over(order by created_at,id)=1 then 'admin' else 'manager' end,created_at
from auth.users
on conflict(user_id) do update set email=excluded.email;

create or replace function private.current_app_role()
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select role from public.team_members where user_id=(select auth.uid()) and active=true
$$;

revoke all on function private.current_app_role() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;

create policy "Team reads members" on public.team_members for select to authenticated
  using((select auth.uid()) is not null);
create policy "Admins update member roles" on public.team_members for update to authenticated
  using((select private.current_app_role())='admin')
  with check(role in ('admin','manager'));

create or replace function private.handle_new_team_member()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.team_members(user_id,email,role)
  values(new.id,coalesce(new.email,''),'manager')
  on conflict(user_id) do update set email=excluded.email,updated_at=now();
  return new;
end $$;

revoke all on function private.handle_new_team_member() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_team_member on auth.users;
create trigger on_auth_user_created_team_member after insert or update of email on auth.users
for each row execute function private.handle_new_team_member();

create index if not exists team_members_role_active_idx on public.team_members(role,active);
