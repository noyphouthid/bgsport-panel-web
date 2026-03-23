insert into storage.buckets (id, name, public)
values ('factory-deposit-slips', 'factory-deposit-slips', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'factory_deposit_slips_select_all'
  ) then
    create policy factory_deposit_slips_select_all
      on storage.objects
      for select
      using (bucket_id = 'factory-deposit-slips');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'factory_deposit_slips_insert_all'
  ) then
    create policy factory_deposit_slips_insert_all
      on storage.objects
      for insert
      with check (bucket_id = 'factory-deposit-slips');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'factory_deposit_slips_update_all'
  ) then
    create policy factory_deposit_slips_update_all
      on storage.objects
      for update
      using (bucket_id = 'factory-deposit-slips')
      with check (bucket_id = 'factory-deposit-slips');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'factory_deposit_slips_delete_all'
  ) then
    create policy factory_deposit_slips_delete_all
      on storage.objects
      for delete
      using (bucket_id = 'factory-deposit-slips');
  end if;
end $$;
