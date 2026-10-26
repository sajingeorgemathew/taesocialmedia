-- =============================================================================
-- TAE Social Media Manager — Feature 2, migration 2 of 2
-- Private storage bucket for uploaded artwork, restricted to team members.
--
-- Run after migration 1 (it relies on public.is_team_member()).
-- =============================================================================

-- Private bucket: no public URLs. The app reads files through short-lived
-- signed URLs. Limits are enforced by Storage itself, not just the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media-assets',
  'social-media-assets',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object layout: posts/<post_id>/<random-uuid>.<ext>

drop policy if exists "Team members can view artwork" on storage.objects;
create policy "Team members can view artwork"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'social-media-assets'
    and (select public.is_team_member())
  );

-- Uploads must go into the folder of a post that exists.
drop policy if exists "Team members can upload artwork" on storage.objects;
create policy "Team members can upload artwork"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'social-media-assets'
    and (select public.is_team_member())
    and (storage.foldername(name))[1] = 'posts'
    and exists (
      select 1 from public.posts p
      where p.id::text = (storage.foldername(name))[2]
    )
  );

-- No UPDATE policy: existing files cannot be overwritten, only removed.

drop policy if exists "Team members can delete artwork" on storage.objects;
create policy "Team members can delete artwork"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'social-media-assets'
    and (select public.is_team_member())
  );
