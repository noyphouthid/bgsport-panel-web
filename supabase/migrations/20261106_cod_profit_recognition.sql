begin;

alter table public.orders
  add column if not exists profit_recognized_at timestamptz,
  add column if not exists has_transport_cod boolean not null default false,
  add column if not exists cod_pending_count integer not null default 0;

-- Compute from canonical COD items so request/note snapshots count only once.
-- This runs with database privileges: report totals must not depend on whether
-- an employee has permission to open the COD management page.
create or replace function public.set_order_profit_recognition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_pending integer; v_received_at timestamptz;
begin
  select count(*)::integer, count(*) filter (where c.received_at is null)::integer,
    max(c.received_at)
  into v_count, v_pending, v_received_at
  from public.transport_cod_items i
  left join public.transport_cod_receipts c on
    (i.delivery_request_id is not null and c.delivery_request_id = i.delivery_request_id)
    or c.transport_note_id = i.transport_note_id
  where i.order_id = new.id;

  new.has_transport_cod := v_count > 0;
  new.cod_pending_count := v_pending;
  new.profit_recognized_at := case
    when v_count = 0 then new.shipment_completed_at
    when v_pending = 0 then v_received_at
    else null end;
  return new;
end;
$$;
drop trigger if exists set_order_profit_recognition on public.orders;
create trigger set_order_profit_recognition
  before insert or update of shipment_completed_at, profit_recognized_at, has_transport_cod, cod_pending_count
  on public.orders for each row execute function public.set_order_profit_recognition();

-- Refresh both old and new associations when COD sources are edited, linked,
-- removed or receipted. A receipt and its recognition date commit atomically.
create or replace function public.refresh_order_profit_recognition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb; v_order_id uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  for v_order_id in
    with request_ids as (
      select nullif(v_old->>'delivery_request_id','')::uuid as id
      union select nullif(v_new->>'delivery_request_id','')::uuid
      union select nullif(v_old->>'id','')::uuid where tg_table_name = 'shipment_delivery_requests'
      union select nullif(v_new->>'id','')::uuid where tg_table_name = 'shipment_delivery_requests'
    ), note_ids as (
      select nullif(v_old->>'transport_note_id','')::uuid as id
      union select nullif(v_new->>'transport_note_id','')::uuid
      union select nullif(v_old->>'id','')::uuid where tg_table_name = 'transport_notes'
      union select nullif(v_new->>'id','')::uuid where tg_table_name = 'transport_notes'
    ), affected as (
      select nullif(v_old->>'order_id','')::uuid as id
      union select nullif(v_new->>'order_id','')::uuid
      union select r.order_id from public.shipment_delivery_requests r
        where r.id in (select id from request_ids)
          or r.id in (select n.delivery_request_id from public.transport_notes n where n.id in (select id from note_ids))
      union select n.order_id from public.transport_notes n where n.id in (select id from note_ids)
    ) select distinct id from affected where id is not null order by id
  loop
    update public.orders set profit_recognized_at = profit_recognized_at where id = v_order_id;
  end loop;
  return null;
end;
$$;
drop trigger if exists refresh_order_profit_recognition on public.transport_notes;
create trigger refresh_order_profit_recognition after insert or delete
  or update of cod_enabled, cod_amount, order_id, delivery_request_id
  on public.transport_notes for each row execute function public.refresh_order_profit_recognition();
drop trigger if exists refresh_order_profit_recognition on public.shipment_delivery_requests;
create trigger refresh_order_profit_recognition after insert or delete
  or update of transport_cod_enabled, transport_cod_amount, delivery_method, order_id
  on public.shipment_delivery_requests for each row execute function public.refresh_order_profit_recognition();
drop trigger if exists refresh_order_profit_recognition on public.transport_cod_receipts;
create trigger refresh_order_profit_recognition after insert or update or delete
  on public.transport_cod_receipts for each row execute function public.refresh_order_profit_recognition();

-- Recompute existing orders without changing delivery dates or payment logs.
update public.orders set profit_recognized_at = profit_recognized_at;
create index if not exists orders_profit_recognized_at_idx
  on public.orders(profit_recognized_at, id) where profit_recognized_at is not null;

-- Closing uses a fresh database snapshot, including COD collected for orders
-- created in earlier months. Existing closed snapshots are kept until reclosed.
create or replace function public.snapshot_monthly_recognized_profit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_sales numeric; v_cost numeric; v_count integer;
  v_completed integer; v_balance numeric;
begin
  if new.status <> 'closed' then return new; end if;
  select coalesce(sum(o.net_total),0), coalesce(sum(o.factory_cost),0), count(*)::integer,
    count(*) filter (where o.shipment_completed_at is not null)::integer,
    coalesce(sum(o.balance),0), coalesce(jsonb_agg(jsonb_build_object(
      'id',o.id, 'order_code',o.order_code, 'order_date',o.order_date,
      'status',o.status, 'net_total',o.net_total, 'factory_cost',o.factory_cost,
      'balance',o.balance, 'profit_recognized_at',o.profit_recognized_at,
      'has_transport_cod',o.has_transport_cod
    ) order by o.profit_recognized_at,o.id),'[]'::jsonb)
  into v_sales,v_cost,v_count,v_completed,v_balance,v_rows
  from public.orders o
  where o.profit_recognized_at >= (new.start_date::timestamp at time zone 'Asia/Vientiane')
    and o.profit_recognized_at < ((new.end_date + 1)::timestamp at time zone 'Asia/Vientiane');
  new.total_sales := v_sales; new.total_cost := v_cost;
  new.total_profit := v_sales - v_cost; new.total_orders := v_count;
  new.completed_orders := v_completed; new.outstanding_balance := v_balance;
  new.summary_snapshot := coalesce(new.summary_snapshot,'{}'::jsonb) || jsonb_build_object(
    'recognition_basis','cod_receipt_v1', 'orders',v_rows);
  return new;
end;
$$;
drop trigger if exists snapshot_monthly_recognized_profit on public.monthly_closings;
create trigger snapshot_monthly_recognized_profit
  before insert or update of status, start_date, end_date, total_profit, summary_snapshot
  on public.monthly_closings for each row execute function public.snapshot_monthly_recognized_profit();

revoke all on function public.set_order_profit_recognition() from public,anon,authenticated;
revoke all on function public.refresh_order_profit_recognition() from public,anon,authenticated;
revoke all on function public.snapshot_monthly_recognized_profit() from public,anon,authenticated;
comment on column public.orders.profit_recognized_at is
  'COD: latest receipt time after every COD item is received via shipments/cod. Other orders: shipment completion time.';
notify pgrst, 'reload schema';
commit;
