begin;

-- Internal document choices. These tables never read or write storefront data.
create table if not exists public.internal_collar_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]{0,59}$'),
  label text not null check (length(trim(label)) between 1 and 200),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0 and unit_price <= 999999999999.99),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  check (code <> 'none' or (unit_price = 0 and is_active))
);
create table if not exists public.internal_work_categories (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]{0,59}$'),
  label text not null check (length(trim(label)) between 1 and 200),
  sort_order integer not null default 100,
  is_active boolean not null default true
);
insert into public.internal_collar_types(code,label,unit_price,sort_order) values
  ('none','ຄໍປົກກະຕິ',0,0), ('polo','ຄໍໂປໂລ',20000,10), ('mandarin','ຄໍຈີນ',20000,20)
on conflict (code) do nothing;
insert into public.internal_work_categories(code,label,sort_order) values
  ('team_group','ເສື້ອທີມງານ / ເສື້ອກຸ່ມ',10), ('cockfighting','ເສື້ອໄກ່ຕີ',20),
  ('boat_racing','ເສື້ອຊ່ວງເຮືອ',30), ('automotive','ເສື້ອລົດ',40),
  ('rocket_festival','ເສື້ອບຸນບັ້ງໄຟ',50), ('religious','ເສື້ອສາຍບຸນ',60),
  ('sports','ເສື້ອກິລາ',70), ('other','ອື່ນໆ',80)
on conflict (code) do nothing;

create or replace function public.can_manage_internal_document_options(p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_kind in ('collars','work-categories') and exists (
    select 1 from public.users u where u.auth_user_id = (select auth.uid()) and u.is_active
    and (u.role = 'superadmin' or
      case coalesce(
        nullif(u.permission_settings->'access'->>('/settings/' || p_kind), 'inherit'),
        nullif(u.permission_settings->'access'->>'/settings', 'inherit'), 'inherit')
        when 'allow' then true when 'deny' then false else u.role = 'manager' end)
  );
$$;
revoke all on function public.can_manage_internal_document_options(text) from public, anon;
grant execute on function public.can_manage_internal_document_options(text) to authenticated;

do $$
declare t text; k text;
begin
  foreach t in array array['internal_collar_types','internal_work_categories'] loop
    k := case t when 'internal_collar_types' then 'collars' else 'work-categories' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists internal_options_read on public.%I', t);
    execute format('create policy internal_options_read on public.%I for select to authenticated using (exists (select 1 from public.users u where u.auth_user_id = (select auth.uid()) and u.is_active))', t);
    execute format('drop policy if exists internal_options_insert on public.%I', t);
    execute format('create policy internal_options_insert on public.%I for insert to authenticated with check ((select public.can_manage_internal_document_options(%L)))', t, k);
    execute format('drop policy if exists internal_options_update on public.%I', t);
    execute format('create policy internal_options_update on public.%I for update to authenticated using ((select public.can_manage_internal_document_options(%L))) with check ((select public.can_manage_internal_document_options(%L)))', t, k, k);
  end loop;
end $$;

create or replace function public.protect_internal_option_code()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.code is distinct from old.code then raise exception 'internal_option_code_is_immutable'; end if;
  return new;
end;
$$;
drop trigger if exists protect_internal_option_code on public.internal_collar_types;
create trigger protect_internal_option_code before update on public.internal_collar_types for each row execute function public.protect_internal_option_code();
drop trigger if exists protect_internal_option_code on public.internal_work_categories;
create trigger protect_internal_option_code before update on public.internal_work_categories for each row execute function public.protect_internal_option_code();

-- Keep the existing stored codes and historical charges. New choices use FKs
-- instead of the former fixed enums, including conversion into a regular order.
do $$
declare t text; c record;
begin
  foreach t in array array['quotation_drafts','factory_deposit_orders','orders'] loop
    execute format('alter table public.%I add column if not exists collar_label text, add column if not exists collar_unit_price numeric(14,2) check (collar_unit_price >= 0 and collar_unit_price <= 999999999999.99), add column if not exists work_category_label text', t);
    for c in select conname from pg_constraint where conrelid = ('public.' || t)::regclass
      and contype = 'c' and (pg_get_constraintdef(oid) like '%%collar_type%%' or pg_get_constraintdef(oid) like '%%work_category%%') loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = t || '_internal_collar_fk') then
      execute format('alter table public.%I add constraint %I foreign key (collar_type) references public.internal_collar_types(code) not valid', t, t || '_internal_collar_fk');
    end if;
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = t || '_internal_work_category_fk') then
      execute format('alter table public.%I add constraint %I foreign key (work_category) references public.internal_work_categories(code) not valid', t, t || '_internal_work_category_fk');
    end if;
    execute format('update public.%I d set collar_label = coalesce(d.collar_label, c.label), collar_unit_price = coalesce(d.collar_unit_price, case when d.collar_type = ''none'' then 0 else 20000 end) from public.internal_collar_types c where d.collar_type = c.code and (d.collar_label is null or d.collar_unit_price is null)', t);
    execute format('update public.%I d set work_category_label = c.label from public.internal_work_categories c where d.work_category = c.code and d.work_category_label is null', t);
  end loop;
  alter table public.design_queue_entries drop constraint if exists design_queue_entries_work_category_check;
  if not exists (select 1 from pg_constraint where conrelid = 'public.design_queue_entries'::regclass and conname = 'design_queue_entries_internal_work_category_fk') then
    alter table public.design_queue_entries add constraint design_queue_entries_internal_work_category_fk
      foreign key (work_category) references public.internal_work_categories(code) not valid;
  end if;
