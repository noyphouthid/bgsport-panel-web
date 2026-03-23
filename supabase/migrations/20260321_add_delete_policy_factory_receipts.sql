do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_receipts'
      and policyname = 'factory_receipts_delete_all'
  ) then
    create policy factory_receipts_delete_all
      on public.factory_receipts
      for delete
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_receipt_items'
      and policyname = 'factory_receipt_items_delete_all'
  ) then
    create policy factory_receipt_items_delete_all
      on public.factory_receipt_items
      for delete
      using (true);
  end if;
end $$;
