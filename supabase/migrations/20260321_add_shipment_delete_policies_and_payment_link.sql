alter table public.payment_transactions
  add column if not exists shipment_id uuid null references public.shipment_records (id) on delete set null;

create index if not exists payment_transactions_shipment_id_idx
  on public.payment_transactions (shipment_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_records'
      and policyname = 'shipment_records_delete_all'
  ) then
    create policy shipment_records_delete_all
      on public.shipment_records
      for delete
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_payments'
      and policyname = 'shipment_payments_delete_all'
  ) then
    create policy shipment_payments_delete_all
      on public.shipment_payments
      for delete
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_transactions'
      and policyname = 'payment_transactions_delete_all'
  ) then
    create policy payment_transactions_delete_all
      on public.payment_transactions
      for delete
      using (true);
  end if;
end $$;
