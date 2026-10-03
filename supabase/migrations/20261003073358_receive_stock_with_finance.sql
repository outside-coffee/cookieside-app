alter table public.stock_movements
  add column if not exists purchase_format_name text,
  add column if not exists purchase_format_qty numeric,
  add column if not exists purchase_format_price numeric,
  add column if not exists purchase_format_count numeric,
  add column if not exists purchase_total numeric,
  add column if not exists supplier text,
  add column if not exists finance_entry_id uuid references public.finance_entries(id) on delete set null;

create or replace function public.receive_stock_purchase(
  p_ingredient_id uuid,
  p_format_name text,
  p_format_qty numeric,
  p_format_price numeric,
  p_format_count numeric,
  p_supplier text default null,
  p_received_at date default current_date,
  p_payment_status text default 'paid',
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ingredient public.ingredients%rowtype;
  v_received_qty numeric;
  v_total numeric;
  v_new_stock numeric;
  v_category text;
  v_finance_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise'; end if;
  if coalesce(trim(p_format_name), '') = '' then raise exception 'Le nom du format est requis'; end if;
  if p_format_qty <= 0 or p_format_price <= 0 or p_format_count <= 0 then
    raise exception 'Le contenu, le prix et le nombre de formats doivent être positifs';
  end if;
  if p_payment_status not in ('paid', 'due') then raise exception 'Statut de paiement invalide'; end if;

  select * into v_ingredient from public.ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Article introuvable'; end if;

  v_received_qty := round(p_format_qty * p_format_count, 3);
  v_total := round(p_format_price * p_format_count, 3);
  v_new_stock := round(coalesce(v_ingredient.stock_qty, 0) + v_received_qty, 3);
  v_category := case
    when v_ingredient.item_type = 'consumable' and v_ingredient.consumable_category = 'cleaning' then 'Consommables · Hygiène et nettoyage'
    when v_ingredient.item_type = 'consumable' and v_ingredient.consumable_category = 'production' then 'Consommables · Production'
    when v_ingredient.item_type = 'consumable' and v_ingredient.consumable_category = 'packaging' then 'Consommables · Emballages'
    when v_ingredient.item_type = 'consumable' then 'Consommables · Bureau et divers'
    else 'Achats matières'
  end;

  update public.ingredients set
    stock_qty = v_new_stock,
    purchase_format_name = trim(p_format_name),
    purchase_format_qty = p_format_qty,
    purchase_format_price = p_format_price,
    price_per_unit = round(p_format_price / p_format_qty, 8),
    updated_at = now()
  where id = p_ingredient_id;

  insert into public.finance_entries(
    user_id, entry_type, category, label, amount, entry_date,
    supplier, notes, payment_status, paid_at
  ) values (
    (select auth.uid()), 'expense', v_category, 'Achat ' || v_ingredient.name,
    v_total, p_received_at, nullif(trim(p_supplier), ''), p_notes,
    p_payment_status, case when p_payment_status = 'paid' then p_received_at else null end
  ) returning id into v_finance_id;

  insert into public.stock_movements(
    ingredient_id, ingredient_name, movement_type, qty, notes, created_at,
    purchase_format_name, purchase_format_qty, purchase_format_price,
    purchase_format_count, purchase_total, supplier, finance_entry_id
  ) values (
    p_ingredient_id, v_ingredient.name, 'entry', v_received_qty, p_notes,
    p_received_at::timestamp + interval '12 hours', trim(p_format_name),
    p_format_qty, p_format_price, p_format_count, v_total,
    nullif(trim(p_supplier), ''), v_finance_id
  );

  return jsonb_build_object(
    'new_stock', v_new_stock,
    'received_qty', v_received_qty,
    'purchase_total', v_total,
    'finance_entry_id', v_finance_id
  );
end;
$$;

revoke all on function public.receive_stock_purchase(uuid, text, numeric, numeric, numeric, text, date, text, text) from public, anon;
grant execute on function public.receive_stock_purchase(uuid, text, numeric, numeric, numeric, text, date, text, text) to authenticated;
