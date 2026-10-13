-- Monthly drafts and immutable, versioned closing/payment records.
create table if not exists public.payroll_months (
  month_key text primary key check (month_key ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$'),
  status text not null default 'draft' check (status in ('draft', 'closed')),
  draft_employees jsonb not null default '[]'::jsonb check (jsonb_typeof(draft_employees) = 'array'),
  reopened_at timestamptz,
  reopened_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  month_key text not null references public.payroll_months(month_key),
  revision integer not null check (revision > 0),
  payment_date date not null,
  closed_at timestamptz not null default now(),
  closed_by_user_id uuid references public.users(id) on delete set null,
  closed_by_name text not null,
  employee_count integer not null check (employee_count > 0),
  gross_income numeric not null,
  total_deduction numeric not null,
  net_salary numeric not null,
  entries jsonb not null check (jsonb_typeof(entries) = 'array'),
  unique (month_key, revision)
);
create index if not exists payroll_runs_payment_date_idx on public.payroll_runs(payment_date);

-- Match the payroll route's financial roles and explicit access denial.
create or replace function public.can_manage_payroll_history()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where auth.uid() is not null
      and (u.auth_user_id = auth.uid() or (
        u.auth_user_id is null and lower(u.email) = lower(auth.jwt()->>'email')
      ))
      and u.is_active
      and regexp_replace(lower(u.role), '[-_ ]', '', 'g') in ('superadmin','manager','accountant')
      and coalesce(u.permission_settings->'access'->>'/payroll','inherit') <> 'deny'
  );
$$;

alter table public.payroll_months enable row level security;
alter table public.payroll_runs enable row level security;
drop policy if exists payroll_months_read on public.payroll_months;
create policy payroll_months_read on public.payroll_months for select to authenticated
  using (public.can_manage_payroll_history());
drop policy if exists payroll_runs_read on public.payroll_runs;
create policy payroll_runs_read on public.payroll_runs for select to authenticated
  using (public.can_manage_payroll_history());
revoke all on public.payroll_months, public.payroll_runs from anon, authenticated;
grant select on public.payroll_months, public.payroll_runs to authenticated;

-- Every mutation locks the same month, preventing save/close/reopen races.
create or replace function public.prepare_payroll_month_internal(p_month_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_manage_payroll_history() then
    raise exception 'Payroll access denied' using errcode = '42501';
  end if;
  if p_month_key is null or p_month_key !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid payroll month';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll:' || p_month_key, 0));
  insert into public.payroll_months(month_key, draft_employees)
    select p_month_key, coalesce(jsonb_agg(to_jsonb(e) order by e.full_name, e.employee_code), '[]'::jsonb)
    from public.payroll_employees e
    on conflict (month_key) do nothing;
end;
$$;

