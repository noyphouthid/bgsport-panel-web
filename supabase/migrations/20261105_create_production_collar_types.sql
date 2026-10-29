begin;

-- Collar construction choices for each mockup/design, independent of surcharges.
create table if not exists public.internal_production_collar_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]{0,59}$'),
  label text not null check (length(trim(label)) between 1 and 200),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  check (code <> 'crew' or is_active)
);
insert into public.internal_production_collar_types(code,label,sort_order) values
  ('crew','ຄໍມົນ',0),
  ('crew_dyed_rib','ຄໍມົນຜ້າບຸ້ງຍ້ອມ',10),
  ('crew_printed_rib','ຄໍມົນຜ້າບຸ້ງພິມລາຍ',20),
  ('polo','ໂປໂລ',30),
  ('mandarin','ຄໍຈີນ',40),
  ('v_cut_polo','ຄໍໂປໂລວີຕັດ',50),
  ('v_neck','ຄໍວີ',60),
  ('cross_v','ຄໍວີໄຂວ່',70),
  ('cut_v','ຄໍວີຕັດ',80),
  ('pentagon','ຄໍ 5 ຫຼ່ຽມ',90),
  ('v_polo','ຄໍໂປໂລວີ',100),
  ('cross_v_polo','ຄໍໂປໂລວີໄຂວ່',110),
  ('y_neck','ຄໍ Y',120),
  ('sharp_v','ຄໍ V ໂຊສາບ',130)
on conflict (code) do nothing;

create or replace function public.can_manage_internal_document_options(p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_kind in ('collars','work-categories','production-collars') and exists (
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

alter table public.internal_production_collar_types enable row level security;
revoke all on public.internal_production_collar_types from public, anon, authenticated;
grant select, insert, update on public.internal_production_collar_types to authenticated;
grant all on public.internal_production_collar_types to service_role;
drop policy if exists internal_options_read on public.internal_production_collar_types;
create policy internal_options_read on public.internal_production_collar_types for select to authenticated
  using (exists (select 1 from public.users u where u.auth_user_id = (select auth.uid()) and u.is_active));
drop policy if exists internal_options_insert on public.internal_production_collar_types;
create policy internal_options_insert on public.internal_production_collar_types for insert to authenticated
  with check ((select public.can_manage_internal_document_options('production-collars')));
drop policy if exists internal_options_update on public.internal_production_collar_types;
create policy internal_options_update on public.internal_production_collar_types for update to authenticated
  using ((select public.can_manage_internal_document_options('production-collars')))
  with check ((select public.can_manage_internal_document_options('production-collars')));
drop trigger if exists protect_internal_option_code on public.internal_production_collar_types;
create trigger protect_internal_option_code before update on public.internal_production_collar_types
  for each row execute function public.protect_internal_option_code();

notify pgrst, 'reload schema';
commit;
