alter table public.finance_entries
  add column if not exists payment_status text not null default 'paid',
  add column if not exists paid_at date,
  add column if not exists deleted_at timestamptz;

alter table public.finance_entries drop constraint if exists finance_entries_payment_status_check;
alter table public.finance_entries add constraint finance_entries_payment_status_check
  check (payment_status in ('due', 'paid'));

update public.finance_entries
set paid_at = entry_date
where payment_status = 'paid' and paid_at is null;
