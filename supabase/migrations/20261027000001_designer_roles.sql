-- =============================================================================
-- TAE Social Media Manager — Feature 4
-- Designer role, structured post assignments and the review workflow
-- (Approve / Request changes), enforced in the database.
--
-- Run in the Supabase SQL Editor AFTER the Feature 2 and Feature 3 migrations.
-- Safe to re-run. It only ADDS columns, functions and policies; existing posts,
-- published history, email settings, recipients, schedules and delivery logs
-- are kept. The Cron job and Edge Function secrets are not touched.
--
-- Roles after this migration:
--   admin    — everything (posts, approval, publishing, deletion, team, email).
--   designer — sees the calendar; edits the content and artwork of posts
--              assigned to them; may take over an UNASSIGNED post; may move
--              their posts between Planned, In Design and Ready for Review.
--              Cannot create, delete, approve, publish, reassign, manage the
--              team or open email administration.
-- Existing 'member' accounts become 'designer'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Team roles and an "active" switch (disable an account without deleting it)
-- -----------------------------------------------------------------------------
alter table public.team_members drop constraint if exists team_members_role_check;
update public.team_members set role = 'designer' where role = 'member';
alter table public.team_members
  add constraint team_members_role_check check (role in ('admin', 'designer'));
alter table public.team_members alter column role set default 'designer';
alter table public.team_members add column if not exists active boolean not null default true;

-- Inactive accounts lose access everywhere these helpers are used (all RLS).
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and active
  );
$$;

create or replace function public.is_team_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and role = 'admin' and active
  );
$$;

create or replace function public.is_team_designer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and role = 'designer' and active
  );
$$;

revoke all on function public.is_team_designer() from public, anon;
grant execute on function public.is_team_designer() to authenticated;

-- The team must keep at least one ACTIVE admin.
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active)
     and not exists (
       select 1 from public.team_members
       where role = 'admin' and active and user_id <> old.user_id
     ) then
    raise exception 'The team must keep at least one active admin.';
  end if;
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Post assignment and review fields
--    `designer` (text) stays: it is now the display name of the assigned
--    designer, maintained by the trigger below, and keeps legacy names on
--    posts that are not linked to an account (e.g. published history).
-- -----------------------------------------------------------------------------
alter table public.posts
  add column if not exists designer_id uuid references public.team_members (user_id) on delete set null,
  add column if not exists review_note text not null default '' check (char_length(review_note) <= 2000),
  add column if not exists changes_requested_at timestamptz,
  add column if not exists changes_requested_by uuid references auth.users (id) on delete set null;

create index if not exists posts_designer_idx on public.posts (designer_id) where designer_id is not null;

comment on column public.posts.designer is 'Display name of the assigned designer (maintained by trigger), or a legacy name when designer_id is null.';
comment on column public.posts.designer_id is 'Assigned designer account. Only admins can change it; a designer may take over an unassigned post.';
comment on column public.posts.review_note is 'Latest feedback from "Request changes".';
comment on column public.posts.changes_requested_at is 'Set by request_post_changes(); cleared when the post is resubmitted, approved or published.';

