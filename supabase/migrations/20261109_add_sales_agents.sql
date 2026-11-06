begin;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('superadmin','admin','manager','staff','graphic','production','accountant','agent'));

alter table public.orders
  add column if not exists agent_user_id uuid references public.users(id) on delete restrict,
  add column if not exists agent_commission_rate_lak integer not null default 2500 check (agent_commission_rate_lak >= 0),
  add column if not exists source_deposit_order_id uuid references public.factory_deposit_orders(id) on delete set null;
alter table public.design_queue_entries add column if not exists agent_user_id uuid references public.users(id) on delete restrict;
alter table public.quotation_drafts add column if not exists agent_user_id uuid references public.users(id) on delete restrict;
alter table public.factory_deposit_orders add column if not exists agent_user_id uuid references public.users(id) on delete restrict;
create index if not exists orders_agent_created_idx on public.orders(agent_user_id,created_at,id) where agent_user_id is not null;
create unique index if not exists orders_source_deposit_idx on public.orders(source_deposit_order_id) where source_deposit_order_id is not null;
create index if not exists design_queue_agent_idx on public.design_queue_entries(agent_user_id);
create index if not exists quotation_drafts_agent_idx on public.quotation_drafts(agent_user_id);
create index if not exists factory_deposit_orders_agent_idx on public.factory_deposit_orders(agent_user_id);

-- Identity helpers bypass users RLS to avoid recursive policies. Inactive agents
-- remain subject to the boundary but receive no ownership ID or data access.
-- A JWT whose profile has been deleted is fenced too, rather than inheriting
-- older permissive policies while its access token is still unexpired.
create or replace function public.is_sales_agent()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not exists(select 1 from public.users where auth_user_id = auth.uid() and role <> 'agent');
$$;
create or replace function public.sales_agent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.users where auth_user_id = auth.uid() and role = 'agent' and is_active limit 1;
$$;
create or replace function public.sales_agent_owns_order(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.orders where id = p_id and agent_user_id = public.sales_agent_id());
$$;
revoke all on function public.is_sales_agent(), public.sales_agent_id(), public.sales_agent_owns_order(uuid) from public, anon;
grant execute on function public.is_sales_agent(), public.sales_agent_id(), public.sales_agent_owns_order(uuid) to authenticated, service_role;
grant execute on function public.is_sales_agent() to anon;

-- Runs after existing customer-link triggers. Ownership travels by explicit IDs,
-- never by customer phone, order-code matching, or the converting staff member.
create or replace function public.set_sales_agent_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source uuid; v_actor uuid := public.sales_agent_id(); v_role text; v_linked boolean := false;
begin
  select role into v_role from public.users where auth_user_id = auth.uid() and is_active limit 1;
  if tg_table_name = 'quotation_drafts' then
    if new.design_queue_entry_id is not null then
      select agent_user_id into v_source from public.design_queue_entries where id = new.design_queue_entry_id;
      v_linked := true;
    end if;
  elsif tg_table_name = 'factory_deposit_orders' then
    if nullif(new.quotation_draft_id,'') is not null then
      select agent_user_id into v_source from public.quotation_drafts where id::text = new.quotation_draft_id;
      v_linked := true;
    elsif new.design_queue_entry_id is not null then
      select agent_user_id into v_source from public.design_queue_entries where id = new.design_queue_entry_id;
      v_linked := true;
    end if;
  elsif tg_table_name = 'orders' then
    if new.source_deposit_order_id is not null then
      select agent_user_id into v_source from public.factory_deposit_orders where id = new.source_deposit_order_id;
      v_linked := true;
    end if;
  end if;
  if public.is_sales_agent() then
    if v_actor is null then raise exception 'Agent account is inactive' using errcode = '42501'; end if;
    if (v_linked and v_source is distinct from v_actor)
      or (new.agent_user_id is not null and new.agent_user_id is distinct from v_actor)
      or (tg_op = 'UPDATE' and old.agent_user_id is distinct from v_actor) then
      raise exception 'Agent ownership cannot be changed' using errcode = '42501';
    end if;
    new.agent_user_id := v_actor;
    if tg_table_name <> 'orders' then new.created_by_user_id := v_actor; end if;
  elsif tg_op = 'INSERT' then
    if v_linked then new.agent_user_id := v_source;
    elsif new.agent_user_id is not null and v_role is distinct from 'superadmin' then
      raise exception 'Only superadmin may assign an agent directly' using errcode = '42501';
    end if;
  elsif new.agent_user_id is distinct from old.agent_user_id then
    raise exception 'Sales ownership is immutable; preserve the original agent' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and v_linked and v_source is distinct from new.agent_user_id then
    raise exception 'Linked documents must have the same sales agent' using errcode = '42501';
  end if;
  if new.agent_user_id is not null and not exists(select 1 from public.users where id = new.agent_user_id and role = 'agent') then
    raise exception 'Invalid sales agent' using errcode = '23514';
  end if;
  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' and new.agent_user_id is not null then
      new.created_at := clock_timestamp();
      new.agent_commission_rate_lak := 2500;
    elsif tg_op = 'UPDATE' and old.agent_user_id is not null then
      new.created_at := old.created_at;
      new.agent_commission_rate_lak := old.agent_commission_rate_lak;
      if new.source_deposit_order_id is distinct from old.source_deposit_order_id and new.source_deposit_order_id is not null then
        raise exception 'Order source cannot be changed' using errcode = '42501';
      end if;
    end if;
    if new.agent_user_id is not null and (new.short_qty < 0 or new.long_qty < 0 or new.free_qty < 0
      or new.short_qty <> trunc(new.short_qty) or new.long_qty <> trunc(new.long_qty) or new.free_qty <> trunc(new.free_qty)) then
      raise exception 'Shirt quantities must be nonnegative integers' using errcode = '23514';
    end if;
    if public.is_sales_agent() and ((tg_op = 'INSERT' and (new.status <> 'in_progress'
        or new.production_completed_at is not null or new.shipment_completed_at is not null or new.closed_at is not null
        or coalesce(new.shipment_status,'pending') <> 'pending'))
      or (tg_op = 'UPDATE' and (new.status is distinct from old.status
        or new.shipment_status is distinct from old.shipment_status
        or new.production_completed_at is distinct from old.production_completed_at
        or new.shipment_completed_at is distinct from old.shipment_completed_at
        or new.closed_at is distinct from old.closed_at))) then
      raise exception 'Only staff may change order fulfillment status' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.set_sales_agent_owner() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['orders','design_queue_entries','quotation_drafts','factory_deposit_orders'] loop
    execute format('drop trigger if exists zz_sales_agent_owner on public.%I',t);
    execute format('create trigger zz_sales_agent_owner before insert or update on public.%I for each row execute function public.set_sales_agent_owner()',t);
  end loop;
