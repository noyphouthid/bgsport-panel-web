alter table public.quotation_drafts
  add column if not exists design_deposit numeric(14,2) not null default 0;

alter table public.orders
  add column if not exists discount numeric(14,2) not null default 0;
