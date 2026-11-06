begin;

-- Apply after 20261109_add_sales_agents.sql. Existing restrictive policies call
-- the helpers below, so updating them also updates databases already in use.
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
    if old.status not in ('draft','submitted') then
      raise exception 'Only draft or submitted deposits can be edited by agents' using errcode='42501';
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
drop trigger if exists zzz_guard_agent_factory_deposit on public.factory_deposit_orders;
create trigger zzz_guard_agent_factory_deposit before insert or update on public.factory_deposit_orders
  for each row execute function public.guard_agent_factory_deposit();

create or replace function public.guard_agent_deposit_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_sales_agent() then return new; end if;
  if not exists(select 1 from public.factory_deposit_orders d where d.id=new.deposit_order_id
    and d.agent_user_id=public.sales_agent_id() and d.status in ('draft','submitted')) then
    raise exception 'Agent deposit access denied' using errcode='42501';
  end if;
  if tg_table_name='factory_deposit_order_history' then
    if new.action not in ('create','update','submit') then
      raise exception 'Agent cannot record deposit approval or conversion' using errcode='42501';
    end if;
    new.action_by_user_id := public.sales_agent_id();
  else
    new.uploaded_by_user_id := public.sales_agent_id();
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_deposit_attachment() from public,anon,authenticated;
drop trigger if exists guard_agent_deposit_attachment on public.factory_deposit_order_history;
create trigger guard_agent_deposit_attachment before insert on public.factory_deposit_order_history
  for each row execute function public.guard_agent_deposit_attachment();
drop trigger if exists guard_agent_deposit_attachment on public.factory_deposit_order_slips;
create trigger guard_agent_deposit_attachment before insert or update on public.factory_deposit_order_slips
  for each row execute function public.guard_agent_deposit_attachment();

create or replace function public.sales_agent_deposit_editing_enabled()
returns boolean language sql immutable security invoker set search_path = '' as $$ select true $$;
revoke all on function public.sales_agent_deposit_editing_enabled() from public,anon;
grant execute on function public.sales_agent_deposit_editing_enabled() to authenticated,service_role;

create or replace function public.sales_agent_row_allowed(p_table text, p_row jsonb, p_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_agent uuid := public.sales_agent_id(); v_id uuid; v_order uuid;
begin
  if v_agent is null then return false; end if;
  if p_action = 'SELECT' and p_table in ('fabrics','order_code_types','internal_collar_types','internal_work_categories','internal_production_collar_types','shipping_branches','transport_branches') then return true; end if;
  if p_table = 'users' then
    return p_action = 'SELECT' and ((p_row->>'id')::uuid = v_agent
      or (p_row->>'role' <> 'agent' and coalesce((p_row->>'is_active')::boolean,false)));
  end if;
  if p_table in ('orders','design_queue_entries','quotation_drafts','factory_deposit_orders') then
    if p_table = 'factory_deposit_orders' and p_action <> 'SELECT' then
      return p_action in ('INSERT','UPDATE') and p_row->>'status' in ('draft','submitted')
        and nullif(p_row->>'agent_user_id','')::uuid=v_agent;
    end if;
    if p_action = 'DELETE' and p_table = 'orders' then return false; end if;
    return nullif(p_row->>'agent_user_id','')::uuid = v_agent;
  end if;
  if p_table in ('order_items','order_transfer_slips','order_status_history','order_qr_labels','factory_receipt_items','shipment_records','shipment_payments','payment_transactions','shipment_delivery_requests','transport_notes') then
    v_order := nullif(p_row->>'order_id','')::uuid;
    if not public.sales_agent_owns_order(v_order) then return false; end if;
    if p_action = 'SELECT' then return true; end if;
    if p_table in ('order_items','order_transfer_slips') then return true; end if;
    if p_table = 'order_status_history' then return p_action = 'INSERT'; end if;
    if p_table = 'shipment_delivery_requests' then return p_action in ('INSERT','UPDATE') and p_row->>'status' in ('draft','submitted','rejected'); end if;
    if p_table = 'transport_notes' then return p_action in ('INSERT','UPDATE'); end if;
    return false;
  end if;
  if p_action = 'SELECT' and p_table = 'factory_receipts' then
    return exists(select 1 from public.factory_receipt_items where receipt_id = (p_row->>'id')::uuid and public.sales_agent_owns_order(order_id))
      and not exists(select 1 from public.factory_receipt_items where receipt_id = (p_row->>'id')::uuid and not public.sales_agent_owns_order(order_id));
  end if;
  if p_table in ('factory_deposit_order_slips','factory_deposit_order_history') then
    return exists(select 1 from public.factory_deposit_orders where id=(p_row->>'deposit_order_id')::uuid and agent_user_id=v_agent
      and (p_action='SELECT' or (status in ('draft','submitted') and
        ((p_table='factory_deposit_order_history' and p_action='INSERT') or p_table='factory_deposit_order_slips'))));
  end if;
  if p_table = 'design_queue_mockups' then
    return exists(select 1 from public.design_queue_entries where id = (p_row->>'queue_entry_id')::uuid and agent_user_id = v_agent);
  end if;
  return false;
end $$;

create or replace function public.sales_agent_storage_allowed(p_bucket text,p_name text,p_owner text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_agent uuid := public.sales_agent_id(); v_folder text := split_part(p_name,'/',1); v_key text := split_part(p_name,'/',2);
begin
  if v_agent is null then return false; end if;
  if p_bucket in ('factory-deposit-slips','factory-production-mockups') then
    return exists(select 1 from public.factory_deposit_orders where id::text=v_folder and agent_user_id=v_agent and status in ('draft','submitted'));
  end if;
  if p_bucket='shipment-delivery-slips' then
    return exists(select 1 from public.orders where id::text=v_folder and agent_user_id=v_agent);
  end if;
  if p_bucket='order-media' then
    if v_folder='design-queue-mockups' then
      return exists(select 1 from public.design_queue_entries where id::text=v_key and agent_user_id=v_agent);
    end if;
    if v_folder in ('order-image','order-transfer-slip','pants-mockup') then
      if exists(select 1 from public.orders where order_code=v_key) then
        return exists(select 1 from public.orders where order_code=v_key and agent_user_id=v_agent);
      end if;
      -- The new-order form uploads its images immediately before inserting the
      -- order. Only the uploader may access those unlinked objects.
      return p_owner=auth.uid()::text;
    end if;
  end if;
  return false;
end $$;

notify pgrst, 'reload schema';
commit;
