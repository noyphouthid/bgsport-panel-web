create table if not exists public.shipment_delivery_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null,
  order_id uuid not null references public.orders (id) on delete cascade,
  qr_label_id uuid not null references public.order_qr_labels (id) on delete cascade,
  delivery_method text not null check (delivery_method in ('pickup', 'transport')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'delivered', 'cancelled')),
  requested_by_user_id uuid null references public.users (id) on delete set null,
  delivery_scheduled_at timestamptz not null default now(),
  delivery_person_name text not null default '',
  note text null,
  payment_outstanding_amount numeric(14,2) not null default 0 check (payment_outstanding_amount >= 0),
  payment_amount numeric(14,2) not null default 0 check (payment_amount >= 0),
  payment_method text null check (payment_method in ('cash', 'transfer')),
  payment_paid_at timestamptz null,
  transfer_slip_path text null,
  transfer_slip_url text null,
  transfer_slip_uploaded_at timestamptz null,
  transfer_slip_uploaded_by_user_id uuid null references public.users (id) on delete set null,
  transport_receiver_name text null,
  transport_receiver_phone text null,
  transport_branch text null,
  transport_city text null,
  transport_province text null,
  transport_providers text[] not null default '{}',
  transport_charge_mode text null check (transport_charge_mode in ('origin', 'destination')),
  approved_at timestamptz null,
  approved_by_user_id uuid null references public.users (id) on delete set null,
  delivered_at timestamptz null,
  delivered_by_user_id uuid null references public.users (id) on delete set null,
  rejected_at timestamptz null,
  rejected_by_user_id uuid null references public.users (id) on delete set null,
  rejection_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shipment_delivery_requests_request_no_idx
  on public.shipment_delivery_requests (request_no);

create index if not exists shipment_delivery_requests_order_idx
  on public.shipment_delivery_requests (order_id, created_at desc);

create index if not exists shipment_delivery_requests_status_idx
  on public.shipment_delivery_requests (status, created_at desc);

alter table public.shipment_delivery_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_delivery_requests'
      and policyname = 'shipment_delivery_requests_select_all'
  ) then
    create policy shipment_delivery_requests_select_all
      on public.shipment_delivery_requests
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_delivery_requests'
      and policyname = 'shipment_delivery_requests_insert_all'
  ) then
    create policy shipment_delivery_requests_insert_all
      on public.shipment_delivery_requests
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_delivery_requests'
      and policyname = 'shipment_delivery_requests_update_all'
  ) then
    create policy shipment_delivery_requests_update_all
      on public.shipment_delivery_requests
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
      and tablename = 'shipment_delivery_requests'
      and policyname = 'shipment_delivery_requests_delete_all'
  ) then
    create policy shipment_delivery_requests_delete_all
      on public.shipment_delivery_requests
      for delete
      using (true);
  end if;
end $$;
