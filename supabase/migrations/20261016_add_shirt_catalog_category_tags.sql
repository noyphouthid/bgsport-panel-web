-- Apply after 20261014_create_storefront_categories.sql. Safe to run again.
begin;

alter table public.shirt_catalog_entries add column if not exists category_ids text[];
update public.shirt_catalog_entries set category_ids = array[category]
  where category_ids is null;

-- Keep the original category for compatibility with older publishers. The first
-- selected tag supplies that value; old clients changing it retain other tags.
create or replace function public.normalize_shirt_catalog_categories()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_ids is null then
    new.category_ids := array[new.category];
  elsif tg_op = 'UPDATE' then
    if new.category is distinct from old.category
      and new.category_ids is not distinct from old.category_ids then
      new.category_ids := array_replace(new.category_ids, old.category, new.category);
    end if;
  end if;
  if cardinality(new.category_ids) = 0 or array_ndims(new.category_ids) <> 1
    or exists (select 1 from unnest(new.category_ids) id where id is null or trim(id) = '') then
    raise exception 'Select at least one valid shirt category' using errcode = '23514';
  end if;
  select array_agg(id order by first_position) into new.category_ids
    from (select id, min(position) first_position
      from unnest(new.category_ids) with ordinality as tags(id, position) group by id) tags;
  new.category := new.category_ids[1];
  return new;
end;
$$;
revoke all on function public.normalize_shirt_catalog_categories() from public;
drop trigger if exists normalize_shirt_catalog_categories on public.shirt_catalog_entries;
create trigger normalize_shirt_catalog_categories before insert or update on public.shirt_catalog_entries
  for each row execute function public.normalize_shirt_catalog_categories();
alter table public.shirt_catalog_entries alter column category_ids set not null;

-- Foreign keys validate every selected tag and prevent deleting any category in
-- use, including secondary tags. Only the entry trigger writes these memberships.
create table if not exists public.shirt_catalog_category_memberships (
  entry_id uuid not null references public.shirt_catalog_entries(id) on delete cascade,
  category_id text not null references public.storefront_categories(id) on update restrict on delete restrict,
  primary key (entry_id, category_id)
);
create index if not exists shirt_catalog_category_memberships_category_idx
  on public.shirt_catalog_category_memberships(category_id);
alter table public.shirt_catalog_category_memberships enable row level security;
revoke all on public.shirt_catalog_category_memberships from public, anon, authenticated;
grant all on public.shirt_catalog_category_memberships to service_role;

create or replace function public.sync_shirt_catalog_category_memberships()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shirt_catalog_category_memberships
    where entry_id = new.id and not (category_id = any(new.category_ids));
  insert into public.shirt_catalog_category_memberships(entry_id, category_id)
    select new.id, id from unnest(new.category_ids) id on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.sync_shirt_catalog_category_memberships() from public;
drop trigger if exists sync_shirt_catalog_category_memberships on public.shirt_catalog_entries;
create trigger sync_shirt_catalog_category_memberships after insert or update of category, category_ids
  on public.shirt_catalog_entries for each row
  execute function public.sync_shirt_catalog_category_memberships();
insert into public.shirt_catalog_category_memberships(entry_id, category_id)
  select e.id, tag from public.shirt_catalog_entries e, unnest(e.category_ids) tag
  on conflict do nothing;

drop function if exists public.storefront_catalog(text, integer, integer);
create function public.storefront_catalog(p_channel text default 'catalog', p_limit integer default 60, p_offset integer default 0)
returns table(id uuid, design_code text, name_lo text, name_en text, description_lo text, description_en text,
  category text, images jsonb, price_lak numeric, is_featured boolean, created_at timestamptz,
  caption_lo text, caption_en text, slogan_lo text, slogan_en text, category_ids text[])
language sql stable security definer set search_path = '' as $$
  select e.id,e.design_code,e.name_lo,e.name_en,e.description_lo,e.description_en,e.category,
    coalesce((select jsonb_agg(jsonb_build_object('url',i->>'url') order by n)
      from jsonb_array_elements(e.images) with ordinality as media(i,n)), '[]'::jsonb),
    case when p_channel = 'store' then e.price_lak else null end,e.is_featured,e.created_at,
    e.caption_lo,e.caption_en,e.slogan_lo,e.slogan_en,e.category_ids
  from public.shirt_catalog_entries e
  where e.is_published and p_channel in ('catalog','store') and (e.placement=p_channel or e.placement='both')
  order by e.is_featured desc,e.created_at desc,e.id
  limit greatest(1,least(coalesce(p_limit,60),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.storefront_catalog(text,integer,integer) from public;
grant execute on function public.storefront_catalog(text,integer,integer) to anon,authenticated,service_role;

create or replace function public.publish_shirt_catalog_batch(p_entries jsonb)
returns setof uuid language plpgsql security invoker set search_path = '' as $$
declare item jsonb; saved_id uuid;
begin
  if not public.can_manage_shirt_catalog(true) then
    raise exception 'Publishing permission required' using errcode='42501';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 100 then
    raise exception 'Select between 1 and 100 designs';
  end if;
  for item in select value from jsonb_array_elements(p_entries) loop
    insert into public.shirt_catalog_entries(design_code,name_lo,name_en,category,category_ids,placement,images,is_published)
    values(upper(trim(item->>'design_code')),trim(item->>'name_lo'),coalesce(item->>'name_en',''),item->>'category',
      case when item ? 'category_ids' then array(select jsonb_array_elements_text(item->'category_ids'))
        else array[item->>'category'] end,
      coalesce(item->>'placement','catalog'),item->'images',true)
    on conflict(design_code) do update set name_lo=excluded.name_lo,name_en=excluded.name_en,
      category=excluded.category,
      category_ids=case when item ? 'category_ids' then excluded.category_ids
        else array_replace(public.shirt_catalog_entries.category_ids,public.shirt_catalog_entries.category,excluded.category) end,
      placement=excluded.placement,images=excluded.images,is_published=true
    returning id into saved_id;
    return next saved_id;
  end loop;
end;
$$;
revoke all on function public.publish_shirt_catalog_batch(jsonb) from public,anon;
grant execute on function public.publish_shirt_catalog_batch(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
