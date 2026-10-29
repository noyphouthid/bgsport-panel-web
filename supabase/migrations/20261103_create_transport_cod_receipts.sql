begin;

-- One receipt per COD shipment, even when it has both a request and a note.
create table if not exists public.transport_cod_receipts (
  id uuid primary key default gen_random_uuid(),
  transport_note_id uuid unique references public.transport_notes(id) on delete restrict,
  delivery_request_id uuid unique references public.shipment_delivery_requests(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  received_at timestamptz not null default now(),
  received_by_user_id uuid references public.users(id) on delete set null,
  received_by_name text not null,
  check (transport_note_id is not null or delivery_request_id is not null)
);

create or replace function public.can_manage_transport_cod()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid()) and u.is_active
      and (u.role = 'superadmin' or
        case coalesce(
          nullif(u.permission_settings->'access'->>'/shipments/cod', 'inherit'),
          nullif(u.permission_settings->'access'->>'/shipments', 'inherit'), 'inherit')
          when 'deny' then false
          when 'allow' then true
          else u.role in ('admin','manager','staff','accountant')
        end)
  );
$$;

alter table public.transport_cod_receipts enable row level security;
revoke all on public.transport_cod_receipts from public, anon, authenticated;
grant select on public.transport_cod_receipts to authenticated;
grant all on public.transport_cod_receipts to service_role;
drop policy if exists transport_cod_receipts_read on public.transport_cod_receipts;
create policy transport_cod_receipts_read on public.transport_cod_receipts for select to authenticated
  using ((select public.can_manage_transport_cod()));

-- Requests are canonical when present; also include standalone notes and requests
-- whose note has not yet been saved. Never double count the two COD snapshots.
create or replace view public.transport_cod_items as
select 'request'::text as source, r.id as source_id, n.id as transport_note_id,
  r.id as delivery_request_id, coalesce(n.note_no, r.request_no) as note_no,
  r.order_id, o.order_code, coalesce(r.transport_receiver_name, '') as receiver_name,
  coalesce(r.transport_receiver_phone, '') as receiver_phone,
  r.transport_providers as transporters, r.transport_branch as branch,
  r.created_at, r.transport_cod_amount as cod_amount
from public.shipment_delivery_requests r
left join public.orders o on o.id = r.order_id
left join lateral (
  select t.id, t.note_no from public.transport_notes t
  where t.delivery_request_id = r.id order by t.created_at desc, t.id desc limit 1
) n on true
where r.delivery_method = 'transport' and r.transport_cod_enabled and r.transport_cod_amount > 0
union all
select 'note'::text, n.id, n.id, n.delivery_request_id, n.note_no,
  n.order_id, o.order_code, n.receiver_name, n.receiver_phone,
  n.transporters, n.branch, n.created_at, n.cod_amount
from public.transport_notes n
left join public.orders o on o.id = n.order_id
where n.cod_enabled and n.cod_amount > 0
  and not exists (select 1 from public.shipment_delivery_requests r
    where r.id = n.delivery_request_id and r.delivery_method = 'transport'
      and r.transport_cod_enabled and r.transport_cod_amount > 0)
  and (n.delivery_request_id is null or not exists (
    select 1 from public.transport_notes newer
    where newer.delivery_request_id = n.delivery_request_id and newer.cod_enabled
      and (newer.created_at, newer.id) > (n.created_at, n.id)));
revoke all on public.transport_cod_items from public, anon, authenticated;

create or replace function public.list_transport_cod(
  p_query text default '', p_status text default 'all',
  p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.can_manage_transport_cod() then
    raise exception 'cod_forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('all','pending','received') then
    raise exception 'invalid_cod_status' using errcode = '22023';
  end if;
  with matched as (
    select i.*, coalesce(receipt.amount, i.cod_amount) as amount,
      receipt.received_at, receipt.received_by_name
    from public.transport_cod_items i
    left join public.transport_cod_receipts receipt on
      (i.delivery_request_id is not null and receipt.delivery_request_id = i.delivery_request_id)
      or (receipt.transport_note_id = i.transport_note_id)
    where coalesce(trim(p_query), '') = '' or strpos(lower(concat_ws(' ',
      i.note_no, i.order_code, i.receiver_name, i.receiver_phone,
      array_to_string(i.transporters, ' '), i.branch, receipt.received_by_name)), lower(trim(p_query))) > 0
  ), filtered as (
    select * from matched where p_status = 'all'
      or (p_status = 'pending' and received_at is null)
      or (p_status = 'received' and received_at is not null)
  ), page as (
    select * from filtered order by created_at desc, source, source_id
    limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
  ) select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, source, source_id) from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', (select jsonb_build_object(
      'count', count(*), 'total', coalesce(sum(amount), 0),
      'pending_count', count(*) filter (where received_at is null),
      'pending_amount', coalesce(sum(amount) filter (where received_at is null), 0),
      'received_count', count(*) filter (where received_at is not null),
      'received_amount', coalesce(sum(amount) filter (where received_at is not null), 0)
    ) from matched)
  ) into v_result;
  return v_result;
