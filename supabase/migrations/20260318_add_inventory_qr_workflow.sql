create table if not exists public.order_qr_labels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  qr_code text not null unique,
  order_code text not null,
  factory_bill_code text null,
  label_status text not null default 'created' check (label_status in ('created', 'received', 'shipped')),
  received_at timestamptz null,
  received_by text null,
  shipped_at timestamptz null,
  shipped_by text null,
  last_scanned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists order_qr_labels_status_idx
  on public.order_qr_labels (label_status, created_at desc);

create index if not exists order_qr_labels_order_code_idx
  on public.order_qr_labels (order_code);

create table if not exists public.factory_receipts (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  received_by text not null,
  note text null,
  created_at timestamptz not null default now()
);

create table if not exists public.factory_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.factory_receipts (id) on delete cascade,
  qr_label_id uuid not null references public.order_qr_labels (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  qr_code text not null,
  created_at timestamptz not null default now(),
  unique (receipt_id, qr_label_id)
);

create index if not exists factory_receipt_items_receipt_idx
  on public.factory_receipt_items (receipt_id);

create index if not exists factory_receipt_items_order_idx
  on public.factory_receipt_items (order_id);

create table if not exists public.shipment_records (
  id uuid primary key default gen_random_uuid(),
  qr_label_id uuid not null references public.order_qr_labels (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  shipped_at timestamptz not null default now(),
  shipped_by text not null,
  note text null,
  collected_amount numeric(14,2) not null default 0 check (collected_amount >= 0),
  payment_method text null check (payment_method in ('cash', 'transfer')),
  created_at timestamptz not null default now()
);

create index if not exists shipment_records_order_idx
  on public.shipment_records (order_id, shipped_at desc);

create index if not exists shipment_records_qr_idx
  on public.shipment_records (qr_label_id, shipped_at desc);

create table if not exists public.shipment_payments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipment_records (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  paid_at timestamptz not null default now(),
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists shipment_payments_order_idx
  on public.shipment_payments (order_id, paid_at desc);

alter table public.order_qr_labels enable row level security;
alter table public.factory_receipts enable row level security;
alter table public.factory_receipt_items enable row level security;
alter table public.shipment_records enable row level security;
alter table public.shipment_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_qr_labels'
      and policyname = 'order_qr_labels_select_all'
  ) then
    create policy order_qr_labels_select_all
      on public.order_qr_labels
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_qr_labels'
      and policyname = 'order_qr_labels_insert_all'
  ) then
    create policy order_qr_labels_insert_all
      on public.order_qr_labels
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_qr_labels'
      and policyname = 'order_qr_labels_update_all'
  ) then
    create policy order_qr_labels_update_all
      on public.order_qr_labels
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
      and tablename = 'factory_receipts'
      and policyname = 'factory_receipts_select_all'
  ) then
    create policy factory_receipts_select_all
      on public.factory_receipts
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_receipts'
      and policyname = 'factory_receipts_insert_all'
  ) then
    create policy factory_receipts_insert_all
      on public.factory_receipts
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_receipt_items'
      and policyname = 'factory_receipt_items_select_all'
  ) then
    create policy factory_receipt_items_select_all
      on public.factory_receipt_items
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_receipt_items'
      and policyname = 'factory_receipt_items_insert_all'
  ) then
    create policy factory_receipt_items_insert_all
      on public.factory_receipt_items
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_records'
      and policyname = 'shipment_records_select_all'
  ) then
    create policy shipment_records_select_all
      on public.shipment_records
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_records'
      and policyname = 'shipment_records_insert_all'
  ) then
    create policy shipment_records_insert_all
      on public.shipment_records
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_payments'
      and policyname = 'shipment_payments_select_all'
  ) then
    create policy shipment_payments_select_all
      on public.shipment_payments
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_payments'
      and policyname = 'shipment_payments_insert_all'
  ) then
    create policy shipment_payments_insert_all
      on public.shipment_payments
      for insert
      with check (true);
  end if;
end $$;
