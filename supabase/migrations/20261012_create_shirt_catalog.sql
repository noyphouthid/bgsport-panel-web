-- Public storefront and internal publishing share media, never order/customer data.
begin;

create table if not exists public.shirt_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  design_code text not null unique check (design_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$'),
  name_lo text not null check (length(trim(name_lo)) between 1 and 200),
  name_en text not null default '' check (length(name_en) <= 200),
  description_lo text not null default '' check (length(description_lo) <= 5000),
  description_en text not null default '' check (length(description_en) <= 5000),
  category text not null check (category in ('football','volleyball','basketball','polo','teamwear')),
  placement text not null default 'catalog' check (placement in ('catalog','store','both')),
  price_lak numeric(14,2) null check (price_lak is null or price_lak > 0),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12),
  is_published boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_shirt_has_image check (not is_published or jsonb_array_length(images) > 0)
);

create index if not exists shirt_catalog_published_idx
  on public.shirt_catalog_entries (category, created_at desc) where is_published;

-- Explicit access/edit permissions take priority over the role default.
create or replace function public.can_manage_shirt_catalog(p_edit boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid()) and u.is_active
      and (
        u.role = 'superadmin'
        or (
          case coalesce(u.permission_settings->'access'->>'/shirt-catalog', 'inherit')
            when 'deny' then false
            when 'allow' then u.role in ('admin','manager','staff','graphic')
            else u.role in ('admin','manager')
          end
          and (not p_edit or coalesce(u.permission_settings->'edit'->>'shirt_catalog', 'inherit') <> 'deny')
        )
      )
  );
$$;
revoke all on function public.can_manage_shirt_catalog(boolean) from public, anon;
grant execute on function public.can_manage_shirt_catalog(boolean) to authenticated;

alter table public.shirt_catalog_entries enable row level security;
revoke all on public.shirt_catalog_entries from anon, authenticated;
grant select, insert, update, delete on public.shirt_catalog_entries to authenticated;
grant all on public.shirt_catalog_entries to service_role;

drop policy if exists shirt_catalog_read on public.shirt_catalog_entries;
create policy shirt_catalog_read on public.shirt_catalog_entries for select to authenticated
  using ((select public.can_manage_shirt_catalog(false)));
drop policy if exists shirt_catalog_insert on public.shirt_catalog_entries;
create policy shirt_catalog_insert on public.shirt_catalog_entries for insert to authenticated
  with check ((select public.can_manage_shirt_catalog(true)));
drop policy if exists shirt_catalog_update on public.shirt_catalog_entries;
create policy shirt_catalog_update on public.shirt_catalog_entries for update to authenticated
  using ((select public.can_manage_shirt_catalog(true)))
  with check ((select public.can_manage_shirt_catalog(true)));
drop policy if exists shirt_catalog_delete on public.shirt_catalog_entries;
create policy shirt_catalog_delete on public.shirt_catalog_entries for delete to authenticated
  using ((select public.can_manage_shirt_catalog(true)));

create or replace function public.touch_shirt_catalog_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Validate every media URL, including writes that bypass the UI.
  if exists (select 1 from jsonb_array_elements(new.images) image
    where jsonb_typeof(image) <> 'object'
      or coalesce(image->>'url', '') !~ '^https://[^[:space:]]+$') then
    raise exception 'Catalog images must use HTTPS URLs';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists touch_shirt_catalog_entry on public.shirt_catalog_entries;
create trigger touch_shirt_catalog_entry before insert or update on public.shirt_catalog_entries
  for each row execute function public.touch_shirt_catalog_entry();

-- Narrow public read interface. No permissions to read the underlying table.
-- Prices are returned only for Store requests. Source media metadata is stripped.
create or replace function public.storefront_catalog(
  p_channel text default 'catalog', p_limit integer default 60, p_offset integer default 0
)
returns table (
  id uuid, design_code text, name_lo text, name_en text,
  description_lo text, description_en text, category text,
  images jsonb, price_lak numeric, is_featured boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.design_code, e.name_lo, e.name_en,
    e.description_lo, e.description_en, e.category,
    coalesce((select jsonb_agg(jsonb_build_object('url', i->>'url') order by n)
      from jsonb_array_elements(e.images) with ordinality as media(i,n)), '[]'::jsonb),
    case when p_channel = 'store' then e.price_lak else null end,
    e.is_featured, e.created_at
  from public.shirt_catalog_entries e
  where e.is_published and p_channel in ('catalog','store')
    and (e.placement = p_channel or e.placement = 'both')
  order by e.is_featured desc, e.created_at desc, e.id
  limit greatest(1, least(coalesce(p_limit, 60), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;
revoke all on function public.storefront_catalog(text, integer, integer) from public;
grant execute on function public.storefront_catalog(text, integer, integer) to anon, authenticated, service_role;

-- Direct catalog uploads live in their own bucket; existing queue images are linked.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shirt-catalog', 'shirt-catalog', true, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists shirt_catalog_media_insert on storage.objects;
create policy shirt_catalog_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shirt-catalog' and (select public.can_manage_shirt_catalog(true)));
drop policy if exists shirt_catalog_media_read on storage.objects;
create policy shirt_catalog_media_read on storage.objects for select to authenticated
  using (bucket_id = 'shirt-catalog' and (select public.can_manage_shirt_catalog(false)));
drop policy if exists shirt_catalog_media_delete on storage.objects;
create policy shirt_catalog_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shirt-catalog' and (select public.can_manage_shirt_catalog(true))
    and not exists (select 1 from public.shirt_catalog_entries e
      where e.images @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))));

-- Shared media must survive queue cleanup while any catalog entry still uses it.
create or replace function public.shirt_catalog_media_in_use(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shirt_catalog_entries e,
    lateral jsonb_array_elements(e.images) image
    where image->>'bucket' = p_bucket and image->>'path' = p_path);
$$;
revoke all on function public.shirt_catalog_media_in_use(text, text) from public;
grant execute on function public.shirt_catalog_media_in_use(text, text) to anon, authenticated, service_role;
drop policy if exists protect_shared_shirt_catalog_media on storage.objects;
create policy protect_shared_shirt_catalog_media on storage.objects as restrictive
  for delete to public using (
    not public.shirt_catalog_media_in_use(bucket_id, name)
  );

notify pgrst, 'reload schema';
commit;
