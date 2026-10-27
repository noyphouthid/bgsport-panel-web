begin;

alter table public.transport_notes
  add column if not exists cod_enabled boolean not null default false,
  add column if not exists cod_amount numeric(15,2) not null default 0;

alter table public.shipment_delivery_requests
  add column if not exists transport_cod_enabled boolean not null default false,
  add column if not exists transport_cod_amount numeric(15,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transport_notes_cod_check' and conrelid = 'public.transport_notes'::regclass) then
    alter table public.transport_notes add constraint transport_notes_cod_check
      check ((cod_enabled and cod_amount > 0) or (not cod_enabled and cod_amount = 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipment_delivery_requests_cod_check' and conrelid = 'public.shipment_delivery_requests'::regclass) then
    alter table public.shipment_delivery_requests add constraint shipment_delivery_requests_cod_check
      check ((transport_cod_enabled and transport_cod_amount > 0 and delivery_method = 'transport') or (not transport_cod_enabled and transport_cod_amount = 0));
  end if;
end;
$$;

comment on column public.transport_notes.cod_amount is 'Amount to collect on delivery, in LAK. Printing this amount does not record a payment.';
comment on column public.shipment_delivery_requests.transport_cod_amount is 'Transport COD amount in LAK, separate from payments already received.';

notify pgrst, 'reload schema';
commit;
