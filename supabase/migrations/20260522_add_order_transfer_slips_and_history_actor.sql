alter table public.order_status_history
  add column if not exists action_by_user_id uuid null references public.users (id) on delete set null,
  add column if not exists action_meta jsonb null;

create index if not exists order_status_history_action_by_idx
  on public.order_status_history (action_by_user_id, action_at desc);

create table if not exists public.order_transfer_slips (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  file_name text not null default '',
  file_path text not null,
  file_url text null,
  note text null,
  uploaded_by_user_id uuid null references public.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists order_transfer_slips_order_idx
  on public.order_transfer_slips (order_id, uploaded_at desc);

insert into public.order_transfer_slips (
  order_id,
  file_name,
  file_path,
  file_url,
  uploaded_at,
  created_at
)
select
  orders.id,
  coalesce(nullif(orders.order_transfer_slip_file_name, ''), split_part(orders.order_transfer_slip_path, '/', array_length(string_to_array(orders.order_transfer_slip_path, '/'), 1))),
  orders.order_transfer_slip_path,
  orders.order_transfer_slip_url,
  orders.updated_at,
  orders.created_at
from public.orders
where nullif(orders.order_transfer_slip_path, '') is not null
  and not exists (
    select 1
    from public.order_transfer_slips
    where order_transfer_slips.order_id = orders.id
      and order_transfer_slips.file_path = orders.order_transfer_slip_path
  );

alter table public.order_transfer_slips enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_transfer_slips'
      and policyname = 'order_transfer_slips_select_all'
  ) then
    create policy order_transfer_slips_select_all
      on public.order_transfer_slips
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_transfer_slips'
      and policyname = 'order_transfer_slips_insert_all'
  ) then
    create policy order_transfer_slips_insert_all
      on public.order_transfer_slips
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_transfer_slips'
      and policyname = 'order_transfer_slips_delete_all'
  ) then
    create policy order_transfer_slips_delete_all
      on public.order_transfer_slips
      for delete
      using (true);
  end if;
end $$;
