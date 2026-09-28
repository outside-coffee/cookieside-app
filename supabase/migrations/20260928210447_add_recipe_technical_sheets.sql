alter table public.varieties
  add column if not exists sop_hygiene_checks jsonb not null default '[]'::jsonb,
  add column if not exists sop_steps jsonb not null default '[]'::jsonb,
  add column if not exists sop_bake_temperature integer,
  add column if not exists sop_bake_minutes integer,
  add column if not exists sop_notes text,
  add column if not exists sop_updated_at timestamptz;

alter table public.varieties drop constraint if exists varieties_sop_hygiene_array_check;
alter table public.varieties add constraint varieties_sop_hygiene_array_check
  check (jsonb_typeof(sop_hygiene_checks) = 'array');

alter table public.varieties drop constraint if exists varieties_sop_steps_array_check;
alter table public.varieties add constraint varieties_sop_steps_array_check
  check (jsonb_typeof(sop_steps) = 'array');

alter table public.varieties drop constraint if exists varieties_sop_bake_values_check;
alter table public.varieties add constraint varieties_sop_bake_values_check
  check ((sop_bake_temperature is null or sop_bake_temperature > 0)
    and (sop_bake_minutes is null or sop_bake_minutes > 0));

comment on column public.varieties.sop_steps is
  'Ordered technical sheet steps stored as objects with title and detail.';