end $$;

create or replace function public.snapshot_internal_document_options()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare c public.internal_collar_types; w public.internal_work_categories; qt public.quotation_drafts;
begin
  select * into c from public.internal_collar_types where code = new.collar_type;
  select * into w from public.internal_work_categories where code = new.work_category;
  if tg_op = 'UPDATE' then
    if new.collar_type is distinct from old.collar_type then
      new.collar_label := c.label; new.collar_unit_price := c.unit_price;
    else
      new.collar_label := coalesce(new.collar_label, old.collar_label, c.label);
      new.collar_unit_price := coalesce(new.collar_unit_price, old.collar_unit_price, c.unit_price);
    end if;
    if new.work_category is distinct from old.work_category then new.work_category_label := w.label;
    else new.work_category_label := coalesce(new.work_category_label, old.work_category_label, w.label); end if;
  else
    new.collar_label := coalesce(new.collar_label, c.label);
    new.collar_unit_price := coalesce(new.collar_unit_price, c.unit_price);
    new.work_category_label := coalesce(new.work_category_label, w.label);
  end if;
  -- The existing customer-link trigger may replace the submitted category with
  -- the linked quotation's category. Keep its historical label aligned, too.
  if tg_table_name = 'factory_deposit_orders' then
    if nullif(new.quotation_draft_id, '') is not null
      and (tg_op = 'INSERT' or new.quotation_draft_id is distinct from old.quotation_draft_id) then
      select * into qt from public.quotation_drafts where id::text = new.quotation_draft_id;
      if qt.work_category is not distinct from new.work_category then
        new.work_category_label := coalesce(qt.work_category_label, w.label);
      end if;
    end if;
  end if;
  if new.collar_type = 'none' then new.collar_unit_price := 0; end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['quotation_drafts','factory_deposit_orders','orders'] loop
    execute format('drop trigger if exists z_snapshot_internal_document_options on public.%I', t);
    execute format('create trigger z_snapshot_internal_document_options before insert or update on public.%I for each row execute function public.snapshot_internal_document_options()', t);
  end loop;
end $$;
revoke all on function public.protect_internal_option_code() from public, anon, authenticated;
revoke all on function public.snapshot_internal_document_options() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
