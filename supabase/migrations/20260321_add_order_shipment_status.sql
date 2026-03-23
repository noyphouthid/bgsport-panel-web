alter table public.orders
  add column if not exists shipment_status text not null default 'pending',
  add column if not exists shipment_completed_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shipment_status_check'
  ) then
    alter table public.orders
      add constraint orders_shipment_status_check
      check (shipment_status in ('pending', 'shipped'));
  end if;
end $$;

update public.orders
set
  shipment_status = case
    when shipment_completed_at is not null then 'shipped'
    else 'pending'
  end
where shipment_status is distinct from case
  when shipment_completed_at is not null then 'shipped'
  else 'pending'
end;
