-- M 60 g has passed validation and is now an active format.
update public.product_formats
set status='active', updated_at=now()
where code='M' and weight_g=60;
