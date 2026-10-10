-- Receipt photos. Needs Supabase Storage, so it is kept apart from 0002 (which also runs on plain Postgres).
-- Files live at  <family id>/<uploader id>/<expense id>.jpg  in a private bucket.
-- Same levels as the Expenses tab: view can look, edit can add (their own folder), full can add anywhere or delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create function public.receipt_family(path text) returns uuid
language sql immutable as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(path, '/', 1)::uuid end
$$;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.tab_level(public.receipt_family(name), 'expenses') >= 1);
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (
    public.tab_level(public.receipt_family(name), 'expenses') >= 3
    or (public.tab_level(public.receipt_family(name), 'expenses') >= 2 and split_part(name, '/', 2) = auth.uid()::text)));
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (
    public.tab_level(public.receipt_family(name), 'expenses') >= 3
    or (public.tab_level(public.receipt_family(name), 'expenses') >= 2 and split_part(name, '/', 2) = auth.uid()::text)));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (
    public.tab_level(public.receipt_family(name), 'expenses') >= 3
    or (public.tab_level(public.receipt_family(name), 'expenses') >= 2 and split_part(name, '/', 2) = auth.uid()::text)));
