create table if not exists public.factory_deposit_orders (
  id uuid primary key default gen_random_uuid(),
  quotation_draft_id text null,
  quotation_quote_no text null,
  quotation_snapshot jsonb not null default '{}'::jsonb,

  deposit_no text not null,
  deposit_date date not null default current_date,
  order_code text null,
  order_date date null,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'approved', 'converted', 'cancelled')
  ),

  order_id uuid null references public.orders (id) on delete set null,
  converted_at timestamptz null,
  converted_by_user_id uuid null references public.users (id) on delete set null,
  approved_at timestamptz null,
  approved_by_user_id uuid null references public.users (id) on delete set null,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null references public.users (id) on delete set null,

  customer_name text not null default '',
  customer_phone text not null default '',
  customer_whatsapp text not null default '',
  customer_facebook text not null default '',

  fabric_id uuid null,
  fabric_name text not null default '',
  fabric_short_price numeric(14,2) not null default 0,
  fabric_long_price numeric(14,2) not null default 0,

  style_name text not null default '',
  color_name text not null default '',
  sleeve_type text not null default 'short' check (sleeve_type in ('short', 'long', 'mixed')),
  collar_type text not null default 'none' check (collar_type in ('none', 'polo', 'mandarin')),
  collar_qty integer not null default 0,

  short_qty integer not null default 0,
  long_qty integer not null default 0,
  free_qty integer not null default 0,
  qty_3xl integer not null default 0,
  qty_4xl integer not null default 0,
  qty_5xl integer not null default 0,
  qty_6xl integer not null default 0,

  extra_charge numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  design_deposit numeric(14,2) not null default 0,
  initial_deposit numeric(14,2) not null default 0,
  factory_deposit_amount numeric(14,2) not null default 0,
  factory_cost numeric(14,2) not null default 0,
  gross_total numeric(14,2) not null default 0,
  net_total numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,

  payment_due_date date null,
  delivery_date date null,
  factory_bill_code text null,
  payment_terms text not null default '',
  notes text not null default '',
  warning_note text not null default '',
  factory_deposit_note text not null default '',

  transfer_slip_url text null,
  transfer_slip_path text null,
  transfer_slip_uploaded_at timestamptz null,
  transfer_slip_uploaded_by_user_id uuid null references public.users (id) on delete set null,

  created_by_user_id uuid null references public.users (id) on delete set null,
  admin_user_id uuid null references public.users (id) on delete set null,
  graphic_user_id uuid null references public.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.factory_deposit_orders
  add column if not exists order_code text null,
  add column if not exists order_date date null;

create unique index if not exists factory_deposit_orders_deposit_no_key
  on public.factory_deposit_orders (deposit_no);

create index if not exists factory_deposit_orders_order_code_idx
  on public.factory_deposit_orders (order_code);

create index if not exists factory_deposit_orders_status_idx
  on public.factory_deposit_orders (status, deposit_date desc);

create index if not exists factory_deposit_orders_created_by_idx
  on public.factory_deposit_orders (created_by_user_id, created_at desc);

create index if not exists factory_deposit_orders_admin_idx
  on public.factory_deposit_orders (admin_user_id);

create index if not exists factory_deposit_orders_graphic_idx
  on public.factory_deposit_orders (graphic_user_id);

create index if not exists factory_deposit_orders_order_id_idx
  on public.factory_deposit_orders (order_id);

create table if not exists public.factory_deposit_order_history (
  id uuid primary key default gen_random_uuid(),
  deposit_order_id uuid not null references public.factory_deposit_orders (id) on delete cascade,
  action text not null,
  detail text null,
  from_status text null,
  to_status text null,
  action_by_user_id uuid null references public.users (id) on delete set null,
  action_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists factory_deposit_order_history_order_idx
  on public.factory_deposit_order_history (deposit_order_id, action_at desc);

alter table public.factory_deposit_orders enable row level security;
alter table public.factory_deposit_order_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_orders'
      and policyname = 'factory_deposit_orders_select_all'
  ) then
    create policy factory_deposit_orders_select_all
      on public.factory_deposit_orders
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_orders'
      and policyname = 'factory_deposit_orders_insert_all'
  ) then
    create policy factory_deposit_orders_insert_all
      on public.factory_deposit_orders
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_orders'
      and policyname = 'factory_deposit_orders_update_all'
  ) then
    create policy factory_deposit_orders_update_all
      on public.factory_deposit_orders
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
      and tablename = 'factory_deposit_orders'
      and policyname = 'factory_deposit_orders_delete_all'
  ) then
    create policy factory_deposit_orders_delete_all
      on public.factory_deposit_orders
      for delete
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_order_history'
      and policyname = 'factory_deposit_order_history_select_all'
  ) then
    create policy factory_deposit_order_history_select_all
      on public.factory_deposit_order_history
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_order_history'
      and policyname = 'factory_deposit_order_history_insert_all'
  ) then
    create policy factory_deposit_order_history_insert_all
      on public.factory_deposit_order_history
      for insert
      with check (true);
  end if;
end $$;
