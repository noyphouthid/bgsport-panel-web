drop policy if exists quotation_drafts_select_own_or_superadmin on public.quotation_drafts;
drop policy if exists quotation_drafts_insert_own_or_superadmin on public.quotation_drafts;
drop policy if exists quotation_drafts_update_own_or_superadmin on public.quotation_drafts;
drop policy if exists quotation_drafts_delete_own_or_superadmin on public.quotation_drafts;

create policy quotation_drafts_select_own_or_admin
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
        and role in ('superadmin', 'admin')
    )
  );

create policy quotation_drafts_insert_own_or_admin
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
        and role in ('superadmin', 'admin')
    )
  );

create policy quotation_drafts_update_own_or_admin
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
        and role in ('superadmin', 'admin')
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
        and role in ('superadmin', 'admin')
    )
  );

create policy quotation_drafts_delete_own_or_admin
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
        and role in ('superadmin', 'admin')
    )
  );
