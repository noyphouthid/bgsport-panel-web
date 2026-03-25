alter table public.order_qr_labels
  add column if not exists printed_at timestamptz null,
  add column if not exists printed_by text null,
  add column if not exists print_count integer not null default 0 check (print_count >= 0),
  add column if not exists last_printed_at timestamptz null;

create index if not exists order_qr_labels_printed_at_idx
  on public.order_qr_labels (printed_at desc nulls last);

create index if not exists order_qr_labels_print_count_idx
  on public.order_qr_labels (print_count desc, created_at desc);
