begin;

-- Requires 20261111_add_deposit_print_confirmations.sql.
-- Print tracking moves from one step to two:
--   printed   (ພິມ)              recorded when someone prints or downloads the PDF
--   confirmed (ຢືນຢັນພິມສຳເລັດ)  recorded when someone confirms the paper is done
-- Existing rows were confirmations, so they become 'confirmed'.
alter table public.factory_deposit_order_print_confirmations
  add column if not exists status text not null default 'confirmed',
  add column if not exists printed_by_user_id uuid references public.users (id) on delete restrict,
  add column if not exists printed_at timestamptz;

alter table public.factory_deposit_order_print_confirmations
  alter column status drop default,
  alter column confirmed_by_user_id drop not null,
  alter column confirmed_at drop not null,
  alter column confirmed_at drop default;

alter table public.factory_deposit_order_print_confirmations
  drop constraint if exists factory_deposit_print_confirmations_stage_check;
alter table public.factory_deposit_order_print_confirmations
  add constraint factory_deposit_print_confirmations_stage_check check (
    (status = 'printed' and printed_by_user_id is not null and printed_at is not null
      and confirmed_by_user_id is null and confirmed_at is null)
    or (status = 'confirmed' and confirmed_by_user_id is not null and confirmed_at is not null)
  );

-- Timestamps come from the server, and a stage can only move forward.
create or replace function public.stamp_factory_deposit_print_stage()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'printed' then
      new.printed_at := now();
    elsif new.status = 'confirmed' then
      new.confirmed_at := now();
    end if;
    return new;
  end if;

  if old.status <> 'printed' or new.status <> 'confirmed'
    or new.deposit_order_id is distinct from old.deposit_order_id
    or new.printed_by_user_id is distinct from old.printed_by_user_id
    or new.printed_at is distinct from old.printed_at then
    raise exception 'Print status can only move from printed to confirmed' using errcode = '42501';
  end if;
  new.confirmed_at := now();
  return new;
end $$;
revoke all on function public.stamp_factory_deposit_print_stage() from public, anon, authenticated;

drop trigger if exists stamp_factory_deposit_print_stage on public.factory_deposit_order_print_confirmations;
create trigger stamp_factory_deposit_print_stage
  before insert or update on public.factory_deposit_order_print_confirmations
  for each row execute function public.stamp_factory_deposit_print_stage();

grant update (status, confirmed_by_user_id, confirmed_at)
  on table public.factory_deposit_order_print_confirmations to authenticated;

-- Each stage is recorded under the signed-in user's own id.
drop policy if exists factory_deposit_print_confirmations_insert on public.factory_deposit_order_print_confirmations;
create policy factory_deposit_print_confirmations_insert
  on public.factory_deposit_order_print_confirmations
  for insert to authenticated
  with check (
    exists (select 1 from public.factory_deposit_orders d where d.id = deposit_order_id)
    and (
      (status = 'printed'
        and printed_by_user_id = (select u.id from public.users u where u.auth_user_id = auth.uid()))
      or (status = 'confirmed'
        and confirmed_by_user_id = (select u.id from public.users u where u.auth_user_id = auth.uid()))
    )
  );

drop policy if exists factory_deposit_print_confirmations_update on public.factory_deposit_order_print_confirmations;
create policy factory_deposit_print_confirmations_update
  on public.factory_deposit_order_print_confirmations
  for update to authenticated
  using (
    status = 'printed'
    and exists (select 1 from public.factory_deposit_orders d where d.id = deposit_order_id)
  )
  with check (
    status = 'confirmed'
    and confirmed_by_user_id = (select u.id from public.users u where u.auth_user_id = auth.uid())
  );

commit;

notify pgrst, 'reload schema';
