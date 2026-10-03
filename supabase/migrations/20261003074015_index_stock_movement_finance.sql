create index if not exists stock_movements_finance_entry_idx
  on public.stock_movements (finance_entry_id)
  where finance_entry_id is not null;