end $$;

-- A restrictive fence also applies when an older policy says USING (true).
-- Unknown business tables are denied to agents. Reference lists remain readable
-- for the existing order, address, fabric and collar form controls.
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
    if p_table = 'factory_deposit_orders' and p_action <> 'SELECT' then return false; end if;
    if p_action = 'DELETE' and p_table in ('orders','design_queue_entries') then return false; end if;
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
    return p_action = 'SELECT' and exists(select 1 from public.factory_deposit_orders where id = (p_row->>'deposit_order_id')::uuid and agent_user_id = v_agent);
  end if;
  if p_table = 'design_queue_mockups' then
    return exists(select 1 from public.design_queue_entries where id = (p_row->>'queue_entry_id')::uuid and agent_user_id = v_agent);
  end if;
  return false;
end $$;
revoke all on function public.sales_agent_row_allowed(text,jsonb,text) from public, anon;
grant execute on function public.sales_agent_row_allowed(text,jsonb,text) to authenticated, service_role;

do $$ declare t record; op text; expr text; begin
  for t in select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e')
  loop
    if not t.relrowsecurity then
      execute format('alter table public.%I enable row level security',t.relname);
      execute format('create policy sales_agent_preserve_existing_access on public.%I for all using (not (select public.is_sales_agent())) with check (not (select public.is_sales_agent()))',t.relname);
    end if;
    foreach op in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      expr := format('public.sales_agent_row_allowed(%L,to_jsonb(%I),%L)',t.relname,t.relname,op);
      execute format('drop policy if exists %I on public.%I','sales_agent_fence_'||lower(op),t.relname);
      execute format('drop policy if exists %I on public.%I','sales_agent_own_'||lower(op),t.relname);
      if op = 'INSERT' then
        execute format('create policy sales_agent_fence_insert on public.%I as restrictive for insert to authenticated with check (not (select public.is_sales_agent()) or %s)',t.relname,expr);
        execute format('create policy sales_agent_own_insert on public.%I for insert to authenticated with check ((select public.is_sales_agent()) and %s)',t.relname,expr);
      elsif op = 'UPDATE' then
        execute format('create policy sales_agent_fence_update on public.%I as restrictive for update to authenticated using (not (select public.is_sales_agent()) or %s) with check (not (select public.is_sales_agent()) or %s)',t.relname,expr,expr);
        execute format('create policy sales_agent_own_update on public.%I for update to authenticated using ((select public.is_sales_agent()) and %s) with check ((select public.is_sales_agent()) and %s)',t.relname,expr,expr);
      else
        execute format('create policy %I on public.%I as restrictive for %s to authenticated using (not (select public.is_sales_agent()) or %s)','sales_agent_fence_'||lower(op),t.relname,op,expr);
        execute format('create policy %I on public.%I for %s to authenticated using ((select public.is_sales_agent()) and %s)','sales_agent_own_'||lower(op),t.relname,op,expr);
      end if;
    end loop;
  end loop;
