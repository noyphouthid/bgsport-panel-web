begin;

-- Orders produced without expecting profit (sponsorship shirts, remakes of faulty
-- work). They keep factory codes, factory costs and factory payments, but profit
-- reports skip them. Only a superadmin or manager may set or clear the flag.
-- Same design as customer-erp-web (Sai Sport), 20261104000200_exclude_profit.sql.
alter table public.orders add column if not exists exclude_profit boolean not null default false;

create or replace function public.guard_order_exclude_profit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' and new.exclude_profit)
    or (tg_op = 'UPDATE' and new.exclude_profit is distinct from old.exclude_profit) then
    select role into v_role from public.users where auth_user_id = auth.uid() and is_active limit 1;
    if v_role is distinct from 'superadmin' and v_role is distinct from 'manager' then
      raise exception 'Only managers can change profit exclusion' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_order_exclude_profit() from public, anon, authenticated;
drop trigger if exists guard_order_exclude_profit on public.orders;
create trigger guard_order_exclude_profit before insert or update of exclude_profit on public.orders
  for each row execute function public.guard_order_exclude_profit();

notify pgrst, 'reload schema';
commit;
