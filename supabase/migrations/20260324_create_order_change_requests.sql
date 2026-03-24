create table if not exists public.order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  request_type text not null check (
    request_type in ('cancel_factory_receipt', 'cancel_shipment')
  ),
  status text not null default 'submitted' check (
    status in ('submitted', 'approved', 'rejected')
  ),
  target_receipt_id uuid null references public.factory_receipts (id) on delete set null,
  target_shipment_id uuid null references public.shipment_records (id) on delete set null,
  request_reason text not null default '',
  decision_note text null,
  requested_by_user_id uuid null references public.users (id) on delete set null,
  approved_by_user_id uuid null references public.users (id) on delete set null,
  rejected_by_user_id uuid null references public.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz null,
  rejected_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_change_requests_order_idx
  on public.order_change_requests (order_id, requested_at desc);

create index if not exists order_change_requests_status_idx
  on public.order_change_requests (status, requested_at desc);

create index if not exists order_change_requests_receipt_idx
  on public.order_change_requests (target_receipt_id)
  where target_receipt_id is not null;

create index if not exists order_change_requests_shipment_idx
  on public.order_change_requests (target_shipment_id)
  where target_shipment_id is not null;

create unique index if not exists order_change_requests_open_receipt_unique
  on public.order_change_requests (request_type, order_id, target_receipt_id)
  where status = 'submitted' and request_type = 'cancel_factory_receipt';

create unique index if not exists order_change_requests_open_shipment_unique
  on public.order_change_requests (request_type, order_id, target_shipment_id)
  where status = 'submitted' and request_type = 'cancel_shipment';

alter table public.order_change_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_change_requests'
      and policyname = 'order_change_requests_select_all'
  ) then
    create policy order_change_requests_select_all
      on public.order_change_requests
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_change_requests'
      and policyname = 'order_change_requests_insert_all'
  ) then
    create policy order_change_requests_insert_all
      on public.order_change_requests
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_change_requests'
      and policyname = 'order_change_requests_update_all'
  ) then
    create policy order_change_requests_update_all
      on public.order_change_requests
      for update
      using (true)
      with check (true);
  end if;
end $$;
