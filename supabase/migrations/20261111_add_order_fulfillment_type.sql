alter table public.orders
  add column if not exists fulfillment_type text not null default 'delivery'
  check (fulfillment_type in ('delivery','pickup'));

update public.orders
set fulfillment_type='delivery'
where fulfillment_type is null;