end;
$$;

-- Lock the source and check the confirmed amount again in the same transaction.
-- A retry returns the existing receipt and cannot record the money twice.
create or replace function public.receive_transport_cod(p_source text, p_source_id uuid, p_expected_amount numeric)
returns public.transport_cod_receipts language plpgsql security definer set search_path = '' as $$
declare
  v_item public.transport_cod_items%rowtype;
  v_receipt public.transport_cod_receipts%rowtype;
  v_user public.users%rowtype;
  v_request_id uuid;
begin
  if not public.can_manage_transport_cod() then
    raise exception 'cod_forbidden' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('note','request') or p_source_id is null then
    raise exception 'invalid_cod_source' using errcode = '22023';
  end if;
  select * into v_user from public.users where auth_user_id = auth.uid() and is_active;
  if p_source = 'request' then
    v_request_id := p_source_id;
  else
    select delivery_request_id into v_request_id from public.transport_notes where id = p_source_id;
  end if;
  -- Always lock a linked request first to serialize note/request confirmations.
  if v_request_id is not null then
    perform 1 from public.shipment_delivery_requests where id = v_request_id for update;
    perform 1 from public.transport_notes where delivery_request_id = v_request_id order by id for update;
  else
    perform 1 from public.transport_notes where id = p_source_id for update;
  end if;
  select * into v_item from public.transport_cod_items
    where source = p_source and source_id = p_source_id;
  if not found then
    raise exception 'cod_item_not_found' using errcode = 'P0002';
  end if;
  select * into v_receipt from public.transport_cod_receipts
    where (v_item.delivery_request_id is not null and delivery_request_id = v_item.delivery_request_id)
      or transport_note_id = v_item.transport_note_id;
  if found then return v_receipt; end if;
  if p_expected_amount is null or v_item.cod_amount <> p_expected_amount then
    raise exception 'cod_amount_changed' using errcode = '22023';
  end if;
  insert into public.transport_cod_receipts (
    transport_note_id, delivery_request_id, amount, received_by_user_id, received_by_name
  ) values (
    v_item.transport_note_id, v_item.delivery_request_id, v_item.cod_amount, v_user.id, v_user.full_name
  ) returning * into v_receipt;
  return v_receipt;
end;
$$;

-- Preserve the receipted COD identity and amount in existing edit flows.
create or replace function public.protect_received_transport_cod()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'transport_notes' then
    if (new.cod_enabled, new.cod_amount, new.delivery_request_id, new.order_id)
      is distinct from (old.cod_enabled, old.cod_amount, old.delivery_request_id, old.order_id)
      and exists (select 1 from public.transport_cod_receipts c where c.transport_note_id = old.id
        or (old.delivery_request_id is not null and c.delivery_request_id = old.delivery_request_id)) then
      raise exception 'ຮັບຍອດ COD ແລ້ວ ບໍ່ສາມາດປ່ຽນຍອດ ຫຼື ອໍເດີໄດ້';
    end if;
  else
    if (new.transport_cod_enabled, new.transport_cod_amount, new.order_id, new.delivery_method)
      is distinct from (old.transport_cod_enabled, old.transport_cod_amount, old.order_id, old.delivery_method)
      and exists (select 1 from public.transport_cod_receipts c where c.delivery_request_id = old.id) then
      raise exception 'ຮັບຍອດ COD ແລ້ວ ບໍ່ສາມາດປ່ຽນຍອດ ຫຼື ອໍເດີໄດ້';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_received_transport_cod on public.transport_notes;
create trigger protect_received_transport_cod before update on public.transport_notes
  for each row execute function public.protect_received_transport_cod();
drop trigger if exists protect_received_transport_cod on public.shipment_delivery_requests;
create trigger protect_received_transport_cod before update on public.shipment_delivery_requests
  for each row execute function public.protect_received_transport_cod();

revoke all on function public.can_manage_transport_cod() from public, anon;
revoke all on function public.list_transport_cod(text,text,integer,integer) from public, anon;
revoke all on function public.receive_transport_cod(text,uuid,numeric) from public, anon;
revoke all on function public.protect_received_transport_cod() from public, anon, authenticated;
grant execute on function public.can_manage_transport_cod() to authenticated;
grant execute on function public.list_transport_cod(text,text,integer,integer) to authenticated;
grant execute on function public.receive_transport_cod(text,uuid,numeric) to authenticated;

comment on table public.transport_cod_receipts is 'Transport COD receipt acknowledgements. Does not create order payment transactions.';
notify pgrst, 'reload schema';
commit;
