create table if not exists public.transport_notes (
  id uuid primary key default gen_random_uuid(),
  note_no text not null,
  source_type text not null default 'standalone' check (source_type in ('standalone', 'shipment_request')),
  order_id uuid null references public.orders (id) on delete set null,
  delivery_request_id uuid null references public.shipment_delivery_requests (id) on delete set null,
  receiver_name text not null default '',
  receiver_phone text not null default '',
  branch text null,
  city text null,
  province text null,
  transporters text[] not null default '{}',
  shipping_charge_mode text not null default 'destination' check (shipping_charge_mode in ('origin', 'destination')),
  note text null,
  status text not null default 'saved' check (status in ('draft', 'saved')),
  printed_at timestamptz null,
  printed_by text null,
  print_count integer not null default 0,
  last_printed_at timestamptz null,
  created_by_user_id uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists transport_notes_note_no_idx
  on public.transport_notes (note_no);

create index if not exists transport_notes_order_idx
  on public.transport_notes (order_id, created_at desc);

create index if not exists transport_notes_request_idx
  on public.transport_notes (delivery_request_id, created_at desc);

create index if not exists transport_notes_print_idx
  on public.transport_notes (last_printed_at desc nulls last, created_at desc);

alter table public.transport_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_notes'
      and policyname = 'transport_notes_select_all'
  ) then
    create policy transport_notes_select_all
      on public.transport_notes
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_notes'
      and policyname = 'transport_notes_insert_all'
  ) then
    create policy transport_notes_insert_all
      on public.transport_notes
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transport_notes'
      and policyname = 'transport_notes_update_all'
  ) then
    create policy transport_notes_update_all
      on public.transport_notes
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
      and tablename = 'transport_notes'
      and policyname = 'transport_notes_delete_all'
  ) then
    create policy transport_notes_delete_all
      on public.transport_notes
      for delete
      using (true);
  end if;
end $$;
