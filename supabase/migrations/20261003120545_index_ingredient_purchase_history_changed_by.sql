create index if not exists ingredient_purchase_history_changed_by_idx
  on public.ingredient_purchase_history (changed_by)
  where changed_by is not null;
