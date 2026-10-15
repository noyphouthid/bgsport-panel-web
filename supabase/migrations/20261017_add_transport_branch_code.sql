begin;

alter table public.transport_notes
  add column if not exists branch_code text;

alter table public.shipment_delivery_requests
  add column if not exists transport_branch_code text;

comment on column public.transport_notes.branch_code is
  'Carrier branch code captured when the transport note is saved.';
comment on column public.shipment_delivery_requests.transport_branch_code is
  'Carrier branch code captured with the transport destination.';

notify pgrst, 'reload schema';

commit;
