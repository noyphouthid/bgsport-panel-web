begin;

-- Unknown legacy payment terms remain unknown; never infer money from free-text notes.
alter table public.design_queue_entries
  add column if not exists design_payment_type text,
  add column if not exists design_deposit_amount numeric(14,2);
alter table public.quotation_drafts
  add column if not exists design_deposit numeric(14,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.design_queue_entries'::regclass and conname = 'design_queue_payment_check') then
    alter table public.design_queue_entries add constraint design_queue_payment_check check ((
      (design_payment_type is null and design_deposit_amount is null)
      or (design_payment_type = 'free' and design_deposit_amount is null)
      or (design_payment_type = 'deposit' and design_deposit_amount is not null
        and design_deposit_amount > 0 and design_deposit_amount <> 'NaN'::numeric)
    ) is true);
  end if;
end $$;

-- Changing the return fields requires replacing the search function.
drop function if exists public.search_design_queue_customers(text);
create or replace function public.search_design_queue_customers(p_search text)
returns table (id uuid, queue_number text, type_code text, order_no text, customer_name text, customer_phone text, work_category text, design_payment_type text, design_deposit_amount numeric)
language sql stable security invoker set search_path = public
as $$
  select q.id, q.queue_number, q.type_code, q.order_no, q.customer_name, q.customer_phone, q.work_category, q.design_payment_type, q.design_deposit_amount
  from public.design_queue_entries q
  where length(trim(p_search)) >= 2 and (
    position(lower(trim(p_search)) in lower(q.customer_name)) > 0
    or position(lower(trim(p_search)) in lower(q.type_code || '-' || q.order_no)) > 0
    or position(trim(p_search) in q.queue_number) > 0
    or position(trim(p_search) in q.customer_phone) > 0
    or (length(regexp_replace(p_search, '[^0-9]', '', 'g')) >= 2
      and p_search ~ '^[+0-9 ()-]+$'
      and position(regexp_replace(p_search, '[^0-9]', '', 'g') in regexp_replace(q.customer_phone, '[^0-9]', '', 'g')) > 0)
  )
  order by q.queue_date desc, q.queue_sequence desc limit 25;
$$;
revoke all on function public.search_design_queue_customers(text) from public, anon;
grant execute on function public.search_design_queue_customers(text) to authenticated, service_role;

-- Copy the recorded payment only on selection/reselection; preserve saved quotation amounts on ordinary edits.
create or replace function public.link_workflow_customer()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare q public.design_queue_entries; qt public.quotation_drafts;
begin
  if TG_TABLE_NAME = 'quotation_drafts' then
    if new.design_queue_entry_id is not null and (TG_OP = 'INSERT' or new.design_queue_entry_id is distinct from old.design_queue_entry_id) then
      select * into strict q from public.design_queue_entries where id = new.design_queue_entry_id;
      new.order_code := q.type_code || '-' || q.order_no;
      new.customer_phone := coalesce(nullif(new.customer_phone, ''), q.customer_phone);
      new.customer_name := coalesce(nullif(new.customer_name, ''), q.customer_name);
      new.work_category := coalesce(q.work_category, new.work_category);
      new.design_deposit := case when q.design_payment_type = 'deposit' then q.design_deposit_amount else 0 end;
    end if;
  else
    if nullif(new.quotation_draft_id, '') is not null and (TG_OP = 'INSERT' or new.quotation_draft_id is distinct from old.quotation_draft_id) then
      select * into strict qt from public.quotation_drafts where id::text = new.quotation_draft_id;
      new.design_queue_entry_id := qt.design_queue_entry_id;
      new.quotation_quote_no := qt.quote_no;
      new.order_code := coalesce(nullif(qt.order_code, ''), new.order_code);
      new.customer_name := qt.customer_name;
      new.customer_phone := qt.customer_phone;
      new.work_category := qt.work_category;
      new.design_deposit := qt.design_deposit;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.link_workflow_customer() from public;
drop trigger if exists quotation_link_customer on public.quotation_drafts;
create trigger quotation_link_customer before insert or update on public.quotation_drafts for each row execute function public.link_workflow_customer();
drop trigger if exists deposit_link_customer on public.factory_deposit_orders;
create trigger deposit_link_customer before insert or update on public.factory_deposit_orders for each row execute function public.link_workflow_customer();

drop function if exists public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid, text);
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
  if not exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('superadmin', 'admin', 'manager', 'staff')) then
    raise exception 'Not authorized to create design queue entries' using errcode = '42501';
  end if;
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

revoke all on function public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid, text, text, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