-- Maintenance runs (legacy linking) set tae.maintenance = 'on' so they do not
-- change updated_at/updated_by (which drives "recently published") or send email.
create or replace function public.posts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.legacy_id := old.legacy_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.version := old.version + 1;
  if coalesce(current_setting('tae.maintenance', true), '') = 'on' then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  else
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Workflow rules — the server-side guard for designers, plus bookkeeping.
--    Runs for every insert/update (after posts_set_*_fields). Admins, the SQL
--    Editor and the service role (no auth.uid()) are not limited by step 1.
-- -----------------------------------------------------------------------------
create or replace function public.posts_apply_workflow_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  label text;
begin
  -- 1. Designer permissions.
  if uid is not null and not public.is_team_admin() then
    if tg_op = 'INSERT' then
      raise exception 'Only administrators can create posts.' using errcode = 'insufficient_privilege';
    end if;
    if old.designer_id is distinct from uid then
      -- Taking over is allowed only for an unassigned post, and only to yourself.
      if old.designer_id is not null or new.designer_id is distinct from uid then
        raise exception 'You can only edit posts assigned to you.';
      end if;
    elsif new.designer_id is distinct from old.designer_id then
      raise exception 'Only administrators can change assignments.';
    end if;
    if old.status in ('Approved', 'Published') then
      raise exception 'This post is % — only an administrator can change it.', old.status;
    end if;
    if new.status not in ('Planned', 'In Design', 'Ready for Review') then
      raise exception 'Only administrators can approve or publish posts.';
    end if;
    if new.title is distinct from old.title
       or new.publish_date is distinct from old.publish_date
       or new.program is distinct from old.program
       or new.platforms is distinct from old.platforms
       or new.format is distinct from old.format
       or new.published_url is distinct from old.published_url
       or new.review_note is distinct from old.review_note
       or new.changes_requested_at is distinct from old.changes_requested_at
       or new.changes_requested_by is distinct from old.changes_requested_by then
      raise exception 'Designers can edit the content and artwork of their posts. Title, date, program, platforms, format, published link and review notes are managed by administrators.';
    end if;
  end if;

  -- 2. Only active team accounts can be assigned.
  if new.designer_id is not null
     and (tg_op = 'INSERT' or new.designer_id is distinct from old.designer_id)
     and not exists (select 1 from public.team_members m where m.user_id = new.designer_id and m.active) then
    raise exception 'That designer account is not active.';
  end if;

  -- 3. A resubmitted, approved or published post no longer has open change requests.
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('Ready for Review', 'Approved', 'Published') then
    new.changes_requested_at := null;
    new.changes_requested_by := null;
  end if;

  -- 4. Keep the display name in step with the assignment.
  if new.designer_id is not null then
    select coalesce(nullif(btrim(m.display_name), ''), m.email) into label
    from public.team_members m where m.user_id = new.designer_id;
    new.designer := coalesce(label, new.designer);
  elsif tg_op = 'UPDATE' then
    if old.designer_id is not null then
      -- Unassigned: published history keeps the name, other posts clear it.
      new.designer := case when new.status = 'Published' then old.designer else '' end;
    else
      -- Legacy (unlinked) names are history; the app never edits them.
      new.designer := old.designer;
    end if;
  elsif new.legacy_id is null then
    new.designer := '';
  end if;

  return new;
end;
$$;

revoke all on function public.posts_apply_workflow_rules() from public, anon, authenticated;

drop trigger if exists posts_workflow_rules on public.posts;
create trigger posts_workflow_rules
  before insert or update on public.posts
  for each row execute function public.posts_apply_workflow_rules();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security for posts
-- -----------------------------------------------------------------------------
-- Everyone on the team (active) can read the calendar — unchanged policy name.
drop policy if exists "Members can create posts" on public.posts;
drop policy if exists "Admins can create posts" on public.posts;
create policy "Admins can create posts"
  on public.posts for insert
  to authenticated
  with check ((select public.is_team_admin()));

drop policy if exists "Members can update posts" on public.posts;
drop policy if exists "Admins and assigned designers can update posts" on public.posts;
create policy "Admins and assigned designers can update posts"
  on public.posts for update
  to authenticated
  using (
    (select public.is_team_admin())
    or ((select public.is_team_designer())
        and (designer_id = (select auth.uid()) or designer_id is null))
  )
  with check (
    (select public.is_team_admin())
    or ((select public.is_team_designer()) and designer_id = (select auth.uid()))
  );

drop policy if exists "Members can delete posts" on public.posts;
drop policy if exists "Admins can delete posts" on public.posts;
create policy "Admins can delete posts"
  on public.posts for delete
  to authenticated
  using ((select public.is_team_admin()));

-- -----------------------------------------------------------------------------
-- 5. Artwork: admins, or the assigned designer while the post is not yet approved.
-- -----------------------------------------------------------------------------
create or replace function public.can_edit_post_artwork(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id::text = p_post_id
      and (
        public.is_team_admin()
        or (public.is_team_designer()
            and p.designer_id = (select auth.uid())
            and p.status in ('Planned', 'In Design', 'Ready for Review'))
      )
  );
$$;

revoke all on function public.can_edit_post_artwork(text) from public, anon;
grant execute on function public.can_edit_post_artwork(text) to authenticated;

