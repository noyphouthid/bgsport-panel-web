begin;

-- A COD receipt is customer money: post it to the same payment log and order
-- balance as every other payment. The unique link stops a receipt posting twice.
-- shipment_id stays null so cancelling a shipment does not erase money received.
alter table public.payment_transactions
  add column if not exists cod_receipt_id uuid unique
    references public.transport_cod_receipts(id) on delete set null;

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
  -- Standalone transport notes have no order to settle.
  if v_order_id is null then return; end if;

  select greatest(0, coalesce(balance, 0)) into v_balance from public.orders where id = v_order_id for update;
  if not found then return; end if;
  v_amount := case when p_cap_to_balance then least(v_receipt.amount, v_balance) else v_receipt.amount end;
  if v_amount <= 0 then return; end if;

  insert into public.payment_transactions (order_id, amount, paid_at, note, cod_receipt_id)
  values (v_order_id, v_amount, v_receipt.received_at, 'ຮັບຍອດ COD · ' || v_receipt.received_by_name, v_receipt.id);

  update public.orders set
    balance = greatest(0, v_balance - v_amount),
    customer_paid_full_at = case
      when v_balance - v_amount <= 0 then coalesce(customer_paid_full_at, v_receipt.received_at)
      else customer_paid_full_at end
  where id = v_order_id;
end;
$$;

create or replace function public.settle_order_on_cod_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.post_transport_cod_payment(new.id, false);
  return null;
end;
$$;
drop trigger if exists settle_order_on_cod_receipt on public.transport_cod_receipts;
create trigger settle_order_on_cod_receipt after insert on public.transport_cod_receipts
  for each row execute function public.settle_order_on_cod_receipt();

-- Backfill receipts recorded before this migration, dated when the money arrived.
-- Capped to the current balance: staff may already have entered the money by hand
-- on the order page, and an order that is already settled must not gain income.
do $$
declare v_receipt_id uuid;
begin
  for v_receipt_id in
    select c.id from public.transport_cod_receipts c
    where not exists (select 1 from public.payment_transactions t where t.cod_receipt_id = c.id)
    order by c.received_at, c.id
  loop
    perform public.post_transport_cod_payment(v_receipt_id, true);
  end loop;
end;
$$;

revoke all on function public.post_transport_cod_payment(uuid, boolean) from public, anon, authenticated;
revoke all on function public.settle_order_on_cod_receipt() from public, anon, authenticated;

comment on table public.transport_cod_receipts is
  'Transport COD receipts. Each receipt linked to an order posts one payment_transactions row and reduces orders.balance.';
notify pgrst, 'reload schema';
commit;
