-- Add due date fields for customer remaining 50% and planned factory payment date
alter table public.orders
  add column if not exists customer_remaining_due_at timestamptz null,
  add column if not exists factory_payment_due_at timestamptz null;
