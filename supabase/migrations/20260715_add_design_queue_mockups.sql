create table if not exists public.design_queue_mockups (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.design_queue_entries (id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_url text null,
  mime_type text null,
  width integer null,
  height integer null,
  file_size_bytes bigint null,
  uploaded_by_user_id uuid null references public.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_queue_mockups_queue_entry_idx
  on public.design_queue_mockups (queue_entry_id, uploaded_at desc);

create index if not exists design_queue_mockups_uploaded_by_idx
  on public.design_queue_mockups (uploaded_by_user_id, uploaded_at desc);

alter table public.design_queue_mockups enable row level security;

drop policy if exists design_queue_mockups_select_by_role on public.design_queue_mockups;
drop policy if exists design_queue_mockups_insert_by_role on public.design_queue_mockups;
drop policy if exists design_queue_mockups_update_by_role on public.design_queue_mockups;
drop policy if exists design_queue_mockups_delete_by_role on public.design_queue_mockups;

create policy design_queue_mockups_select_by_role
  on public.design_queue_mockups
  for select
  using (
    exists (
      select 1
      from public.design_queue_entries as entry
      where entry.id = queue_entry_id
        and (
          exists (
            select 1
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
          )
          or entry.graphic_user_id in (
            select viewer.id
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role = 'graphic'
          )
        )
    )
  );

create policy design_queue_mockups_insert_by_role
  on public.design_queue_mockups
  for insert
  with check (
    exists (
      select 1
      from public.design_queue_entries as entry
      where entry.id = queue_entry_id
        and (
          exists (
            select 1
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
          )
          or entry.graphic_user_id in (
            select viewer.id
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role = 'graphic'
          )
        )
    )
  );

create policy design_queue_mockups_update_by_role
  on public.design_queue_mockups
  for update
  using (
    exists (
      select 1
      from public.design_queue_entries as entry
      where entry.id = queue_entry_id
        and (
          exists (
            select 1
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
          )
          or entry.graphic_user_id in (
            select viewer.id
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role = 'graphic'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.design_queue_entries as entry
      where entry.id = queue_entry_id
        and (
          exists (
            select 1
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
          )
          or entry.graphic_user_id in (
            select viewer.id
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role = 'graphic'
          )
        )
    )
  );

create policy design_queue_mockups_delete_by_role
  on public.design_queue_mockups
  for delete
  using (
    exists (
      select 1
      from public.design_queue_entries as entry
      where entry.id = queue_entry_id
        and (
          exists (
            select 1
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
          )
          or entry.graphic_user_id in (
            select viewer.id
            from public.users as viewer
            where viewer.auth_user_id = auth.uid()
              and viewer.role = 'graphic'
          )
        )
    )
  );
