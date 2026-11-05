-- Allow order editing regardless of current workflow status.
-- The current status is preserved: editing a paid order stays paid,
-- editing a cancelled order stays cancelled.

create or replace function public.update_multi_product_order(
  p_order_id uuid,
  p_client text,
  p_canal text,
  p_delivery_date date,
  p_notes text,
  p_items jsonb
)
returns public.orders
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.varieties%rowtype;
  v_format public.product_formats%rowtype;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_total numeric:=0;
  v_margin numeric:=0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if p_delivery_date is null then raise exception 'La date de livraison est obligatoire'; end if;
  if p_canal is not null and p_canal not in ('B2B','B2C') then raise exception 'Canal invalide'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ajoutez au moins un produit'; end if;

  delete from public.sales where order_id=p_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'qty')::integer;
    v_price:=(v_item->>'price')::numeric;

    select * into v_product
    from public.varieties
    where id=(v_item->>'variety_id')::uuid and active=true;
    if not found then raise exception 'Produit introuvable ou inactif'; end if;

    select * into v_format
    from public.product_formats
    where id=coalesce(nullif(v_item->>'format_id','')::uuid,public.default_product_format_id())
      and status<>'inactive';
    if not found then raise exception 'Format introuvable ou inactif'; end if;

    if v_qty<=0 or v_price<0 then raise exception 'Ligne de commande invalide'; end if;

    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0)*v_format.cost_factor
      into v_cost
    from public.recipes r
    join public.ingredients i on i.id=r.ingredient_id
    where r.variety_id=v_product.id;

    insert into public.sales(
      order_id,variety_id,format_id,variety_name,qty,price_per_unit,total_amount,margin,margin_pct,
      client,canal,status,sold_at,delivered_at,paid_at
    )
    values(
      p_order_id,v_product.id,v_format.id,v_product.name,v_qty,v_price,
      round(v_qty*v_price,3),round(v_qty*(v_price-v_cost),3),
      case when v_price>0 then round((v_price-v_cost)/v_price*100,1) else 0 end,
      nullif(btrim(p_client),''),p_canal,v_order.status,p_delivery_date,
      v_order.delivered_at,v_order.paid_at
    );

    v_total:=v_total+v_qty*v_price;
    v_margin:=v_margin+v_qty*(v_price-v_cost);
  end loop;

  update public.orders
  set client=nullif(btrim(p_client),''),
      canal=p_canal,
      delivery_date=p_delivery_date,
      notes=nullif(btrim(p_notes),''),
      total_amount=round(v_total,3),
      margin=round(v_margin,3)
  where id=p_order_id
  returning * into v_order;

  return v_order;
end
$function$;

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
  end if;

  for v_sale in select * from public.sales where order_id=p_order_id order by created_at,id loop
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
    elsif p_promo_type='bogo' then
      v_discount := round(floor(v_sale.qty/2.0) * v_sale.price_per_unit,3);
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
