-- Apply BOGO (buy one, get one free) across the entire order basket.
-- The cheapest eligible units are the free units when prices differ.

create or replace function public.apply_order_pricing(
  p_order_id uuid,
  p_promo_type text default null,
  p_promo_value numeric default 0,
  p_promo_label text default null,
  p_delivery_fee numeric default 0,
  p_free_delivery boolean default false
)
returns public.orders
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_sale public.sales%rowtype;
  v_format public.product_formats%rowtype;
  v_base numeric;
  v_cost numeric;
  v_discount numeric;
  v_subtotal numeric := 0;
  v_discount_total numeric := 0;
  v_products_total numeric := 0;
  v_product_margin numeric := 0;
  v_fixed numeric := 0;
  v_delivery_charged numeric := 0;
  v_delivery_cost numeric := 0;
  v_bogo_free_remaining integer := 0;
  v_free_qty integer := 0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;

  if p_promo_type is not null and p_promo_type not in ('percent','fixed','bogo') then
    raise exception 'Type de promotion invalide';
  end if;
  if p_promo_type='percent' and (coalesce(p_promo_value,0)<0 or p_promo_value>100) then
    raise exception 'Pourcentage invalide';
  end if;
  if p_promo_type='fixed' and coalesce(p_promo_value,0)<0 then
    raise exception 'Montant de remise invalide';
  end if;
  if coalesce(p_delivery_fee,0)<0 then
    raise exception 'Frais de livraison invalides';
  end if;

  select coalesce(sum(qty*price_per_unit),0)
  into v_subtotal
  from public.sales
  where order_id=p_order_id;

  if p_promo_type='fixed' then
    v_fixed := least(coalesce(p_promo_value,0), v_subtotal);
  elsif p_promo_type='bogo' then
    select floor(coalesce(sum(qty),0)/2.0)::integer
      into v_bogo_free_remaining
    from public.sales
    where order_id=p_order_id;
  end if;

  for v_sale in
    select *
    from public.sales
    where order_id=p_order_id
    order by
      case when p_promo_type='bogo' then price_per_unit end asc nulls last,
      created_at,
      id
  loop
    v_base := round(v_sale.qty*v_sale.price_per_unit,3);

    select * into v_format from public.product_formats where id=v_sale.format_id;

    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0) * coalesce(v_format.cost_factor,1) * v_sale.qty
      into v_cost
    from public.recipes r
    join public.ingredients i on i.id=r.ingredient_id
    where r.variety_id=v_sale.variety_id;

    v_discount := 0;
    if p_promo_type='percent' then
      v_discount := round(v_base * coalesce(p_promo_value,0) / 100,3);
    elsif p_promo_type='fixed' and v_subtotal>0 then
      v_discount := round(v_fixed * v_base / v_subtotal,3);
    elsif p_promo_type='bogo' and v_bogo_free_remaining>0 then
      v_free_qty := least(v_sale.qty, v_bogo_free_remaining);
      v_discount := round(v_free_qty * v_sale.price_per_unit,3);
      v_bogo_free_remaining := v_bogo_free_remaining - v_free_qty;
    end if;

    v_discount := least(v_discount,v_base);

    update public.sales
    set total_amount = round(v_base-v_discount,3),
        margin = round((v_base-v_discount)-coalesce(v_cost,0),3),
        margin_pct = case when (v_base-v_discount)>0
          then round((((v_base-v_discount)-coalesce(v_cost,0))/(v_base-v_discount))*100,1)
          else 0 end
    where id=v_sale.id;

    v_discount_total := v_discount_total + v_discount;
    v_products_total := v_products_total + (v_base-v_discount);
    v_product_margin := v_product_margin + ((v_base-v_discount)-coalesce(v_cost,0));
  end loop;

  if p_promo_type='fixed' then
    v_discount_total := least(v_fixed,v_subtotal);
    v_products_total := v_subtotal-v_discount_total;
  end if;

  v_delivery_cost := coalesce(p_delivery_fee,0);
  v_delivery_charged := case when coalesce(p_free_delivery,false) then 0 else v_delivery_cost end;

  update public.orders
  set subtotal_amount=round(v_subtotal,3),
      promo_type=p_promo_type,
      promo_value=case when p_promo_type is null then 0 else coalesce(p_promo_value,0) end,
      promo_label=nullif(btrim(p_promo_label),''),
      discount_amount=round(v_discount_total,3),
      delivery_fee_base=round(v_delivery_cost,3),
      delivery_cost=round(v_delivery_cost,3),
      free_delivery=coalesce(p_free_delivery,false),
      delivery_fee=round(v_delivery_charged,3),
      total_amount=round(v_products_total+v_delivery_charged,3),
      margin=round(v_product_margin+v_delivery_charged-v_delivery_cost,3)
  where id=p_order_id
  returning * into v_order;

  return v_order;
end
$function$;

do $$
declare r record;
begin
  for r in
    select id,promo_type,promo_value,promo_label,delivery_fee_base,free_delivery
    from public.orders
    where promo_type='bogo'
  loop
    perform public.apply_order_pricing(
      r.id,r.promo_type,r.promo_value,r.promo_label,r.delivery_fee_base,r.free_delivery
    );
  end loop;
end $$;
