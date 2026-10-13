begin;

alter table public.shirt_catalog_entries
  add column if not exists caption_lo text not null default '' check (length(caption_lo) <= 1000),
  add column if not exists caption_en text not null default '' check (length(caption_en) <= 1000),
  add column if not exists slogan_lo text not null default '' check (length(slogan_lo) <= 200),
  add column if not exists slogan_en text not null default '' check (length(slogan_en) <= 200);

create table if not exists public.storefront_settings (
  id boolean primary key default true check (id),
  content jsonb not null default '{}' check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 50000),
  updated_at timestamptz not null default now()
);
insert into public.storefront_settings (id) values (true) on conflict do nothing;

create table if not exists public.storefront_promotions (
  id uuid primary key default gen_random_uuid(),
  name_lo text not null check (length(trim(name_lo)) between 1 and 200),
  name_en text not null default '' check (length(name_en) <= 200),
  caption_lo text not null default '' check (length(caption_lo) <= 1000),
  caption_en text not null default '' check (length(caption_en) <= 1000),
  slogan_lo text not null default '' check (length(slogan_lo) <= 200),
  slogan_en text not null default '' check (length(slogan_en) <= 200),
  images jsonb not null check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) = 1),
  link_url text not null default '' check (link_url = '' or link_url ~ '^/[^/]' or link_url ~ '^https://[^[:space:]]+$'),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.storefront_settings enable row level security;
alter table public.storefront_promotions enable row level security;
revoke all on public.storefront_settings, public.storefront_promotions from anon, authenticated;
grant select, insert, update, delete on public.storefront_settings, public.storefront_promotions to authenticated;
grant all on public.storefront_settings, public.storefront_promotions to service_role;
-- Policies deliberately share the catalog's access and edit permissions.
do $$ declare t text; begin
  foreach t in array array['storefront_settings','storefront_promotions'] loop
    execute format('drop policy if exists storefront_read on public.%I',t);
    execute format('create policy storefront_read on public.%I for select to authenticated using ((select public.can_manage_shirt_catalog(false)))',t);
    execute format('drop policy if exists storefront_write on public.%I',t);
    execute format('create policy storefront_write on public.%I for all to authenticated using ((select public.can_manage_shirt_catalog(true))) with check ((select public.can_manage_shirt_catalog(true)))',t);
  end loop;
end $$;
create or replace function public.touch_storefront_settings()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists touch_storefront_settings on public.storefront_settings;
create trigger touch_storefront_settings before update on public.storefront_settings
  for each row execute function public.touch_storefront_settings();
drop trigger if exists touch_storefront_promotion on public.storefront_promotions;
create trigger touch_storefront_promotion before insert or update on public.storefront_promotions
  for each row execute function public.touch_shirt_catalog_entry();

-- Extend the public interface without exposing library/customer metadata.
drop function if exists public.storefront_catalog(text, integer, integer);
create function public.storefront_catalog(p_channel text default 'catalog', p_limit integer default 60, p_offset integer default 0)
returns table(id uuid, design_code text, name_lo text, name_en text, description_lo text, description_en text,
  category text, images jsonb, price_lak numeric, is_featured boolean, created_at timestamptz,
  caption_lo text, caption_en text, slogan_lo text, slogan_en text)
language sql stable security definer set search_path = '' as $$
  select e.id,e.design_code,e.name_lo,e.name_en,e.description_lo,e.description_en,e.category,
    coalesce((select jsonb_agg(jsonb_build_object('url',i->>'url') order by n)
      from jsonb_array_elements(e.images) with ordinality as media(i,n)), '[]'::jsonb),
    case when p_channel = 'store' then e.price_lak else null end,e.is_featured,e.created_at,
    e.caption_lo,e.caption_en,e.slogan_lo,e.slogan_en
  from public.shirt_catalog_entries e
  where e.is_published and p_channel in ('catalog','store') and (e.placement=p_channel or e.placement='both')
  order by e.is_featured desc,e.created_at desc,e.id
  limit greatest(1,least(coalesce(p_limit,60),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.storefront_catalog(text,integer,integer) from public;
grant execute on function public.storefront_catalog(text,integer,integer) to anon,authenticated,service_role;

create or replace function public.storefront_content()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('content',coalesce((select content from public.storefront_settings where id),'{}'::jsonb),
    'promotions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name_lo',p.name_lo,'name_en',p.name_en,'caption_lo',p.caption_lo,'caption_en',p.caption_en,
      'slogan_lo',p.slogan_lo,'slogan_en',p.slogan_en,'link_url',p.link_url,
      'images',jsonb_build_array(jsonb_build_object('url',p.images->0->>'url'))) order by p.sort_order,p.created_at,p.id)
      from public.storefront_promotions p where p.is_published),'[]'::jsonb));
$$;
revoke all on function public.storefront_content() from public;
grant execute on function public.storefront_content() to anon,authenticated,service_role;

-- A whole batch succeeds or rolls back together; row policies still govern writes.
create or replace function public.publish_shirt_catalog_batch(p_entries jsonb)
returns setof uuid language plpgsql security invoker set search_path = '' as $$
declare item jsonb; saved_id uuid;
begin
  if not public.can_manage_shirt_catalog(true) then raise exception 'Publishing permission required' using errcode='42501'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception 'Select between 1 and 100 designs'; end if;
  for item in select value from jsonb_array_elements(p_entries) loop
    insert into public.shirt_catalog_entries(design_code,name_lo,name_en,category,placement,images,is_published)
    values(upper(trim(item->>'design_code')),trim(item->>'name_lo'),coalesce(item->>'name_en',''),item->>'category',
      coalesce(item->>'placement','catalog'),item->'images',true)
    on conflict(design_code) do update set name_lo=excluded.name_lo,name_en=excluded.name_en,
      category=excluded.category,placement=excluded.placement,images=excluded.images,is_published=true
    returning id into saved_id;
    return next saved_id;
  end loop;
end; $$;
revoke all on function public.publish_shirt_catalog_batch(jsonb) from public,anon;
grant execute on function public.publish_shirt_catalog_batch(jsonb) to authenticated;

create or replace function public.shirt_catalog_media_in_use(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.shirt_catalog_entries e,lateral jsonb_array_elements(e.images) image
    where image->>'bucket'=p_bucket and image->>'path'=p_path)
  or exists(select 1 from public.storefront_promotions p,lateral jsonb_array_elements(p.images) image
    where image->>'bucket'=p_bucket and image->>'path'=p_path);
$$;
-- Include promotions when protecting uploads in the catalog bucket.
drop policy if exists shirt_catalog_media_delete on storage.objects;
create policy shirt_catalog_media_delete on storage.objects for delete to authenticated
  using(bucket_id='shirt-catalog' and (select public.can_manage_shirt_catalog(true))
    and not public.shirt_catalog_media_in_use(bucket_id,name));
notify pgrst,'reload schema';
commit;
