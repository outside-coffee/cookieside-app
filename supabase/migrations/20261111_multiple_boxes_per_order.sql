create table if not exists public.order_packaging (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  packaging_format_id uuid not null references public.packaging_formats(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, packaging_format_id)
);

create index if not exists order_packaging_order_id_idx on public.order_packaging(order_id);
create index if not exists order_packaging_format_id_idx on public.order_packaging(packaging_format_id);

alter table public.order_packaging enable row level security;

drop policy if exists order_packaging_select_authenticated on public.order_packaging;
create policy order_packaging_select_authenticated
on public.order_packaging for select to authenticated
using ((select auth.uid()) is not null);

drop policy if exists order_packaging_insert_authenticated on public.order_packaging;
create policy order_packaging_insert_authenticated
on public.order_packaging for insert to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists order_packaging_update_authenticated on public.order_packaging;
create policy order_packaging_update_authenticated
on public.order_packaging for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists order_packaging_delete_authenticated on public.order_packaging;
create policy order_packaging_delete_authenticated
on public.order_packaging for delete to authenticated
using ((select auth.uid()) is not null);

grant select,insert,update,delete on public.order_packaging to authenticated;

CREATE OR REPLACE FUNCTION public.apply_order_pricing(p_order_id uuid, p_promo_type text DEFAULT NULL::text, p_promo_value numeric DEFAULT 0, p_promo_label text DEFAULT NULL::text, p_delivery_fee numeric DEFAULT 0, p_free_delivery boolean DEFAULT false)
 RETURNS orders
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_sale public.sales%rowtype;
  v_format public.product_formats%rowtype;
  v_packaging public.packaging_formats%rowtype;
  v_list_subtotal numeric := 0;
  v_subtotal numeric := 0;
  v_total_units integer := 0;
  v_packed_units integer := 0;
  v_box_subtotal numeric := 0;
  v_box_rounded_30_total numeric := 0;
  v_full_boxes integer := 0;
  v_remainder_units integer := 0;
  v_avg_unit_price numeric := 0;
  v_scale numeric := 1;
  v_base numeric;
  v_cost numeric;
  v_discount numeric;
  v_discount_total numeric := 0;
  v_products_total numeric := 0;
  v_product_margin numeric := 0;
  v_fixed numeric := 0;
  v_delivery_charged numeric := 0;
  v_delivery_cost numeric := 0;
  v_bogo_free_remaining integer := 0;
  v_free_qty integer := 0;
  v_rounded_unit_price numeric := 0;
  v_target_products_total numeric := null;
  v_line_count integer := 0;
  v_line_index integer := 0;
  v_line_total numeric := 0;
  v_has_multi_packaging boolean := false;
  v_last_sale_id uuid := null;
  v_rounding_delta numeric := 0;
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

  select coalesce(sum(qty*price_per_unit),0), coalesce(sum(qty),0)::integer, count(*)::integer
  into v_list_subtotal, v_total_units, v_line_count
  from public.sales
  where order_id=p_order_id;

  v_subtotal := v_list_subtotal;
  v_avg_unit_price := case when v_total_units>0 then v_list_subtotal / v_total_units else 0 end;

  select
    count(*)>0,
    coalesce(sum(op.quantity*pf.capacity),0)::integer,
    coalesce(sum(op.quantity*pf.sale_price),0),
    coalesce(sum(op.quantity*(round((pf.sale_price*0.70)*2,0)/2)),0)
  into v_has_multi_packaging, v_packed_units, v_box_subtotal, v_box_rounded_30_total
  from public.order_packaging op
  join public.packaging_formats pf on pf.id=op.packaging_format_id
  where op.order_id=p_order_id
    and pf.active=true
    and pf.sale_price is not null;

  if v_has_multi_packaging then
    if v_packed_units > v_total_units then
      raise exception 'Capacité des box (%) supérieure au nombre de cookies (%)', v_packed_units, v_total_units;
    end if;

    v_remainder_units := v_total_units-v_packed_units;
    v_subtotal := round(v_box_subtotal + (v_remainder_units*v_avg_unit_price),3);

    if p_promo_type='percent' and coalesce(p_promo_value,0)=30 then
      v_target_products_total := round(
        v_box_rounded_30_total +
        (v_remainder_units*(round((v_avg_unit_price*0.70)*2,0)/2))
      ,3);
    end if;
  elsif v_order.packaging_format_id is not null and v_total_units > 0 then
    select * into v_packaging
    from public.packaging_formats
    where id=v_order.packaging_format_id and active=true;

    if found and v_packaging.capacity > 0 and v_packaging.sale_price is not null then
      v_full_boxes := floor(v_total_units::numeric / v_packaging.capacity)::integer;
      v_remainder_units := mod(v_total_units, v_packaging.capacity);
      if v_full_boxes > 0 then
        v_subtotal := round(
          (v_full_boxes * v_packaging.sale_price) +
          (v_remainder_units * v_avg_unit_price)
        ,3);
      end if;

      if p_promo_type='percent' and coalesce(p_promo_value,0)=30 and v_full_boxes>0 then
        v_target_products_total := round(
          (v_full_boxes * (round((v_packaging.sale_price * 0.70) * 2,0) / 2)) +
          (v_remainder_units * (round((v_avg_unit_price * 0.70) * 2,0) / 2))
        ,3);
      end if;
    end if;
  end if;

  v_scale := case when v_list_subtotal>0 then v_subtotal/v_list_subtotal else 1 end;

  if p_promo_type='fixed' then
    v_fixed := least(coalesce(p_promo_value,0), v_subtotal);
  elsif p_promo_type='bogo' then
    v_bogo_free_remaining := floor(v_total_units/2.0)::integer;
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
    v_line_index := v_line_index + 1;
    v_last_sale_id := v_sale.id;
    v_base := round(v_sale.qty*v_sale.price_per_unit*v_scale,3);

    select * into v_format from public.product_formats where id=v_sale.format_id;

    select coalesce(sum(r.qty_per_cookie*i.price_per_unit),0) * coalesce(v_format.cost_factor,1) * v_sale.qty
      into v_cost
    from public.recipes r
    join public.ingredients i on i.id=r.ingredient_id
    where r.variety_id=v_sale.variety_id;

    v_discount := 0;
    if p_promo_type='percent' then
      if v_target_products_total is not null and v_subtotal>0 then
        if v_line_index=v_line_count then
          v_line_total := greatest(0, v_target_products_total-v_products_total);
        else
          v_line_total := round(v_base * v_target_products_total / v_subtotal,3);
        end if;
        v_discount := round(v_base-v_line_total,3);
      elsif coalesce(p_promo_value,0)=30 and v_sale.qty>0 then
        v_rounded_unit_price := round((((v_base / v_sale.qty) * 0.70) * 2),0) / 2;
        v_discount := round(v_base - (v_rounded_unit_price * v_sale.qty),3);
      else
        v_discount := round(v_base * coalesce(p_promo_value,0) / 100,3);
      end if;
    elsif p_promo_type='fixed' and v_subtotal>0 then
      v_discount := round(v_fixed * v_base / v_subtotal,3);
    elsif p_promo_type='bogo' and v_bogo_free_remaining>0 then
      v_free_qty := least(v_sale.qty, v_bogo_free_remaining);
      v_discount := round(v_free_qty * v_sale.price_per_unit * v_scale,3);
      v_bogo_free_remaining := v_bogo_free_remaining - v_free_qty;
    end if;

    v_discount := greatest(0,least(v_discount,v_base));
    v_line_total := round(v_base-v_discount,3);

    update public.sales
    set total_amount = v_line_total,
        margin = round(v_line_total-coalesce(v_cost,0),3),
        margin_pct = case when v_line_total>0
          then round(((v_line_total-coalesce(v_cost,0))/v_line_total)*100,1)
          else 0 end
    where id=v_sale.id;

    v_discount_total := v_discount_total + v_discount;
    v_products_total := v_products_total + v_line_total;
    v_product_margin := v_product_margin + (v_line_total-coalesce(v_cost,0));
  end loop;

  if p_promo_type='fixed' then
    v_discount_total := least(v_fixed,v_subtotal);
    v_products_total := v_subtotal-v_discount_total;
  end if;

  if p_promo_type is null
     and v_last_sale_id is not null
     and (v_has_multi_packaging or (v_order.packaging_format_id is not null and v_full_boxes>0))
     and round(v_products_total,3) <> round(v_subtotal,3) then
    v_rounding_delta := round(v_subtotal-v_products_total,3);
    update public.sales
    set total_amount=round(total_amount+v_rounding_delta,3),
        margin=round(margin+v_rounding_delta,3),
        margin_pct=case when (total_amount+v_rounding_delta)>0
          then round(((margin+v_rounding_delta)/(total_amount+v_rounding_delta))*100,1)
          else 0 end
    where id=v_last_sale_id;
    v_products_total := round(v_products_total+v_rounding_delta,3);
    v_product_margin := round(v_product_margin+v_rounding_delta,3);
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
$function$
;
