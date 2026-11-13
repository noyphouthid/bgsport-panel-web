begin;

-- Cancels a customer payment that was received by hand on the order page.
-- In one transaction it removes the payment, adds the amount back to the
-- order balance and writes the order history, so the balance, reports and
-- payment list never disagree.
-- Payments that came from another workflow are refused, because that workflow
-- owns their undo:
--   shipment_id    -> cancel the shipment (change requests)
--   cod_receipt_id -> cancel the COD receipt (shipments / COD)
-- Returns the amount added back to the balance.
create or replace function public.cancel_customer_payment(p_payment_id uuid, p_reason text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_user public.users%rowtype;
  v_payment public.payment_transactions%rowtype;
  v_order public.orders%rowtype;
  v_max_balance numeric;
  v_new_balance numeric;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_user from public.users where auth_user_id = auth.uid() and is_active limit 1;
  if v_user.id is null
    or v_user.role not in ('superadmin', 'admin', 'manager', 'staff', 'accountant')
    or coalesce(v_user.permission_settings -> 'edit' ->> 'orders', 'inherit') = 'deny' then
    raise exception 'payment_cancel_forbidden' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'payment_cancel_reason_required' using errcode = '22023';
  end if;

  select * into v_payment from public.payment_transactions where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if v_payment.shipment_id is not null then
    raise exception 'payment_linked_to_shipment' using errcode = '22023';
  end if;
  if v_payment.cod_receipt_id is not null then
    raise exception 'payment_linked_to_cod' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  if v_order.status = 'completed' or v_order.closed_at is not null then
    raise exception 'payment_order_closed' using errcode = '22023';
  end if;

  -- The balance can never exceed the bill minus the design and production deposits.
  v_max_balance := greatest(0, coalesce(v_order.net_total, 0) - coalesce(v_order.design_deposit, 0) - coalesce(v_order.initial_deposit, 0));
  v_new_balance := least(coalesce(v_order.balance, 0) + v_payment.amount, v_max_balance);

  delete from public.payment_transactions where id = v_payment.id;

  update public.orders
  set balance = v_new_balance,
      customer_paid_full_at = case when v_new_balance <= 0 then customer_paid_full_at else null end
  where id = v_order.id;

  insert into public.order_status_history (order_id, action, detail, action_at, action_by_user_id, action_meta)
  values (
    v_order.id,
    'cancel_customer_payment',
    format('Canceled customer payment %s; paid_at=%s; reason=%s', v_payment.amount, v_payment.paid_at, v_reason),
    now(),
    v_user.id,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'paid_at', v_payment.paid_at,
      'note', v_payment.note,
      'balance_before', v_order.balance,
      'balance_after', v_new_balance,
      'reason', v_reason
    )
  );

  return v_new_balance - coalesce(v_order.balance, 0);
end $$;

revoke all on function public.cancel_customer_payment(uuid, text) from public, anon;
grant execute on function public.cancel_customer_payment(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
