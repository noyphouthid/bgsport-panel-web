-- Assign responsible users to each order for reporting.
alter table public.orders
  add column if not exists admin_user_id uuid null references public.users (id),
  add column if not exists graphic_user_id uuid null references public.users (id);

create index if not exists orders_admin_user_id_idx
  on public.orders (admin_user_id);

create index if not exists orders_graphic_user_id_idx
  on public.orders (graphic_user_id);
