-- Top landing pages for the acquisition report, and storage buckets for photos, the logo and receipts.

create function public.report_top_pages(p_from date, p_to date, p_branch uuid default null, p_limit integer default 10)
returns table (page_path text, sessions integer, enquiry_actions integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  select e.page_path,
         count(distinct e.session_hash) filter (where e.event_type = 'page_view')::integer,
         count(*) filter (where e.event_type in ('call_click', 'whatsapp_click', 'quote_submit', 'reserve_submit'))::integer
    from public.site_events e
   where e.occurred_at >= app.day_start(p_from) and e.occurred_at < app.day_end(p_to)
     and (p_branch is null or e.branch_id = p_branch)
   group by e.page_path
   order by 2 desc, 3 desc
   limit greatest(1, least(p_limit, 100))
$$;
revoke execute on function public.report_top_pages(date, date, uuid, integer) from public, anon;
grant execute on function public.report_top_pages(date, date, uuid, integer) to authenticated;

-- Storage exists only on Supabase; the block is skipped on plain PostgreSQL test databases.
do $storage$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present: skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    ('brand', 'brand', true, 2097152, array['image/png', 'image/svg+xml', 'image/webp']),
    ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do nothing;

  -- Object paths start with the branch id: {branch_id}/{record_id}/{file}. The policy reads the branch from the path.
  execute $p$create policy product_photos_write on storage.objects for insert to authenticated
    with check (bucket_id = 'product-photos' and app.can_access_branch(((storage.foldername(name))[1])::uuid))$p$;
  execute $p$create policy product_photos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'product-photos' and app.can_access_branch(((storage.foldername(name))[1])::uuid))$p$;
  execute $p$create policy brand_owner_write on storage.objects for all to authenticated
    using (bucket_id = 'brand' and app.is_owner()) with check (bucket_id = 'brand' and app.is_owner())$p$;
  execute $p$create policy receipts_manager_all on storage.objects for all to authenticated
    using (bucket_id = 'receipts' and app.can_manage_branch(((storage.foldername(name))[1])::uuid))
    with check (bucket_id = 'receipts' and app.can_manage_branch(((storage.foldername(name))[1])::uuid))$p$;
end
$storage$;
