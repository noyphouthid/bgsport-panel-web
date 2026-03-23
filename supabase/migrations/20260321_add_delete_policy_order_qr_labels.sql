do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_qr_labels'
      and policyname = 'order_qr_labels_delete_all'
  ) then
    create policy order_qr_labels_delete_all
      on public.order_qr_labels
      for delete
      using (true);
  end if;
end $$;
