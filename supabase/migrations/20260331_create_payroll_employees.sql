create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null,
  full_name text not null default '',
  department text not null default '',
  position text not null default '',
  working_days integer not null default 26 check (working_days >= 0),
  overtime_hours numeric(10,2) not null default 0 check (overtime_hours >= 0),
  base_salary numeric(14,2) not null default 0 check (base_salary >= 0),
  overtime_rate numeric(14,2) not null default 0 check (overtime_rate >= 0),
  attendance_bonus numeric(14,2) not null default 0 check (attendance_bonus >= 0),
  commission numeric(14,2) not null default 0 check (commission >= 0),
  allowance numeric(14,2) not null default 0 check (allowance >= 0),
  late_penalty numeric(14,2) not null default 0 check (late_penalty >= 0),
  leave_penalty numeric(14,2) not null default 0 check (leave_penalty >= 0),
  social_security numeric(14,2) not null default 0 check (social_security >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  other_deduction numeric(14,2) not null default 0 check (other_deduction >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payroll_employees_employee_code_key
  on public.payroll_employees (employee_code);

create index if not exists payroll_employees_active_idx
  on public.payroll_employees (is_active, full_name);

alter table public.payroll_employees enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_employees'
      and policyname = 'payroll_employees_select_all'
  ) then
    create policy payroll_employees_select_all
      on public.payroll_employees
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_employees'
      and policyname = 'payroll_employees_insert_all'
  ) then
    create policy payroll_employees_insert_all
      on public.payroll_employees
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_employees'
      and policyname = 'payroll_employees_update_all'
  ) then
    create policy payroll_employees_update_all
      on public.payroll_employees
      for update
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_employees'
      and policyname = 'payroll_employees_delete_all'
  ) then
    create policy payroll_employees_delete_all
      on public.payroll_employees
      for delete
      using (true);
  end if;
end $$;
