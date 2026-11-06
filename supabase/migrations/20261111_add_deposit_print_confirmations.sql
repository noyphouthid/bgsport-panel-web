begin;

-- Apply after 20261110_expand_agent_workflow_permissions.sql.
-- A separate table keeps print confirmation away from the deposit triggers: it
-- does not re-run the production queue sync, and agents can confirm approved
-- documents even though their guard blocks edits to those deposits.
create table if not exists public.factory_deposit_order_print_confirmations (
  deposit_order_id uuid primary key references public.factory_deposit_orders (id) on delete cascade,
  confirmed_by_user_id uuid not null references public.users (id) on delete restrict,
  confirmed_at timestamptz not null default now()
);

alter table public.factory_deposit_order_print_confirmations enable row level security;

revoke all on table public.factory_deposit_order_print_confirmations from public, anon;
grant select, insert on table public.factory_deposit_order_print_confirmations to authenticated;
grant all on table public.factory_deposit_order_print_confirmations to service_role;

-- The subquery runs under the caller's RLS, so agents only reach their own deposits.
drop policy if exists factory_deposit_print_confirmations_select on public.factory_deposit_order_print_confirmations;
create policy factory_deposit_print_confirmations_select
  on public.factory_deposit_order_print_confirmations
  for select to authenticated
  using (exists (select 1 from public.factory_deposit_orders d where d.id = deposit_order_id));

drop policy if exists factory_deposit_print_confirmations_insert on public.factory_deposit_order_print_confirmations;
create policy factory_deposit_print_confirmations_insert
  on public.factory_deposit_order_print_confirmations
  for insert to authenticated
  with check (
    confirmed_by_user_id = (select u.id from public.users u where u.auth_user_id = auth.uid())
    and exists (select 1 from public.factory_deposit_orders d where d.id = deposit_order_id)
  );

commit;

notify pgrst, 'reload schema';
