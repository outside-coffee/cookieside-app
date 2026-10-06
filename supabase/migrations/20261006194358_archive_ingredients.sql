alter table public.ingredients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists ingredients_archived_at_idx on public.ingredients(archived_at);

comment on column public.ingredients.archived_at is
  'Une date non nulle retire la matière des parcours opérationnels sans supprimer son historique.';
