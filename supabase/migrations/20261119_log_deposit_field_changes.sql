begin;

-- Records what each edit of a deposit changed (old value -> new value), so the
-- history shows more than "edited". Runs in the database, so every way of saving
-- a deposit is covered, and the editor cannot skip or alter the record.

alter table public.factory_deposit_order_history add column if not exists changes jsonb;

create or replace function public.log_factory_deposit_field_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_changes jsonb := '[]'::jsonb;
  v_field text;
  v_actor uuid;
begin
  -- Plain values are stored as old -> new.
  foreach v_field in array array[
    'order_code','deposit_date','customer_name','customer_phone','customer_whatsapp','customer_facebook','team_name',
    'fabric_name','style_name','color_name','sleeve_type','collar_label','work_category_label',
    'short_qty','long_qty','free_qty','qty_3xl','qty_4xl','qty_5xl','qty_6xl','collar_qty','sleeve_charge_qty',
    'fabric_short_price','fabric_long_price','collar_unit_price','extra_charge','discount',
    'design_deposit','initial_deposit','factory_deposit_amount','factory_cost','gross_total','net_total','balance',
    'production_sent_date','delivery_date','payment_due_date','production_priority','urgent_due_date',
    'factory_bill_code','payment_terms','notes','warning_note','factory_deposit_note',
    'admin_user_id','graphic_user_id','transfer_slip_url'
  ] loop
    if (v_old -> v_field) is distinct from (v_new -> v_field) then
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', v_field, 'from', v_old -> v_field, 'to', v_new -> v_field));
    end if;
  end loop;
  -- Size, name and number lists are too large to show in full; only that they changed.
  foreach v_field in array array['production_items','pants_items'] loop
    if (v_old -> v_field) is distinct from (v_new -> v_field) then
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', v_field));
    end if;
  end loop;

  if jsonb_array_length(v_changes) = 0 then return null; end if;

  select id into v_actor from public.users where auth_user_id = auth.uid() limit 1;
  insert into public.factory_deposit_order_history(deposit_order_id, action, detail, from_status, to_status, action_by_user_id, changes)
    values (new.id, 'update', 'field changes', null, null, v_actor, v_changes);
  return null;
end $$;
revoke all on function public.log_factory_deposit_field_changes() from public, anon, authenticated;

drop trigger if exists log_factory_deposit_field_changes on public.factory_deposit_orders;
create trigger log_factory_deposit_field_changes after update on public.factory_deposit_orders
  for each row execute function public.log_factory_deposit_field_changes();

-- Lets the app check that this migration has been applied.
create or replace function public.deposit_field_change_log_enabled()
returns boolean language sql immutable security invoker set search_path = '' as $$ select true $$;
revoke all on function public.deposit_field_change_log_enabled() from public, anon;
grant execute on function public.deposit_field_change_log_enabled() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
