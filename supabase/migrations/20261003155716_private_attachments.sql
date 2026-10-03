create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_type text not null check(entity_type in ('stock_movement','finance_entry','investment','order')), entity_id uuid not null,
  file_name text not null, mime_type text not null, storage_path text not null unique, created_at timestamptz not null default now()
);
create index if not exists attachments_user_entity_idx on public.attachments(user_id,entity_type,entity_id);
alter table public.attachments enable row level security;
revoke all on public.attachments from anon,authenticated;
grant select,insert,delete on public.attachments to authenticated;
create policy "Users read own attachments" on public.attachments for select to authenticated using(user_id=(select auth.uid()));
create policy "Users create own attachments" on public.attachments for insert to authenticated with check(user_id=(select auth.uid()));
create policy "Users delete own attachments" on public.attachments for delete to authenticated using(user_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inside-documents','inside-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy "Users read own inside documents" on storage.objects for select to authenticated using(bucket_id='inside-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users upload own inside documents" on storage.objects for insert to authenticated with check(bucket_id='inside-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Users delete own inside documents" on storage.objects for delete to authenticated using(bucket_id='inside-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
