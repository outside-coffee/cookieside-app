alter table public.finance_entries
  add column if not exists cost_nature text not null default 'variable';

alter table public.finance_entries drop constraint if exists finance_entries_cost_nature_check;
alter table public.finance_entries add constraint finance_entries_cost_nature_check
  check(cost_nature in ('fixed','variable'));

alter table public.finance_entries disable trigger preserve_creator;
update public.finance_entries set cost_nature='fixed'
where category in ('Loyer','Salaires','Services') and entry_type='expense';
alter table public.finance_entries enable trigger preserve_creator;

comment on column public.finance_entries.cost_nature is
  'Classification de pilotage pour le seuil de rentabilite : fixed ou variable.';
