begin;

-- Queue records are the customer/order directory; legacy rows stay unclassified.
alter table public.design_queue_entries add column if not exists work_category text;
alter table public.quotation_drafts
  add column if not exists design_queue_entry_id uuid references public.design_queue_entries(id) on delete set null,
  add column if not exists order_code text not null default '',
  add column if not exists work_category text;
alter table public.factory_deposit_orders
  add column if not exists design_queue_entry_id uuid references public.design_queue_entries(id) on delete set null,
  add column if not exists work_category text;

do $$
declare t text;
begin
  foreach t in array array['design_queue_entries', 'quotation_drafts', 'factory_deposit_orders'] loop
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = t || '_work_category_check') then
      execute format('alter table public.%I add constraint %I check (work_category is null or work_category in (''team_group'', ''cockfighting'', ''boat_racing'', ''automotive'', ''rocket_festival'', ''religious'', ''sports'', ''other''))', t, t || '_work_category_check');
    end if;
  end loop;
end $$;

create index if not exists quotation_drafts_queue_entry_idx on public.quotation_drafts(design_queue_entry_id);
create index if not exists factory_deposit_orders_queue_entry_idx on public.factory_deposit_orders(design_queue_entry_id);

-- Security invoker: existing queue RLS also applies to customer searches.
create or replace function public.search_design_queue_customers(p_search text)
returns table (id uuid, queue_number text, type_code text, order_no text, customer_name text, customer_phone text, work_category text)
language sql stable security invoker set search_path = public
as $$
  select q.id, q.queue_number, q.type_code, q.order_no, q.customer_name, q.customer_phone, q.work_category
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

-- One transaction-safe counter per document kind and calendar month. Never reuse deleted numbers.
create table if not exists public.document_monthly_counters (
  document_kind text not null check (document_kind in ('QT', 'DPF')),
  document_month date not null,
  last_value bigint not null,
  primary key (document_kind, document_month)
);
alter table public.document_monthly_counters enable row level security;
revoke all on public.document_monthly_counters from anon, authenticated;

-- Import only numbers in the new format, leaving all previous document codes intact.
insert into public.document_monthly_counters(document_kind, document_month, last_value)
select 'QT', make_date(2000 + substring(quote_no from 3 for 2)::int, substring(quote_no from 6 for 2)::int, 1), max(substring(quote_no from '[0-9]+$')::bigint)
from public.quotation_drafts
where quote_no ~ '^QT[0-9]{2}-[0-9]{2}-[0-9]+$'
group by make_date(2000 + substring(quote_no from 3 for 2)::int, substring(quote_no from 6 for 2)::int, 1)
on conflict (document_kind, document_month) do update set last_value = greatest(document_monthly_counters.last_value, excluded.last_value);
insert into public.document_monthly_counters(document_kind, document_month, last_value)
select 'DPF', make_date(2000 + substring(deposit_no from 4 for 2)::int, substring(deposit_no from 7 for 2)::int, 1), max(substring(deposit_no from '[0-9]+$')::bigint)
from public.factory_deposit_orders where deposit_no ~ '^DPF[0-9]{2}-[0-9]{2}-[0-9]+$'
group by make_date(2000 + substring(deposit_no from 4 for 2)::int, substring(deposit_no from 7 for 2)::int, 1)
on conflict (document_kind, document_month) do update set last_value = greatest(document_monthly_counters.last_value, excluded.last_value);

create unique index if not exists quotation_drafts_monthly_number_key on public.quotation_drafts(quote_no)
  where quote_no ~ '^QT[0-9]{2}-[0-9]{2}-[0-9]+$';

create or replace function public.assign_monthly_document_number()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_kind text;
  v_date date;
  v_sequence bigint;
  v_number text;
begin
  if TG_TABLE_NAME = 'quotation_drafts' then
    if TG_OP = 'UPDATE' then new.quote_no := old.quote_no; return new; end if;
    v_kind := 'QT'; v_date := nullif(new.quote_date, '')::date;
  else
    if TG_OP = 'UPDATE' then new.deposit_no := old.deposit_no; return new; end if;
    v_kind := 'DPF'; v_date := new.deposit_date;
  end if;
  if v_date is null then raise exception 'Document date is required'; end if;
  insert into public.document_monthly_counters(document_kind, document_month, last_value)
    values(v_kind, date_trunc('month', v_date)::date, 0)
    on conflict (document_kind, document_month) do update set last_value = document_monthly_counters.last_value + 1
    returning last_value into v_sequence;
  v_number := v_kind || to_char(v_date, 'YY-MM') || '-' || lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');
  if TG_TABLE_NAME = 'quotation_drafts' then new.quote_no := v_number; else new.deposit_no := v_number; end if;
  return new;
end $$;
revoke all on function public.assign_monthly_document_number() from public;
drop trigger if exists quotation_monthly_number on public.quotation_drafts;
create trigger quotation_monthly_number before insert or update on public.quotation_drafts
  for each row execute function public.assign_monthly_document_number();
drop trigger if exists deposit_monthly_number on public.factory_deposit_orders;
create trigger deposit_monthly_number before insert or update on public.factory_deposit_orders
  for each row execute function public.assign_monthly_document_number();

-- Resolve new links under the caller's RLS, preserving historical snapshots on ordinary edits.
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
    end if;
  end if;
  return new;
end $$;
revoke all on function public.link_workflow_customer() from public;
drop trigger if exists quotation_link_customer on public.quotation_drafts;
create trigger quotation_link_customer before insert or update on public.quotation_drafts for each row execute function public.link_workflow_customer();
drop trigger if exists deposit_link_customer on public.factory_deposit_orders;
create trigger deposit_link_customer before insert or update on public.factory_deposit_orders for each row execute function public.link_workflow_customer();

drop function if exists public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid);
create or replace function public.create_design_queue_entry(
  p_queue_date date default current_date,
  p_type_code text default '',
  p_customer_name text default '',
  p_customer_phone text default '',
  p_style_name text default '',
  p_notes text default '',
  p_graphic_user_id uuid default null,
  p_created_by_user_id uuid default null,
  p_work_category text default null
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

revoke all on function public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
