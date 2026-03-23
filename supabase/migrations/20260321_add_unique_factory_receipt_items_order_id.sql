do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'factory_receipt_items_order_unique_idx'
  ) then
    if not exists (
      select order_id
      from public.factory_receipt_items
      group by order_id
      having count(*) > 1
    ) then
      create unique index factory_receipt_items_order_unique_idx
        on public.factory_receipt_items (order_id);
    end if;
  end if;
end $$;
