begin;

-- Requires 20261115_agent_deposit_review.sql.
-- An agent may take back a deposit they sent (submitted or approved) to correct it,
-- as long as BG SPORT has not converted it to an order and the factory has not
-- started work on it. The deposit returns to draft and leaves the production queue.

create or replace function public.agent_withdraw_factory_deposit(p_deposit_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agent uuid := public.sales_agent_id(); v_status text; v_owner uuid; v_order uuid;
begin
  if v_agent is null then
    raise exception 'Agent account required' using errcode = '42501';
  end if;
  select status, agent_user_id, order_id into v_status, v_owner, v_order
    from public.factory_deposit_orders where id = p_deposit_id for update;
  if not found or v_owner is distinct from v_agent then
    raise exception 'Agent deposit access denied' using errcode = '42501';
  end if;
  if v_status not in ('submitted', 'approved') or v_order is not null then
    raise exception 'Only sent deposits that are not orders yet can be withdrawn' using errcode = '42501';
  end if;
  if exists(select 1 from public.factory_production_queue_entries q
    where q.factory_deposit_order_id = p_deposit_id
      and (q.pattern_completed_at is not null or q.print_started_at is not null)) then
    raise exception 'Production has already started' using errcode = '42501';
  end if;

  -- Lets guard_agent_factory_deposit accept this one status change; the setting
  -- lasts only for this transaction and cannot be set through the API.
  perform set_config('app.agent_deposit_withdraw', p_deposit_id::text, true);
  update public.factory_deposit_orders
    set status = 'draft', approved_at = null, approved_by_user_id = null
    where id = p_deposit_id;
  perform set_config('app.agent_deposit_withdraw', '', true);

  insert into public.factory_deposit_order_history(deposit_order_id, action, detail, from_status, to_status, action_by_user_id)
    values (p_deposit_id, 'agent_withdraw', nullif(trim(coalesce(p_reason, '')), ''), v_status, 'draft', v_agent);
end $$;
revoke all on function public.agent_withdraw_factory_deposit(uuid, text) from public, anon;
grant execute on function public.agent_withdraw_factory_deposit(uuid, text) to authenticated;

-- Same guard as 20261115, plus the withdrawal exception above.
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
    if old.status in ('submitted','approved') and new.status = 'draft'
      and coalesce(current_setting('app.agent_deposit_withdraw', true), '') = old.id::text then
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

notify pgrst, 'reload schema';
commit;
