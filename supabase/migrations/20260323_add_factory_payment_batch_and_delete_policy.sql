alter table public.factory_payments
  add column if not exists batch_id uuid null;

create index if not exists factory_payments_batch_id_idx
  on public.factory_payments (batch_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_payments'
      and policyname = 'factory_payments_delete_all'
  ) then
    create policy factory_payments_delete_all
      on public.factory_payments
      for delete
      using (true);
  end if;
end $$;
