-- Apply after 20261016_create_storefront_posts.sql. Safe to run again.
begin;
alter table public.storefront_posts drop constraint if exists storefront_posts_kind_check;
alter table public.storefront_posts add constraint storefront_posts_kind_check check (kind in ('review','fabric','collar'));
alter table public.storefront_posts add column if not exists collar_pricing text not null default 'standard';
alter table public.storefront_posts add column if not exists surcharge_lak numeric(14,2) not null default 0;
alter table public.storefront_posts drop constraint if exists storefront_posts_collar_pricing_check;
alter table public.storefront_posts add constraint storefront_posts_collar_pricing_check check (
  surcharge_lak between 0 and 999999999999.99 and (
  (collar_pricing='standard' and surcharge_lak=0)
  or (kind='collar' and collar_pricing='extra' and surcharge_lak>0))
);

-- The new optional filter preserves existing review/fabric calls. Only the
-- public display fields and image URLs are returned, as before.
drop function if exists public.storefront_posts_feed(text,integer,integer,text);
drop function if exists public.storefront_posts_feed(text,integer,integer,text,text);
create function public.storefront_posts_feed(
  p_kind text, p_limit integer default 24, p_offset integer default 0,
  p_query text default '', p_pricing text default 'all'
)
returns table(id uuid,kind text,title_lo text,title_en text,description_lo text,description_en text,
  images jsonb,collar_pricing text,surcharge_lak numeric)
language sql stable security definer set search_path = '' as $$
  select p.id,p.kind,p.title_lo,p.title_en,p.description_lo,p.description_en,
    coalesce((select jsonb_agg(jsonb_build_object('url',image->>'url') order by position)
      from jsonb_array_elements(p.images) with ordinality as media(image,position)), '[]'::jsonb),
    p.collar_pricing,p.surcharge_lak
  from public.storefront_posts p
  where p.is_published and p.kind=p_kind and p_kind in ('review','fabric','collar')
    and (p_kind<>'collar' or p_pricing='all' or p.collar_pricing=p_pricing)
    and (trim(coalesce(p_query,''))='' or strpos(lower(concat_ws(' ',p.title_lo,p.title_en,p.description_lo,p.description_en)),lower(left(trim(p_query),200)))>0)
  order by p.sort_order,p.created_at desc,p.id
  limit greatest(1,least(coalesce(p_limit,24),60)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.storefront_posts_feed(text,integer,integer,text,text) from public;
grant execute on function public.storefront_posts_feed(text,integer,integer,text,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
