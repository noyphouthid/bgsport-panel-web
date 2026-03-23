with latest_shipments as (
  select
    sr.order_id,
    max(sr.shipped_at) as latest_shipped_at
  from public.shipment_records sr
  group by sr.order_id
)
update public.orders o
set
  shipment_completed_at = ls.latest_shipped_at,
  shipment_status = 'shipped'
from latest_shipments ls
where o.id = ls.order_id
  and (
    o.shipment_completed_at is distinct from ls.latest_shipped_at
    or o.shipment_status is distinct from 'shipped'
  );

update public.orders
set shipment_status = 'pending'
where shipment_completed_at is null
  and shipment_status is distinct from 'pending';
