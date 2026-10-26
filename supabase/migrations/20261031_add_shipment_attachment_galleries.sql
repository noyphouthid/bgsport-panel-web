begin;

alter table public.shipment_delivery_requests
  add column if not exists transfer_slips jsonb not null default '[]'::jsonb
    check (jsonb_typeof(transfer_slips) = 'array'),
  add column if not exists handoff_photos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(handoff_photos) = 'array');

-- Backfill once. Replaying the migration must not restore removed attachments.
update public.shipment_delivery_requests
set transfer_slips = jsonb_build_array(jsonb_build_object(
  'path', transfer_slip_path,
  'url', transfer_slip_url,
  'file_name', coalesce(nullif(regexp_replace(transfer_slip_path, '^.*/', ''), ''), 'transfer-slip')
))
where transfer_slip_url is not null and transfer_slips = '[]'::jsonb;

update public.shipment_delivery_requests
set handoff_photos = jsonb_build_array(jsonb_build_object(
  'path', handoff_photo_path,
  'url', handoff_photo_url,
  'file_name', coalesce(handoff_photo_file_name, nullif(regexp_replace(handoff_photo_path, '^.*/', ''), ''), 'handoff-photo')
))
where handoff_photo_url is not null and handoff_photos = '[]'::jsonb;

notify pgrst, 'reload schema';
commit;
