begin;

-- A COD shipment shows on the COD page only after its transport note has been
-- scanned at /shipments/deposits/scan (the parcel is really with the carrier).
-- Already-received COD stays listed so its history and cancel action remain.
-- transport_cod_items itself is NOT filtered: profit recognition reads it, and
-- an order with unscanned COD must still wait for that COD before it counts.
create or replace function public.is_transport_cod_item_deposited(p_transport_note_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.transport_notes t
    where t.id = p_transport_note_id
      and (t.transport_deposited_at is not null or t.transport_deposit_receipt_id is not null)
  );
$$;

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
  with visible as (
    select i.*, coalesce(receipt.amount, i.cod_amount) as amount,
      receipt.received_at, receipt.received_by_name
    from public.transport_cod_items i
    left join public.transport_cod_receipts receipt on
      (i.delivery_request_id is not null and receipt.delivery_request_id = i.delivery_request_id)
      or (receipt.transport_note_id = i.transport_note_id)
    where receipt.id is not null or public.is_transport_cod_item_deposited(i.transport_note_id)
  ), matched as (
    select * from visible i
    where coalesce(trim(p_query), '') = '' or strpos(lower(concat_ws(' ',
      i.note_no, i.order_code, i.receiver_name, i.receiver_phone,
      array_to_string(i.transporters, ' '), i.branch, i.received_by_name)), lower(trim(p_query))) > 0
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

-- Same as 20261103, plus: money cannot be received before the deposit scan.
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
  if not public.is_transport_cod_item_deposited(v_item.transport_note_id) then
    raise exception 'cod_not_deposited' using errcode = '22023';
  end if;
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

revoke all on function public.is_transport_cod_item_deposited(uuid) from public, anon, authenticated;
revoke all on function public.list_transport_cod(text,text,integer,integer) from public, anon;
revoke all on function public.receive_transport_cod(text,uuid,numeric) from public, anon;
grant execute on function public.list_transport_cod(text,text,integer,integer) to authenticated;
grant execute on function public.receive_transport_cod(text,uuid,numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
