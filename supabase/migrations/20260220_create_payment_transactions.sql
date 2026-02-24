-- Phase 2: transaction-level payment history
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists payment_transactions_order_id_idx
  on public.payment_transactions (order_id);

create index if not exists payment_transactions_paid_at_idx
  on public.payment_transactions (paid_at desc);

alter table public.payment_transactions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_transactions'
      and policyname = 'payment_transactions_select_all'
  ) then
    create policy payment_transactions_select_all
      on public.payment_transactions
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_transactions'
      and policyname = 'payment_transactions_insert_all'
  ) then
    create policy payment_transactions_insert_all
      on public.payment_transactions
      for insert
      with check (true);
  end if;
end $$;
