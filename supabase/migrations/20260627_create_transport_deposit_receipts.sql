create table if not exists public.transport_deposit_receipts (
  id uuid primary key default gen_random_uuid(),
  confirmed_at timestamptz not null default now(),
  confirmed_by text not null,
  note text null,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_deposit_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.transport_deposit_receipts (id) on delete cascade,
  transport_note_id uuid not null references public.transport_notes (id),
  delivery_request_id uuid not null references public.shipment_delivery_requests (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  qr_code text not null,
  created_at timestamptz not null default now(),
  unique (receipt_id, transport_note_id),
  unique (transport_note_id),
  unique (delivery_request_id)
);

create index if not exists transport_deposit_receipt_items_receipt_idx
  on public.transport_deposit_receipt_items (receipt_id);

create index if not exists transport_deposit_receipt_items_order_idx
  on public.transport_deposit_receipt_items (order_id);

alter table public.transport_notes
  add column if not exists transport_deposited_at timestamptz null,
  add column if not exists transport_deposited_by text null,
  add column if not exists transport_deposit_receipt_id uuid null references public.transport_deposit_receipts (id) on delete set null;

create index if not exists transport_notes_deposit_idx
  on public.transport_notes (transport_deposited_at desc nulls last, created_at desc);

alter table public.transport_deposit_receipts enable row level security;
alter table public.transport_deposit_receipt_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_deposit_receipts'
      and policyname = 'transport_deposit_receipts_select_all'
  ) then
    create policy transport_deposit_receipts_select_all
      on public.transport_deposit_receipts
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_deposit_receipts'
      and policyname = 'transport_deposit_receipts_insert_all'
  ) then
    create policy transport_deposit_receipts_insert_all
      on public.transport_deposit_receipts
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_deposit_receipts'
      and policyname = 'transport_deposit_receipts_delete_all'
  ) then
    create policy transport_deposit_receipts_delete_all
      on public.transport_deposit_receipts
      for delete
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_deposit_receipt_items'
      and policyname = 'transport_deposit_receipt_items_select_all'
  ) then
    create policy transport_deposit_receipt_items_select_all
      on public.transport_deposit_receipt_items
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_deposit_receipt_items'
      and policyname = 'transport_deposit_receipt_items_insert_all'
  ) then
    create policy transport_deposit_receipt_items_insert_all
      on public.transport_deposit_receipt_items
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_deposit_receipt_items'
      and policyname = 'transport_deposit_receipt_items_delete_all'
  ) then
    create policy transport_deposit_receipt_items_delete_all
      on public.transport_deposit_receipt_items
      for delete
      using (true);
  end if;
end $$;
