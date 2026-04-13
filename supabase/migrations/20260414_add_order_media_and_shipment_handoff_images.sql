alter table public.orders
  add column if not exists order_image_path text null,
  add column if not exists order_image_url text null,
  add column if not exists order_image_file_name text null,
  add column if not exists order_transfer_slip_path text null,
  add column if not exists order_transfer_slip_url text null,
  add column if not exists order_transfer_slip_file_name text null;

alter table public.shipment_delivery_requests
  add column if not exists handoff_photo_path text null,
  add column if not exists handoff_photo_url text null,
  add column if not exists handoff_photo_file_name text null,
  add column if not exists handoff_photo_uploaded_at timestamptz null,
  add column if not exists handoff_photo_uploaded_by_user_id uuid null references public.users (id) on delete set null;

insert into storage.buckets (id, name, public)
values ('order-media', 'order-media', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'order_media_select_all'
  ) then
    create policy order_media_select_all
      on storage.objects
      for select
      using (bucket_id = 'order-media');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'order_media_insert_all'
  ) then
    create policy order_media_insert_all
      on storage.objects
      for insert
      with check (bucket_id = 'order-media');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'order_media_update_all'
  ) then
    create policy order_media_update_all
      on storage.objects
      for update
      using (bucket_id = 'order-media')
      with check (bucket_id = 'order-media');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'order_media_delete_all'
  ) then
    create policy order_media_delete_all
      on storage.objects
      for delete
      using (bucket_id = 'order-media');
  end if;
end $$;
