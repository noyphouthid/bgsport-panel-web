insert into storage.buckets (id, name, public)
values ('shipment-delivery-slips', 'shipment-delivery-slips', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'shipment_delivery_slips_select_all'
  ) then
    create policy shipment_delivery_slips_select_all
      on storage.objects
      for select
      using (bucket_id = 'shipment-delivery-slips');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'shipment_delivery_slips_insert_all'
  ) then
    create policy shipment_delivery_slips_insert_all
      on storage.objects
      for insert
      with check (bucket_id = 'shipment-delivery-slips');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'shipment_delivery_slips_update_all'
  ) then
    create policy shipment_delivery_slips_update_all
      on storage.objects
      for update
      using (bucket_id = 'shipment-delivery-slips')
      with check (bucket_id = 'shipment-delivery-slips');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'shipment_delivery_slips_delete_all'
  ) then
    create policy shipment_delivery_slips_delete_all
      on storage.objects
      for delete
      using (bucket_id = 'shipment-delivery-slips');
  end if;
end $$;
