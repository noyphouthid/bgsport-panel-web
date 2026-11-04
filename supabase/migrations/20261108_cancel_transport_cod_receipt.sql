begin;

-- The payment log keeps the cash received, which can exceed what the balance
-- actually dropped by. Cancelling must restore only the real reduction.
alter table public.payment_transactions
  add column if not exists cod_balance_applied numeric(14,2);

create or replace function public.post_transport_cod_payment(p_receipt_id uuid, p_cap_to_balance boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_receipt public.transport_cod_receipts%rowtype;
  v_order_id uuid;
  v_balance numeric;
  v_amount numeric;
begin
  select * into strict v_receipt from public.transport_cod_receipts where id = p_receipt_id;
  select order_id into v_order_id from public.shipment_delivery_requests where id = v_receipt.delivery_request_id;
  if v_order_id is null then
    select order_id into v_order_id from public.transport_notes where id = v_receipt.transport_note_id;
  end if;
  if v_order_id is null then return; end if;

  select greatest(0, coalesce(balance, 0)) into v_balance from public.orders where id = v_order_id for update;
  if not found then return; end if;
  v_amount := case when p_cap_to_balance then least(v_receipt.amount, v_balance) else v_receipt.amount end;
  if v_amount <= 0 then return; end if;

  insert into public.payment_transactions (order_id, amount, paid_at, note, cod_receipt_id, cod_balance_applied)
  values (v_order_id, v_amount, v_receipt.received_at, 'ຮັບຍອດ COD · ' || v_receipt.received_by_name, v_receipt.id, least(v_amount, v_balance));

  update public.orders set
    balance = greatest(0, v_balance - v_amount),
    customer_paid_full_at = case
      when v_balance - v_amount <= 0 then coalesce(customer_paid_full_at, v_receipt.received_at)
      else customer_paid_full_at end
  where id = v_order_id;
end;
$$;

-- Undo a receipt recorded by mistake: the item returns to pending, and removing
-- the receipt makes the existing trigger withdraw the recognized profit.
create or replace function public.cancel_transport_cod_receipt(p_source text, p_source_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.transport_cod_items%rowtype;
  v_receipt public.transport_cod_receipts%rowtype;
  v_user public.users%rowtype;
  v_request_id uuid;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_payment public.payment_transactions%rowtype;
  v_restore numeric := 0;
begin
  select * into v_user from public.users where auth_user_id = auth.uid() and is_active;
  if not public.can_manage_transport_cod() or v_user.role not in ('superadmin','accountant') then
    raise exception 'cod_forbidden' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('note','request') or p_source_id is null then
    raise exception 'invalid_cod_source' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'cod_cancel_reason_required' using errcode = '22023';
  end if;

  -- Same lock order as receive_transport_cod, so the two cannot deadlock.
  if p_source = 'request' then
    v_request_id := p_source_id;
  else
    select delivery_request_id into v_request_id from public.transport_notes where id = p_source_id;
  end if;
  if v_request_id is not null then
    perform 1 from public.shipment_delivery_requests where id = v_request_id for update;
    perform 1 from public.transport_notes where delivery_request_id = v_request_id order by id for update;
  else
    perform 1 from public.transport_notes where id = p_source_id for update;
  end if;

  select * into v_item from public.transport_cod_items where source = p_source and source_id = p_source_id;
  if not found then
    raise exception 'cod_item_not_found' using errcode = 'P0002';
  end if;
  select * into v_receipt from public.transport_cod_receipts
    where (v_item.delivery_request_id is not null and delivery_request_id = v_item.delivery_request_id)
      or transport_note_id = v_item.transport_note_id
    for update;
  -- Already cancelled: a retry must not restore the balance twice.
  if not found then return; end if;

  select order_id into v_order_id from public.shipment_delivery_requests where id = v_receipt.delivery_request_id;
  if v_order_id is null then
    select order_id into v_order_id from public.transport_notes where id = v_receipt.transport_note_id;
  end if;

  if v_order_id is not null then
    select * into v_order from public.orders where id = v_order_id for update;
    -- A closed order must have no balance; reopen it first.
    if v_order.status = 'completed' or v_order.closed_at is not null then
      raise exception 'cod_order_closed' using errcode = '22023';
    end if;
    select * into v_payment from public.payment_transactions where cod_receipt_id = v_receipt.id;
    if found then
      v_restore := coalesce(v_payment.cod_balance_applied, v_payment.amount);
      delete from public.payment_transactions where id = v_payment.id;
    end if;
    if v_restore > 0 then
      update public.orders set balance = coalesce(balance, 0) + v_restore, customer_paid_full_at = null
      where id = v_order_id;
    end if;
    -- Deleting the receipt loses who received it, so the history keeps both names.
    insert into public.order_status_history (order_id, action, detail, action_by_user_id, action_meta)
    values (v_order_id, 'cancel_cod_receipt',
      format('Canceled COD receipt %s; amount=%s; received_by=%s; reason=%s',
        v_item.note_no, v_receipt.amount, v_receipt.received_by_name, trim(p_reason)),
      v_user.id,
      jsonb_build_object('received_at', v_receipt.received_at, 'received_by_user_id', v_receipt.received_by_user_id,
        'payment_amount', v_payment.amount, 'balance_restored', v_restore));
  end if;

  delete from public.transport_cod_receipts where id = v_receipt.id;
end;
$$;

revoke all on function public.post_transport_cod_payment(uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_transport_cod_receipt(text, uuid, text) from public, anon;
grant execute on function public.cancel_transport_cod_receipt(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
