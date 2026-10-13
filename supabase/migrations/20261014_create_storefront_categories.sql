-- Apply after 20261013_storefront_management.sql.
begin;

create table if not exists public.storefront_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,59}$' and id <> 'all'),
  lo text not null check (length(trim(lo)) between 1 and 200),
  en text not null default '' check (length(en) <= 200),
  icon text not null default 'teamwear' check (icon in ('football','volleyball','basketball','polo','teamwear')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.storefront_categories (id,lo,en,icon,sort_order) values
  ('football','ບານເຕະ','Football','football',10),
  ('volleyball','ບານສົ່ງ','Volleyball','volleyball',20),
  ('basketball','ບານບ້ວງ','Basketball','basketball',30),
  ('polo','ໂປໂລ','Polo','polo',40),
  ('teamwear','ເສື້ອທີມງານ','Teamwear','teamwear',50)
on conflict (id) do nothing;
-- Preserve any existing custom categories when upgrading an older installation.
insert into public.storefront_categories (id,lo,en)
  select distinct category,category,category from public.shirt_catalog_entries
  on conflict (id) do nothing;

alter table public.storefront_categories enable row level security;
revoke all on public.storefront_categories from anon,authenticated;
grant select,insert,update,delete on public.storefront_categories to authenticated;
grant all on public.storefront_categories to service_role;
drop policy if exists storefront_categories_read on public.storefront_categories;
create policy storefront_categories_read on public.storefront_categories for select to authenticated
  using ((select public.can_manage_shirt_catalog(false)));
drop policy if exists storefront_categories_write on public.storefront_categories;
create policy storefront_categories_write on public.storefront_categories for all to authenticated
  using ((select public.can_manage_shirt_catalog(true)))
  with check ((select public.can_manage_shirt_catalog(true)));
drop trigger if exists touch_storefront_category on public.storefront_categories;
create trigger touch_storefront_category before update on public.storefront_categories
  for each row execute function public.touch_storefront_settings();

-- Replace the fixed list with a foreign key; categories in use cannot be deleted.
alter table public.shirt_catalog_entries drop constraint if exists shirt_catalog_entries_category_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.shirt_catalog_entries'::regclass
    and conname='shirt_catalog_entries_category_fkey') then
    alter table public.shirt_catalog_entries add constraint shirt_catalog_entries_category_fkey
      foreign key(category) references public.storefront_categories(id) on update cascade on delete restrict;
  end if;
end $$;

create or replace function public.storefront_content()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'content',coalesce((select content from public.storefront_settings where id),'{}'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'lo',c.lo,'en',c.en,
      'icon',c.icon,'sort_order',c.sort_order) order by c.sort_order,c.lo,c.id)
      from public.storefront_categories c),'[]'::jsonb),
    'promotions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name_lo',p.name_lo,'name_en',p.name_en,'caption_lo',p.caption_lo,'caption_en',p.caption_en,
      'slogan_lo',p.slogan_lo,'slogan_en',p.slogan_en,'link_url',p.link_url,
      'images',jsonb_build_array(jsonb_build_object('url',p.images->0->>'url'))) order by p.sort_order,p.created_at,p.id)
      from public.storefront_promotions p where p.is_published),'[]'::jsonb));
$$;
revoke all on function public.storefront_content() from public;
grant execute on function public.storefront_content() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
