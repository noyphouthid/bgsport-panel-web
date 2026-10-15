-- Existing orders remain unclassified until a user chooses their work category.
alter table public.orders add column if not exists work_category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_work_category_check'
  ) then
    alter table public.orders add constraint orders_work_category_check
      check (work_category is null or work_category in (
        'team_group', 'cockfighting', 'boat_racing', 'automotive',
        'rocket_festival', 'religious', 'sports', 'other'
      ));
  end if;
end $$;

create index if not exists orders_work_category_date_idx
  on public.orders (work_category, order_date);

comment on column public.orders.work_category is
  'Customer work/use category for monthly marketing analysis; independent of order code TYPE.';

notify pgrst, 'reload schema';
