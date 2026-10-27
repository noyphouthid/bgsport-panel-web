begin;

-- Design deductions belong to each quotation and must be entered explicitly.
-- Keep customer links, repeat-order codes and existing financial records intact.
create or replace function public.link_workflow_customer()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare q public.design_queue_entries; qt public.quotation_drafts;
begin
  if TG_TABLE_NAME = 'quotation_drafts' then
    if new.design_queue_entry_id is not null and (TG_OP = 'INSERT' or new.design_queue_entry_id is distinct from old.design_queue_entry_id) then
      select * into strict q from public.design_queue_entries where id = new.design_queue_entry_id;
      if TG_OP = 'UPDATE' and new.order_code is not distinct from old.order_code then
        -- A link-only change inherits the newly selected queue's code.
        new.order_code := q.type_code || '-' || q.order_no;
      else
        new.order_code := coalesce(nullif(btrim(new.order_code), ''), q.type_code || '-' || q.order_no);
      end if;
      new.customer_phone := coalesce(nullif(new.customer_phone, ''), q.customer_phone);
      new.customer_name := coalesce(nullif(new.customer_name, ''), q.customer_name);
      new.work_category := coalesce(q.work_category, new.work_category);
      -- Preserve the submitted design_deposit; queue payments never set or clear it.
    end if;
  else
    if nullif(new.quotation_draft_id, '') is not null and (TG_OP = 'INSERT' or new.quotation_draft_id is distinct from old.quotation_draft_id) then
      select * into strict qt from public.quotation_drafts where id::text = new.quotation_draft_id;
      new.design_queue_entry_id := qt.design_queue_entry_id;
      new.quotation_quote_no := qt.quote_no;
      if TG_OP = 'UPDATE' and new.order_code is not distinct from old.order_code then
        new.order_code := coalesce(nullif(btrim(qt.order_code), ''), new.order_code);
      else
        new.order_code := coalesce(nullif(btrim(new.order_code), ''), nullif(btrim(qt.order_code), ''));
      end if;
      new.customer_name := qt.customer_name;
      new.customer_phone := qt.customer_phone;
      new.work_category := qt.work_category;
      new.design_deposit := qt.design_deposit;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.link_workflow_customer() from public;

-- The client checks this before any quotation save, so an older trigger cannot
-- silently restore an automatic deduction during deployment.
create or replace function public.quotation_design_deposit_is_manual()
returns boolean language sql immutable security invoker set search_path = public
as $$ select true $$;
revoke all on function public.quotation_design_deposit_is_manual() from public, anon;
grant execute on function public.quotation_design_deposit_is_manual() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
