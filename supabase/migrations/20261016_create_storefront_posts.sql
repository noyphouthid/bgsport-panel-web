-- Apply after 20261013_storefront_management.sql. Safe to run again.
-- Shop-authored customer-photo reviews and fabric showcases, not public submissions.
begin;

create table if not exists public.storefront_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('review','fabric')),
  title_lo text not null check (length(trim(title_lo)) between 1 and 200),
  title_en text not null default '' check (length(title_en) <= 200),
  description_lo text not null default '' check (length(description_lo) <= 5000),
  description_en text not null default '' check (length(description_en) <= 5000),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_storefront_post_has_image check (not is_published or jsonb_array_length(images) > 0)
);
create index if not exists storefront_posts_public_order_idx
  on public.storefront_posts(kind,sort_order,created_at desc,id) where is_published;

alter table public.storefront_posts enable row level security;
revoke all on public.storefront_posts from public,anon,authenticated;
grant select,insert,update,delete on public.storefront_posts to authenticated;
grant all on public.storefront_posts to service_role;
drop policy if exists storefront_posts_read on public.storefront_posts;
create policy storefront_posts_read on public.storefront_posts for select to authenticated
  using ((select public.can_manage_shirt_catalog(false)));
drop policy if exists storefront_posts_write on public.storefront_posts;
create policy storefront_posts_write on public.storefront_posts for all to authenticated
  using ((select public.can_manage_shirt_catalog(true)))
  with check ((select public.can_manage_shirt_catalog(true)));
drop trigger if exists touch_storefront_post on public.storefront_posts;
create trigger touch_storefront_post before insert or update on public.storefront_posts
  for each row execute function public.touch_shirt_catalog_entry();

-- Only published display fields and image URLs reach visitors. Storage paths,
-- original filenames and any private source metadata stay in the admin table.
create or replace function public.storefront_posts_feed(
  p_kind text, p_limit integer default 24, p_offset integer default 0, p_query text default ''
)
returns table(id uuid,kind text,title_lo text,title_en text,description_lo text,description_en text,images jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id,p.kind,p.title_lo,p.title_en,p.description_lo,p.description_en,
    coalesce((select jsonb_agg(jsonb_build_object('url',image->>'url') order by position)
      from jsonb_array_elements(p.images) with ordinality as media(image,position)), '[]'::jsonb)
  from public.storefront_posts p
  where p.is_published and p.kind=p_kind and p_kind in ('review','fabric')
    and (trim(coalesce(p_query,''))='' or strpos(lower(concat_ws(' ',p.title_lo,p.title_en,p.description_lo,p.description_en)),lower(left(trim(p_query),200)))>0)
  order by p.sort_order,p.created_at desc,p.id
  limit greatest(1,least(coalesce(p_limit,24),60)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.storefront_posts_feed(text,integer,integer,text) from public;
grant execute on function public.storefront_posts_feed(text,integer,integer,text) to anon,authenticated,service_role;

-- Keep linked photos safe even when a draft uses them. Existing cleanup policies
-- already use this predicate, so extend it without weakening their access rules.
create or replace function public.shirt_catalog_media_in_use(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.shirt_catalog_entries e,lateral jsonb_array_elements(e.images) image
    where image->>'bucket'=p_bucket and image->>'path'=p_path)
  or exists(select 1 from public.storefront_promotions p,lateral jsonb_array_elements(p.images) image
    where image->>'bucket'=p_bucket and image->>'path'=p_path)
  or exists(select 1 from public.storefront_posts p,lateral jsonb_array_elements(p.images) image
    where image->>'bucket'=p_bucket and image->>'path'=p_path);
$$;
notify pgrst,'reload schema';
commit;
