alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('Vendu', 'Prête', 'Livré', 'Payé'));

alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check
  check (status in ('Vendu', 'Prête', 'Livré', 'Payé'));
