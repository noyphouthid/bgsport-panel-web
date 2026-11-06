begin;

-- One editable row holding the shop identity printed on quotations.
create table if not exists public.shop_settings (
  id boolean primary key default true check (id),
  shop_name text not null check (length(trim(shop_name)) between 1 and 200),
  phone text not null default '' check (length(phone) <= 200),
  address text not null default '' check (length(address) <= 500),
  logo_path text check (logo_path is null or logo_path ~ '^logo/[A-Za-z0-9._-]+$'),
  qr_path text check (qr_path is null or qr_path ~ '^qr/[A-Za-z0-9._-]+$')
);
insert into public.shop_settings (id, shop_name, phone, address)
values (true, 'ຮ້ານ ບີຈີ ສປອຮ໌ດ', '+856 20 9220 1288', 'ບ້ານ ໂພນຕ້ອງສະຫວາດ ມ. ຈັນທະບູລີ ນະຄອນຫຼວງວຽງຈັນ')
on conflict (id) do nothing;

create or replace function public.can_manage_shop_settings()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u where u.auth_user_id = (select auth.uid()) and u.is_active
    and (u.role = 'superadmin' or
      case coalesce(
        nullif(u.permission_settings->'access'->>'/settings/shop', 'inherit'),
        nullif(u.permission_settings->'access'->>'/settings', 'inherit'), 'inherit')
        when 'allow' then true when 'deny' then false else u.role = 'manager' end)
  );
$$;
revoke all on function public.can_manage_shop_settings() from public, anon;
grant execute on function public.can_manage_shop_settings() to authenticated;

alter table public.shop_settings enable row level security;
revoke all on public.shop_settings from public, anon, authenticated;
grant select, update on public.shop_settings to authenticated;
grant all on public.shop_settings to service_role;
drop policy if exists shop_settings_read on public.shop_settings;
create policy shop_settings_read on public.shop_settings for select to authenticated
  using (exists (select 1 from public.users u where u.auth_user_id = (select auth.uid()) and u.is_active));
drop policy if exists shop_settings_update on public.shop_settings;
create policy shop_settings_update on public.shop_settings for update to authenticated
  using ((select public.can_manage_shop_settings()))
  with check ((select public.can_manage_shop_settings()));

-- Logo and QR appear on documents given to customers, so the bucket is public.
-- SVG is excluded because a public SVG can run scripts when opened directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-branding', 'shop-branding', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists shop_branding_insert on storage.objects;
create policy shop_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-branding' and (select public.can_manage_shop_settings()));
drop policy if exists shop_branding_read on storage.objects;
create policy shop_branding_read on storage.objects for select to authenticated
  using (bucket_id = 'shop-branding' and (select public.can_manage_shop_settings()));
drop policy if exists shop_branding_delete on storage.objects;
create policy shop_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-branding' and (select public.can_manage_shop_settings()));

notify pgrst, 'reload schema';
commit;
