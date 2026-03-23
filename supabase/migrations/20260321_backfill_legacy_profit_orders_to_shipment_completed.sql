update public.orders
set
  shipment_completed_at = production_completed_at,
  shipment_status = 'shipped'
where production_completed_at is not null
  and shipment_completed_at is null;
