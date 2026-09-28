alter table public.ingredients
  add column if not exists item_type text not null default 'raw_material',
  add column if not exists consumable_category text;

alter table public.ingredients
  drop constraint if exists ingredients_item_type_check;

alter table public.ingredients
  add constraint ingredients_item_type_check
  check (item_type in ('raw_material', 'consumable'));

comment on column public.ingredients.item_type is
  'Separates recipe raw materials from operational consumables.';

comment on column public.ingredients.consumable_category is
  'Simple operational category: cleaning, production, packaging, or office.';