create or replace function public.save_payroll_month_employees(p_month_key text, p_employees jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_month public.payroll_months;
  v_input jsonb;
  v_employee public.payroll_employees;
begin
  perform public.prepare_payroll_month_internal(p_month_key);
  select * into v_month from public.payroll_months where month_key = p_month_key for update;
  if v_month.status = 'closed' then raise exception 'Payroll month is closed; reopen it before editing'; end if;
  if p_employees is null or jsonb_typeof(p_employees) <> 'array' or jsonb_array_length(p_employees) = 0 then
    raise exception 'Employee list is required';
  end if;
  if exists (select 1 from jsonb_array_elements(p_employees) e group by e->>'employee_code' having count(*) > 1) then
    raise exception 'Duplicate employee codes';
  end if;
  for v_input in select value from jsonb_array_elements(p_employees) loop
    if jsonb_typeof(v_input) <> 'object' or exists (
      select 1 from unnest(array['working_days','overtime_hours','base_salary','overtime_rate',
        'attendance_bonus','commission','allowance','late_penalty','leave_penalty',
        'social_security','tax','other_deduction']) k
      where jsonb_typeof(v_input->k) is distinct from 'number'
    ) then raise exception 'Payroll amounts must be JSON numbers'; end if;
    v_employee := jsonb_populate_record(null::public.payroll_employees, v_input);
    if v_employee.id is null or coalesce(trim(v_employee.employee_code),'') = '' or coalesce(trim(v_employee.full_name),'') = '' then
      raise exception 'Employee ID, code and name are required';
    end if;
    -- The table's existing constraints validate every numeric payroll field.
    -- Templates seed future months; other saved monthly drafts remain independent.
    insert into public.payroll_employees as e (
      id, employee_code, full_name, department, position, working_days, overtime_hours,
      base_salary, overtime_rate, attendance_bonus, commission, allowance, late_penalty,
      leave_penalty, social_security, tax, other_deduction, is_active, updated_at
    ) values (
      v_employee.id, trim(v_employee.employee_code), trim(v_employee.full_name),
      v_employee.department, v_employee.position, v_employee.working_days, v_employee.overtime_hours,
      v_employee.base_salary, v_employee.overtime_rate, v_employee.attendance_bonus,
      v_employee.commission, v_employee.allowance, v_employee.late_penalty, v_employee.leave_penalty,
      v_employee.social_security, v_employee.tax, v_employee.other_deduction, v_employee.is_active, now()
    ) on conflict (id) do update set
      employee_code = excluded.employee_code, full_name = excluded.full_name,
      department = excluded.department, position = excluded.position, working_days = excluded.working_days,
      overtime_hours = excluded.overtime_hours, base_salary = excluded.base_salary,
      overtime_rate = excluded.overtime_rate, attendance_bonus = excluded.attendance_bonus,
      commission = excluded.commission, allowance = excluded.allowance, late_penalty = excluded.late_penalty,
      leave_penalty = excluded.leave_penalty, social_security = excluded.social_security,
      tax = excluded.tax, other_deduction = excluded.other_deduction,
      is_active = excluded.is_active, updated_at = now()
    returning * into v_employee;
    v_month.draft_employees := (
      select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(v_month.draft_employees)
      where value->>'id' <> v_employee.id::text
    ) || jsonb_build_array(to_jsonb(v_employee));
  end loop;
  update public.payroll_months set draft_employees = v_month.draft_employees, updated_at = now()
    where month_key = p_month_key;
end;
$$;

create or replace function public.remove_payroll_month_employee(p_month_key text, p_employee_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month public.payroll_months;
begin
  perform public.prepare_payroll_month_internal(p_month_key);
  select * into v_month from public.payroll_months where month_key = p_month_key for update;
  if v_month.status = 'closed' then raise exception 'Payroll month is closed; reopen it before editing'; end if;
  delete from public.payroll_employees where id = p_employee_id;
  update public.payroll_months set draft_employees = (
    select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(v_month.draft_employees)
    where value->>'id' <> p_employee_id::text
  ), updated_at = now() where month_key = p_month_key;
end;
$$;

create or replace function public.close_payroll_month(
  p_month_key text, p_payment_date date, p_expected_employees jsonb
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_month public.payroll_months;
  v_entries jsonb;
  v_id uuid;
  v_actor public.users;
begin
  perform public.prepare_payroll_month_internal(p_month_key);
  select * into v_month from public.payroll_months where month_key = p_month_key for update;
  if v_month.status = 'closed' then raise exception 'Payroll month is already closed'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  if p_expected_employees is null or p_expected_employees <> v_month.draft_employees then
    raise exception 'Payroll changed; refresh and review before closing';
  end if;
  -- Calculate with PostgreSQL numeric arithmetic and freeze inputs AND totals.
  select coalesce(jsonb_agg(e || jsonb_build_object(
    'overtimePay', ot, 'grossIncome', gross, 'totalDeduction', deduction,
    'netSalary', gross - deduction,
    'paymentStatus', case when (e->>'leave_penalty')::numeric > 0 or (e->>'late_penalty')::numeric > 50000
      then 'reviewing' else 'ready' end
  ) order by e->>'full_name', e->>'employee_code'), '[]'::jsonb) into v_entries
  from (
    select e, ot,
      round((e->>'base_salary')::numeric + ot + (e->>'attendance_bonus')::numeric
        + (e->>'commission')::numeric + (e->>'allowance')::numeric, 2) as gross,
      round((e->>'late_penalty')::numeric + (e->>'leave_penalty')::numeric
        + (e->>'social_security')::numeric + (e->>'tax')::numeric + (e->>'other_deduction')::numeric, 2) as deduction
    from (
      select e, round((e->>'overtime_hours')::numeric * (e->>'overtime_rate')::numeric, 2) as ot
      from jsonb_array_elements(v_month.draft_employees) e where (e->>'is_active')::boolean
    ) inputs
  ) amounts;
  if jsonb_array_length(v_entries) = 0 then raise exception 'No active employees to close'; end if;
  select * into v_actor from public.users u where u.is_active and
    (u.auth_user_id = auth.uid() or (u.auth_user_id is null and lower(u.email) = lower(auth.jwt()->>'email')))
    order by (u.auth_user_id = auth.uid()) desc nulls last limit 1;
  insert into public.payroll_runs(month_key, revision, payment_date, closed_by_user_id, closed_by_name,
    employee_count, gross_income, total_deduction, net_salary, entries)
  select p_month_key, coalesce((select max(revision) from public.payroll_runs where month_key = p_month_key),0) + 1,
    p_payment_date, v_actor.id, coalesce(v_actor.full_name,''), jsonb_array_length(v_entries),
    sum((e->>'grossIncome')::numeric), sum((e->>'totalDeduction')::numeric), sum((e->>'netSalary')::numeric), v_entries
  from jsonb_array_elements(v_entries) e returning id into v_id;
  update public.payroll_months set status = 'closed', updated_at = now() where month_key = p_month_key;
  return v_id;
end;
$$;

create or replace function public.reopen_payroll_month(p_month_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month public.payroll_months;
begin
  perform public.prepare_payroll_month_internal(p_month_key);
  select * into v_month from public.payroll_months where month_key = p_month_key for update;
  if v_month.status <> 'closed' then raise exception 'Payroll month is not closed'; end if;
  update public.payroll_months set status = 'draft', reopened_at = now(), updated_at = now(),
    reopened_by_name = (select full_name from public.users where auth_user_id = auth.uid() limit 1)
    where month_key = p_month_key;
  -- Runs are never updated/deleted. A subsequent close creates a new revision.
end;
$$;

revoke all on function public.can_manage_payroll_history() from public, anon;
grant execute on function public.can_manage_payroll_history() to authenticated;
revoke all on function public.prepare_payroll_month_internal(text) from public, anon, authenticated;
revoke all on function public.save_payroll_month_employees(text,jsonb) from public, anon;
revoke all on function public.remove_payroll_month_employee(text,uuid) from public, anon;
revoke all on function public.close_payroll_month(text,date,jsonb) from public, anon;
revoke all on function public.reopen_payroll_month(text) from public, anon;
grant execute on function public.save_payroll_month_employees(text,jsonb) to authenticated;
grant execute on function public.remove_payroll_month_employee(text,uuid) to authenticated;
grant execute on function public.close_payroll_month(text,date,jsonb) to authenticated;
grant execute on function public.reopen_payroll_month(text) to authenticated;