end $$;

-- Agents submit their own handoff requests; approval/delivery is still staff work.
create or replace function public.guard_agent_delivery_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_sales_agent() then
    if not public.sales_agent_owns_order(new.order_id) or new.status not in ('draft','submitted')
      or new.approved_at is not null or new.approved_by_user_id is not null
      or new.delivered_at is not null or new.delivered_by_user_id is not null
      or new.rejected_at is not null or new.rejected_by_user_id is not null
      or (tg_op='UPDATE' and (old.status not in ('draft','submitted','rejected') or old.order_id <> new.order_id)) then
      raise exception 'Agent may only submit own delivery request' using errcode = '42501';
    end if;
    if not exists(select 1 from public.order_qr_labels where id=new.qr_label_id and order_id=new.order_id) then
      raise exception 'QR label does not belong to order' using errcode = '42501';
    end if;
    new.requested_by_user_id := public.sales_agent_id();
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_delivery_request() from public, anon, authenticated;
drop trigger if exists guard_agent_delivery_request on public.shipment_delivery_requests;
create trigger guard_agent_delivery_request before insert or update on public.shipment_delivery_requests for each row execute function public.guard_agent_delivery_request();

-- Mixed factory batches expose only shared timestamps, never their notes or
-- other orders. The caller's order items remain protected by the normal fence.
create or replace function public.sales_agent_factory_receipts()
returns table(id uuid,received_at timestamptz,received_by text,note text)
language sql stable security definer set search_path = '' as $$
  select r.id,r.received_at,r.received_by,null::text from public.factory_receipts r
  where public.sales_agent_id() is not null and exists(select 1 from public.factory_receipt_items i
    where i.receipt_id=r.id and public.sales_agent_owns_order(i.order_id));
$$;
revoke all on function public.sales_agent_factory_receipts() from public,anon;
grant execute on function public.sales_agent_factory_receipts() to authenticated;

create or replace function public.guard_agent_related_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_sales_agent() then return new; end if;
  if not public.sales_agent_owns_order(new.order_id) then raise exception 'Agent order access denied' using errcode='42501'; end if;
  if tg_table_name = 'transport_notes' then
    if new.delivery_request_id is null or not exists(select 1 from public.shipment_delivery_requests r
      where r.id=new.delivery_request_id and r.order_id=new.order_id) then
      raise exception 'Transport note must reference own delivery request' using errcode='42501';
    end if;
    if tg_op='INSERT' then
      new.created_by_user_id := public.sales_agent_id();
      if new.transport_deposited_at is not null or new.transport_deposited_by is not null or new.transport_deposit_receipt_id is not null then raise exception 'Deposit confirmation requires staff' using errcode='42501'; end if;
    elsif new.order_id is distinct from old.order_id or new.delivery_request_id is distinct from old.delivery_request_id
      or new.transport_deposited_at is distinct from old.transport_deposited_at
      or new.transport_deposited_by is distinct from old.transport_deposited_by
      or new.transport_deposit_receipt_id is distinct from old.transport_deposit_receipt_id then
      raise exception 'Agent cannot change transport ownership or deposit confirmation' using errcode='42501';
    end if;
  elsif tg_table_name = 'order_status_history' then
    new.action_by_user_id := public.sales_agent_id();
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_related_write() from public,anon,authenticated;
drop trigger if exists guard_agent_related_write on public.transport_notes;
create trigger guard_agent_related_write before insert or update on public.transport_notes for each row execute function public.guard_agent_related_write();
drop trigger if exists guard_agent_related_write on public.order_status_history;
create trigger guard_agent_related_write before insert on public.order_status_history for each row execute function public.guard_agent_related_write();

-- Employee overrides cannot grant agents financial RPC access.
create or replace function public.can_manage_transport_cod()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users u where u.auth_user_id=auth.uid() and u.is_active and u.role <> 'agent'
    and (u.role='superadmin' or case coalesce(nullif(u.permission_settings->'access'->>'/shipments/cod','inherit'),
      nullif(u.permission_settings->'access'->>'/shipments','inherit'),'inherit')
      when 'deny' then false when 'allow' then true else u.role in ('admin','manager','staff','accountant') end));
$$;
revoke all on function public.can_manage_transport_cod() from public,anon;
grant execute on function public.can_manage_transport_cod() to authenticated;

