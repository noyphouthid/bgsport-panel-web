begin;

-- Requires 20261110_expand_agent_workflow_permissions.sql.
-- Agent deposits are checked by a superadmin (quantities and transfer slips)
-- before approval, and only a superadmin may turn any deposit into an order.

-- 1. Agents may edit only drafts. Once sent, a superadmin reviews the deposit
--    and sends it back to draft when something needs correcting.
create or replace function public.guard_agent_factory_deposit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_sales_agent() then return new; end if;
  if public.sales_agent_id() is null or new.agent_user_id is distinct from public.sales_agent_id() then
    raise exception 'Agent deposit access denied' using errcode='42501';
  end if;
  if tg_op='UPDATE' then
    -- Preserve the original author when an agent edits a staff-created document.
    new.created_by_user_id := old.created_by_user_id;
    new.created_at := old.created_at;
    -- Deleting an owned design queue detaches its foreign keys, including on
    -- approved documents. This system action cannot edit their other details.
    if pg_trigger_depth()>1 and old.design_queue_entry_id is not null and new.design_queue_entry_id is null
      and (to_jsonb(new)-'design_queue_entry_id'-'updated_at')=(to_jsonb(old)-'design_queue_entry_id'-'updated_at') then
      return new;
    end if;
    if old.status <> 'draft' then
      raise exception 'Only draft deposits can be edited by agents' using errcode='42501';
    end if;
  end if;
  if new.status not in ('draft','submitted') or new.order_id is not null
    or new.approved_at is not null or new.approved_by_user_id is not null
    or new.converted_at is not null or new.converted_by_user_id is not null
    or new.cancelled_at is not null or new.cancelled_by_user_id is not null then
    raise exception 'Deposit approval and conversion require staff' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_factory_deposit() from public,anon,authenticated;

-- 2. Approving an agent deposit, converting any deposit to an order, and undoing
--    a conversion are superadmin actions. Server jobs without a signed-in user
--    (service role) are not affected.
create or replace function public.guard_factory_deposit_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then return new; end if;
  select role into v_role from public.users where auth_user_id = auth.uid() and is_active limit 1;
  if v_role = 'superadmin' then return new; end if;

  if tg_op = 'INSERT' then
    if new.status = 'converted' or new.order_id is not null then
      raise exception 'Only superadmin may convert deposits to orders' using errcode='42501';
    end if;
    if new.agent_user_id is not null and new.status = 'approved' then
      raise exception 'Only superadmin may approve agent deposits' using errcode='42501';
    end if;
    return new;
  end if;

  if (new.status = 'converted' and old.status is distinct from 'converted')
    or (new.order_id is not null and new.order_id is distinct from old.order_id) then
    raise exception 'Only superadmin may convert deposits to orders' using errcode='42501';
  end if;
  if old.status = 'converted' and new.status is distinct from 'converted' then
    raise exception 'Only superadmin may cancel a deposit conversion' using errcode='42501';
  end if;
  if new.agent_user_id is not null and new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'Only superadmin may approve agent deposits' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_factory_deposit_review() from public,anon,authenticated;
drop trigger if exists zzz_guard_factory_deposit_review on public.factory_deposit_orders;
create trigger zzz_guard_factory_deposit_review before insert or update on public.factory_deposit_orders
  for each row execute function public.guard_factory_deposit_review();

-- Lets the app check that this migration has been applied.
create or replace function public.agent_deposit_review_enabled()
returns boolean language sql immutable security invoker set search_path = '' as $$ select true $$;
revoke all on function public.agent_deposit_review_enabled() from public,anon;
grant execute on function public.agent_deposit_review_enabled() to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
