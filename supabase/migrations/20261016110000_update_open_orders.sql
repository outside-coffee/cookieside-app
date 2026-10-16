create or replace function public.update_multi_product_order(
  p_order_id uuid,
  p_client text,
  p_canal text,
  p_delivery_date date,
  p_notes text,
  p_items jsonb
) returns public.orders
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.varieties%rowtype;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_total numeric := 0;
  v_margin numeric := 0;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Commande introuvable';
  end if;
  if v_order.status not in ('Vendu', 'Prête') then
    raise exception 'Seules les commandes à préparer ou prêtes peuvent être modifiées';
  end if;
  if p_delivery_date is null then
    raise exception 'La date de livraison est obligatoire';
  end if;
  if p_canal is not null and p_canal not in ('B2B', 'B2C') then
    raise exception 'Canal invalide';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Ajoutez au moins un produit';
  end if;

  delete from public.sales where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::integer;
    v_price := (v_item->>'price')::numeric;

    select * into v_product
    from public.varieties
    where id = (v_item->>'variety_id')::uuid
      and active = true;

    if not found or v_qty <= 0 or v_price < 0 then
      raise exception 'Ligne de commande invalide';
    end if;

    select coalesce(sum(r.qty_per_cookie * i.price_per_unit), 0)
    into v_cost
    from public.recipes r
    join public.ingredients i on i.id = r.ingredient_id
    where r.variety_id = v_product.id;

    insert into public.sales(
      order_id, variety_id, variety_name, qty, price_per_unit,
      total_amount, margin, margin_pct, client, canal, status, sold_at
    ) values (
      p_order_id, v_product.id, v_product.name, v_qty, v_price,
      round(v_qty * v_price, 3), round(v_qty * (v_price - v_cost), 3),
      case when v_price > 0 then round((v_price - v_cost) / v_price * 100, 1) else 0 end,
      nullif(btrim(p_client), ''), p_canal, v_order.status, p_delivery_date
    );

    v_total := v_total + v_qty * v_price;
    v_margin := v_margin + v_qty * (v_price - v_cost);
  end loop;

  update public.orders
  set client = nullif(btrim(p_client), ''),
      canal = p_canal,
      delivery_date = p_delivery_date,
      notes = nullif(btrim(p_notes), ''),
      total_amount = round(v_total, 3),
      margin = round(v_margin, 3)
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.update_multi_product_order(uuid, text, text, date, text, jsonb) from public, anon;
grant execute on function public.update_multi_product_order(uuid, text, text, date, text, jsonb) to authenticated;