-- Keep the existing public sharing URLs, while preventing an agent from
-- listing, replacing, or deleting another agent's objects through Storage API.
create or replace function public.sales_agent_storage_allowed(p_bucket text,p_name text,p_owner text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_agent uuid := public.sales_agent_id(); v_folder text := split_part(p_name,'/',1); v_key text := split_part(p_name,'/',2);
begin
  if v_agent is null then return false; end if;
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
revoke all on function public.sales_agent_storage_allowed(text,text,text) from public,anon;
grant execute on function public.sales_agent_storage_allowed(text,text,text) to authenticated;
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists sales_agent_storage_fence on storage.objects';
    execute $policy$create policy sales_agent_storage_fence on storage.objects as restrictive for all to authenticated
      using (not (select public.is_sales_agent()) or public.sales_agent_storage_allowed(bucket_id,name,coalesce(to_jsonb(objects)->>'owner_id',to_jsonb(objects)->>'owner')))
      with check (not (select public.is_sales_agent()) or public.sales_agent_storage_allowed(bucket_id,name,coalesce(to_jsonb(objects)->>'owner_id',to_jsonb(objects)->>'owner')))$policy$;
  end if;
end $$;

create or replace function public.sales_agents_enabled()
returns boolean language sql stable security invoker set search_path = '' as $$ select true $$;
revoke all on function public.sales_agents_enabled() from public, anon;
grant execute on function public.sales_agents_enabled() to authenticated, service_role;

create or replace function public.create_design_queue_entry(
  p_queue_date date default current_date,
  p_type_code text default '',
  p_customer_name text default '',
  p_customer_phone text default '',
  p_style_name text default '',
  p_notes text default '',
  p_graphic_user_id uuid default null,
  p_created_by_user_id uuid default null,
  p_work_category text default null,
  p_design_payment_type text default null,
  p_design_deposit_amount numeric default null
)
returns public.design_queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_date date := coalesce(p_queue_date, current_date);
  v_year integer := extract(year from v_queue_date);
  v_month integer := extract(month from v_queue_date);
  v_year_short text := lpad((v_year % 100)::text, 2, '0');
  v_queue_sequence bigint;
  v_order_sequence integer;
  v_type_code text := upper(regexp_replace(coalesce(p_type_code, ''), '[^A-Z0-9]', '', 'g'));
  v_queue_number text;
  v_order_no text;
  v_row public.design_queue_entries;
begin
  if not exists (select 1 from public.users where auth_user_id = auth.uid() and is_active and role in ('superadmin', 'admin', 'manager', 'staff', 'agent')) then
    raise exception 'Not authorized to create design queue entries' using errcode = '42501';
  end if;
  if public.is_sales_agent() then p_created_by_user_id := public.sales_agent_id(); end if;
  perform pg_advisory_xact_lock(hashtextextended('design_queue_global_sequence', 0));

  select coalesce(max(entry.queue_sequence), 0) + 1
  into v_queue_sequence
  from public.design_queue_entries as entry;

  perform pg_advisory_xact_lock(hashtextextended(format('design_queue_month_%s_%s', v_year, v_month), 0));

  select coalesce(max(entry.order_sequence), 0) + 1
  into v_order_sequence
  from public.design_queue_entries as entry
  where entry.queue_year = v_year
    and entry.queue_month = v_month;

  if v_type_code = '' then
    v_type_code := 'DQ' || v_year_short;
  elsif v_type_code ~ '\d{2}$' then
    v_type_code := regexp_replace(v_type_code, '\d{2}$', v_year_short);
  else
    v_type_code := v_type_code || v_year_short;
  end if;

  v_queue_number := lpad(v_queue_sequence::text, 4, '0');
  v_order_no := v_month::text || lpad(v_order_sequence::text, 3, '0');

  insert into public.design_queue_entries (
    queue_date,
    queue_year,
    queue_month,
    queue_sequence,
    queue_number,
    order_sequence,
    order_no,
    type_code,
    work_category,
    design_payment_type,
    design_deposit_amount,
    customer_name,
    customer_phone,
    style_name,
    notes,
    graphic_user_id,
    created_by_user_id
  )
  values (
    v_queue_date,
    v_year,
    v_month,
    v_queue_sequence,
    v_queue_number,
    v_order_sequence,
    v_order_no,
    v_type_code,
    p_work_category,
    p_design_payment_type,
    p_design_deposit_amount,
    coalesce(trim(p_customer_name), ''),
    coalesce(trim(p_customer_phone), ''),
    coalesce(trim(p_style_name), ''),
    coalesce(trim(p_notes), ''),
    p_graphic_user_id,
    p_created_by_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

notify pgrst, 'reload schema';
commit;