drop policy if exists "Members can add artwork records" on public.post_assets;
drop policy if exists "Editors can add artwork records" on public.post_assets;
create policy "Editors can add artwork records"
  on public.post_assets for insert
  to authenticated
  with check (public.can_edit_post_artwork(post_id::text));

drop policy if exists "Members can reorder artwork" on public.post_assets;
drop policy if exists "Editors can reorder artwork" on public.post_assets;
create policy "Editors can reorder artwork"
  on public.post_assets for update
  to authenticated
  using (public.can_edit_post_artwork(post_id::text))
  with check (public.can_edit_post_artwork(post_id::text));

drop policy if exists "Members can remove artwork records" on public.post_assets;
drop policy if exists "Editors can remove artwork records" on public.post_assets;
create policy "Editors can remove artwork records"
  on public.post_assets for delete
  to authenticated
  using (public.can_edit_post_artwork(post_id::text));

drop policy if exists "Team members can upload artwork" on storage.objects;
create policy "Team members can upload artwork"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'social-media-assets'
    and (storage.foldername(name))[1] = 'posts'
    and public.can_edit_post_artwork((storage.foldername(name))[2])
  );

-- Admins may also remove files of a post that was just deleted.
drop policy if exists "Team members can delete artwork" on storage.objects;
create policy "Team members can delete artwork"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'social-media-assets'
    and (
      (select public.is_team_admin())
      or ((storage.foldername(name))[1] = 'posts'
          and public.can_edit_post_artwork((storage.foldername(name))[2]))
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Request changes — admin only. Sends the post back to In Design with a note.
--    Returns 'ok', 'conflict' (someone saved first), 'not_found' or
--    'invalid_status' (only Ready for Review / Approved posts).
-- -----------------------------------------------------------------------------
create or replace function public.request_post_changes(
  p_post_id          uuid,
  p_note             text,
  p_expected_version integer default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  current_version integer;
begin
  if not public.is_team_admin() then
    raise exception 'Only administrators can request changes.';
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'Describe the changes that are needed.';
  end if;

  update public.posts
  set status = 'In Design',
      review_note = left(btrim(p_note), 2000),
      changes_requested_at = now(),
      changes_requested_by = auth.uid()
  where id = p_post_id
    and status in ('Ready for Review', 'Approved')
    and (p_expected_version is null or version = p_expected_version);
  get diagnostics n = row_count;
  if n = 1 then
    return 'ok';
  end if;

  select version into current_version from public.posts where id = p_post_id;
  if not found then
    return 'not_found';
  elsif p_expected_version is not null and current_version <> p_expected_version then
    return 'conflict';
  end if;
  return 'invalid_status';
end;
$$;

revoke all on function public.request_post_changes(uuid, text, integer) from public, anon;
grant execute on function public.request_post_changes(uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Email notifications (Feature 3 queue, Cron, Resend and logs unchanged)
--    * assignment        — designer_id set/changed  → the designer's account email
--    * ready_for_review  — unchanged                → "Workflow" recipients
--    * approved          — unchanged trigger        → "Workflow" recipients + designer
--    * changes_requested — new                      → the assigned designer
-- -----------------------------------------------------------------------------
alter table public.email_settings
  add column if not exists notify_changes_requested boolean not null default true;

alter table public.email_notification_events drop constraint if exists email_notification_events_event_type_check;
alter table public.email_notification_events
  add constraint email_notification_events_event_type_check
  check (event_type in ('assignment', 'ready_for_review', 'approved', 'changes_requested'));

create or replace function public.posts_enqueue_email_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.email_settings%rowtype;
  snapshot jsonb;
begin
  begin
    if coalesce(current_setting('tae.maintenance', true), '') = 'on' then
      return null;
    end if;

    select * into s from public.email_settings where id = 1;
    if not found or s.paused then
      return null;
    end if;

    -- Imported posts are history, not new work.
    if tg_op = 'INSERT' and new.legacy_id is not null then
      return null;
    end if;

    snapshot := jsonb_build_object(
      'title', new.title,
      'program', new.program,
      'publish_date', new.publish_date,
      'status', new.status,
      'designer', new.designer,
      'designer_id', new.designer_id,
      'previous_designer_id', case when tg_op = 'UPDATE' then old.designer_id end,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'review_note', new.review_note,
      'changes_requested_at', new.changes_requested_at
    );

    -- Assignment: only when the assigned account actually changes.
    if s.notify_assignment
       and new.designer_id is not null
       and (tg_op = 'INSERT' or old.designer_id is distinct from new.designer_id)
       and new.status <> 'Published' then
      insert into public.email_notification_events (post_id, event_type, details, actor)
      values (new.id, 'assignment', snapshot, auth.uid());
    end if;

    if tg_op = 'UPDATE' and old.status is distinct from new.status then
      if s.notify_ready_for_review and new.status = 'Ready for Review' then
        insert into public.email_notification_events (post_id, event_type, details, actor)
        values (new.id, 'ready_for_review', snapshot, auth.uid());
      elsif s.notify_approved and new.status = 'Approved' then
        insert into public.email_notification_events (post_id, event_type, details, actor)
        values (new.id, 'approved', snapshot, auth.uid());
      end if;
    end if;

    if tg_op = 'UPDATE'
       and s.notify_changes_requested
       and new.changes_requested_at is not null
       and new.changes_requested_at is distinct from old.changes_requested_at then
      insert into public.email_notification_events (post_id, event_type, details, actor)
      values (new.id, 'changes_requested', snapshot, auth.uid());
    end if;
  exception when others then
    raise warning 'Email notification was not queued: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.posts_enqueue_email_events() from public, anon, authenticated;

drop trigger if exists posts_email_events on public.posts;
create trigger posts_email_events
  after insert or update of status, designer_id, changes_requested_at on public.posts
  for each row execute function public.posts_enqueue_email_events();

-- -----------------------------------------------------------------------------
-- 8. Link legacy designer names to accounts — never guessed.
--    A post (not Published) is linked only when its typed name matches exactly
--    ONE active designer account by: display name, account email, or the
--    admin-confirmed "Designer name on posts" of an email recipient with the
--    same address. Everything else is reported, not changed. Does not send
--    email or change updated_at. Re-run after creating designer accounts:
--      select * from public.link_legacy_designers();
-- -----------------------------------------------------------------------------
create or replace function public.link_legacy_designers()
returns table (post_id uuid, title text, legacy_designer text, outcome text)
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('tae.maintenance', 'on', true);

  return query
  with candidates as (
    select m.user_id, lower(regexp_replace(btrim(m.display_name), '\s+', ' ', 'g')) as key
    from public.team_members m
    where m.role = 'designer' and m.active and btrim(m.display_name) <> ''
    union
    select m.user_id, lower(btrim(m.email))
    from public.team_members m
    where m.role = 'designer' and m.active
    union
    select m.user_id, lower(regexp_replace(btrim(r.designer_name), '\s+', ' ', 'g'))
    from public.email_recipients r
    join public.team_members m on lower(m.email) = r.email
    where r.designer_name <> '' and m.role = 'designer' and m.active
  ),
  keys as (
    select c.key, (array_agg(distinct c.user_id))[1] as user_id, count(distinct c.user_id) as matches
    from candidates c
    group by c.key
  ),
  pending as (
    select p.id, p.title, p.designer, lower(regexp_replace(btrim(p.designer), '\s+', ' ', 'g')) as key
    from public.posts p
    where p.designer_id is null and btrim(p.designer) <> '' and p.status <> 'Published'
  ),
  linked as (
    update public.posts p
    set designer_id = k.user_id
    from pending x
    join keys k on k.key = x.key and k.matches = 1
    where p.id = x.id
    returning p.id
  )
  select x.id, x.title, x.designer,
         case
           when l.id is not null then 'linked'
           when k.matches > 1 then format('ambiguous: %s designer accounts match — assign in the app', k.matches)
           else 'no matching designer account — assign in the app'
         end
  from pending x
  left join keys k on k.key = x.key
  left join linked l on l.id = x.id
  order by x.designer, x.title;

  perform set_config('tae.maintenance', '', true);
end;
$$;

revoke all on function public.link_legacy_designers() from public, anon, authenticated;

-- Link what can be linked now and show the report (last result in the editor).
select * from public.link_legacy_designers();
