create table if not exists public.quotation_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references public.users (id) on delete cascade,
  created_by_name text not null default '',
  quote_no text not null default '',
  quote_date text not null default '',
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_whatsapp text not null default '',
  customer_facebook text not null default '',
  fabric_id uuid null references public.fabrics (id) on delete set null,
  fabric_name text not null default '',
  fabric_short_price numeric(14,2) not null default 0,
  fabric_long_price numeric(14,2) not null default 0,
  style_name text not null default '',
  color_name text not null default '',
  sleeve_type text not null default 'short' check (sleeve_type in ('short', 'long', 'mixed')),
  short_qty integer not null default 0,
  long_qty integer not null default 0,
  free_qty integer not null default 0,
  qty_3xl integer not null default 0,
  qty_4xl integer not null default 0,
  qty_5xl integer not null default 0,
  qty_6xl integer not null default 0,
  collar_type text not null default 'none' check (collar_type in ('none', 'polo', 'mandarin')),
  collar_qty integer not null default 0,
  extra_charge numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  deposit numeric(14,2) not null default 0,
  payment_due_date text not null default '',
  delivery_date text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  warning_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotation_drafts_owner_updated_idx
  on public.quotation_drafts (created_by_user_id, updated_at desc);

create index if not exists quotation_drafts_quote_no_idx
  on public.quotation_drafts (quote_no);

alter table public.quotation_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quotation_drafts'
      and policyname = 'quotation_drafts_select_own_or_superadmin'
  ) then
    create policy quotation_drafts_select_own_or_superadmin
      on public.quotation_drafts
      for select
      using (
        created_by_user_id in (
          select id from public.users where auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.users
          where auth_user_id = auth.uid()
            and role = 'superadmin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quotation_drafts'
      and policyname = 'quotation_drafts_insert_own_or_superadmin'
  ) then
    create policy quotation_drafts_insert_own_or_superadmin
      on public.quotation_drafts
      for insert
      with check (
        created_by_user_id in (
          select id from public.users where auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.users
          where auth_user_id = auth.uid()
            and role = 'superadmin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quotation_drafts'
      and policyname = 'quotation_drafts_update_own_or_superadmin'
  ) then
    create policy quotation_drafts_update_own_or_superadmin
      on public.quotation_drafts
      for update
      using (
        created_by_user_id in (
          select id from public.users where auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.users
          where auth_user_id = auth.uid()
            and role = 'superadmin'
        )
      )
      with check (
        created_by_user_id in (
          select id from public.users where auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.users
          where auth_user_id = auth.uid()
            and role = 'superadmin'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quotation_drafts'
      and policyname = 'quotation_drafts_delete_own_or_superadmin'
  ) then
    create policy quotation_drafts_delete_own_or_superadmin
      on public.quotation_drafts
      for delete
      using (
        created_by_user_id in (
          select id from public.users where auth_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.users
          where auth_user_id = auth.uid()
            and role = 'superadmin'
        )
      );
  end if;
end $$;
