-- =============================================================================
-- Feature 4 verification — collaborative designer permissions, assignments and
-- the review workflow. Run in the Supabase SQL Editor AFTER migration
-- 20261027000001 and after at least one active admin exists.
--
-- It creates two temporary designer accounts (A and B), one disabled designer
-- and temporary posts, then signs in as each of them — through the same
-- 'authenticated' role and RLS the app's API calls use — and tries allowed and
-- forbidden actions. Every check prints PASS as a notice; any failure aborts
-- with an error starting with "FAIL". The whole script is rolled back: no
-- accounts, posts or emails are kept or sent.
-- =============================================================================

begin;

do $$
declare
  admin_id uuid;
  d_a uuid := gen_random_uuid();
  d_b uuid := gen_random_uuid();
  d_off uuid := gen_random_uuid();
  p_a uuid;        -- In Design, primary designer A
  p_b uuid;        -- In Design, primary designer B
  p_open uuid;     -- Planned, unassigned
  p_approved uuid; -- Approved, primary designer A
  p_published uuid;-- Published, primary designer B
  p_review uuid;   -- Ready for Review, primary designer A
  s public.email_settings%rowtype;
  n integer;
  denied boolean;
  txt text;
  ts timestamptz;
  who uuid;
  label text;
begin
  select user_id into admin_id from public.team_members where role = 'admin' and active limit 1;
  if admin_id is null then
    raise exception 'FAIL: no active admin found in public.team_members.';
  end if;
  select * into s from public.email_settings where id = 1;

  -- Setup (as the SQL Editor's database role) --------------------------------
  insert into auth.users (id, email, aud, role) values
    (d_a, 'rls-designer-a@example.invalid', 'authenticated', 'authenticated'),
    (d_b, 'rls-designer-b@example.invalid', 'authenticated', 'authenticated'),
    (d_off, 'rls-designer-off@example.invalid', 'authenticated', 'authenticated');
  insert into public.team_members (user_id, email, display_name, role, active) values
    (d_a, 'rls-designer-a@example.invalid', 'RLS Designer A', 'designer', true),
    (d_b, 'rls-designer-b@example.invalid', 'RLS Designer B', 'designer', true),
    (d_off, 'rls-designer-off@example.invalid', 'RLS Designer Off', 'designer', false);

  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS A post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'In Design', d_a) returning id into p_a;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS B post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'In Design', d_b) returning id into p_b;
  insert into public.posts (title, publish_date, program, format, status)
  values ('RLS open post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'Planned') returning id into p_open;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS approved post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'Approved', d_a) returning id into p_approved;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS published post', current_date - 3, 'General TAE Marketing', 'Static Photo', 'Published', d_b) returning id into p_published;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS review post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'Ready for Review', d_a) returning id into p_review;

  select designer into txt from public.posts where id = p_a;
  if txt <> 'RLS Designer A' then raise exception 'FAIL: designer name not synced from the account (got %)', txt; end if;
  raise notice 'PASS: primary designer name is taken from the account';

  perform set_config('role', 'authenticated', true);

  -- 1. Checks that apply to BOTH designers ------------------------------------
  foreach who in array array[d_a, d_b] loop
    label := case when who = d_a then 'Designer A' else 'Designer B' end;
    perform set_config('request.jwt.claims', json_build_object('sub', who::text, 'role', 'authenticated')::text, true);

    select count(*) into n from public.posts where id in (p_a, p_b, p_open, p_approved, p_published, p_review);
    if n <> 6 then raise exception 'FAIL: % sees % of 6 test posts', label, n; end if;
    raise notice 'PASS: % can view every post', label;

    -- Assignment is admin-only, including self-assignment of unassigned posts.
    begin
      -- A: hand A's post to B. B: take ownership of A's post.
      update public.posts set designer_id = d_b where id = p_a;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % reassigned a post', label; end if;
    begin
      update public.posts set designer_id = null where id = p_b;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % unassigned a post', label; end if;
    begin
      update public.posts set designer_id = who where id = p_open;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % self-assigned an unassigned post', label; end if;
    raise notice 'PASS: % cannot assign, reassign, unassign or self-assign', label;

    begin
      update public.posts set status = 'Approved' where id = p_review;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % approved a post', label; end if;
    begin
      update public.posts set status = 'Published' where id = p_a;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % published a post', label; end if;
    begin
      perform public.request_post_changes(p_review, 'Designer feedback');
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % requested changes', label; end if;
    raise notice 'PASS: % cannot approve, publish or request changes', label;

    begin
      update public.posts set title = 'Renamed' where id = p_b;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % changed a title', label; end if;
    begin
      update public.posts set publish_date = current_date + 1 where id = p_a;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % changed a publishing date', label; end if;
    begin
      update public.posts set platforms = array['LinkedIn'] where id = p_a;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % changed platforms', label; end if;
    begin
      update public.posts set program = 'Windmill Financing', format = 'Reel' where id = p_b;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % changed program/format', label; end if;
    begin
      update public.posts set published_url = 'https://example.com/p' where id = p_b;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % changed the published link', label; end if;
    begin
      update public.posts set review_note = 'Self-approved', changes_requested_at = null where id = p_a;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % changed review fields', label; end if;
    raise notice 'PASS: % cannot change protected scheduling or review fields', label;

    begin
      update public.posts set notes = 'Late edit' where id = p_approved;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % edited an Approved post', label; end if;
    begin
      update public.posts set caption = 'Late edit' where id = p_published;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % edited a Published post', label; end if;
    begin
      update public.posts set status = 'In Design' where id = p_approved;
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % reopened an Approved post', label; end if;
    raise notice 'PASS: % cannot modify Approved or Published posts', label;

    begin
      insert into public.posts (title, publish_date, program, format) values ('Designer post', current_date, 'General TAE Marketing', 'Static Photo');
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % created a post', label; end if;
    delete from public.posts where id in (p_a, p_b, p_open);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: % deleted % posts', label, n; end if;
    raise notice 'PASS: % cannot create, duplicate or delete posts', label;

    if public.can_edit_post_artwork(p_approved::text) or public.can_edit_post_artwork(p_published::text)
       or not public.can_edit_post_artwork(p_a::text) or not public.can_edit_post_artwork(p_b::text) then
      raise exception 'FAIL: % has the wrong artwork permissions', label;
    end if;
    raise notice 'PASS: % can manage artwork on any unfinished post, not on approved/published ones', label;

    begin
      insert into public.post_assets (post_id, storage_path, file_name, mime_type, size_bytes)
      values (p_approved, 'posts/' || p_approved || '/x.png', 'x.png', 'image/png', 10);
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % added artwork to an Approved post', label; end if;
    begin
      insert into storage.objects (bucket_id, name) values ('social-media-assets', 'posts/' || p_published || '/x.png');
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % uploaded a file to a Published post', label; end if;
    raise notice 'PASS: % cannot add artwork to Approved or Published posts', label;

    update public.team_members set role = 'admin' where user_id = who;
    select role into txt from public.team_members where user_id = who;
    if txt <> 'designer' then raise exception 'FAIL: % promoted themselves', label; end if;
    select count(*) into n from public.email_settings;
    if n > 0 then raise exception 'FAIL: % can read email settings', label; end if;
    begin
      insert into public.email_recipients (email) values ('rls-intruder@example.invalid');
      denied := false;
    exception when others then denied := true;
    end;
    if not denied then raise exception 'FAIL: % added an email recipient', label; end if;
    raise notice 'PASS: % cannot manage roles, email settings or recipients', label;
  end loop;

  -- 2. Collaboration ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', d_a::text, 'role', 'authenticated')::text, true);
  update public.posts
  set caption = 'A helped', creative_wording = 'A wording', design_brief = 'A brief', reel_script = 'A script',
      notes = 'A notes', artwork_url = 'canva/a'
  where id = p_b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Designer A could not edit Designer B''s unfinished post'; end if;
  raise notice 'PASS: Designer A can edit Designer B''s unfinished post';

  insert into public.post_assets (post_id, storage_path, file_name, mime_type, size_bytes)
  values (p_b, 'posts/' || p_b || '/a.png', 'a.png', 'image/png', 10);
  update public.post_assets set position = 1 where post_id = p_b;
  get diagnostics n = row_count;
  delete from public.post_assets where post_id = p_b;
  if n <> 1 then raise exception 'FAIL: Designer A could not manage artwork on Designer B''s post'; end if;
  raise notice 'PASS: Designer A can upload, reorder and remove artwork on Designer B''s post';

  update public.posts set notes = 'A on open post' where id = p_open;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Designer A could not contribute to an unassigned post'; end if;
  raise notice 'PASS: designers can contribute to unassigned posts without assigning them';

  perform set_config('request.jwt.claims', json_build_object('sub', d_b::text, 'role', 'authenticated')::text, true);
  update public.posts set caption = 'B helped', status = 'Ready for Review' where id = p_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Designer B could not contribute to and submit Designer A''s post'; end if;
  raise notice 'PASS: Designer B can contribute to and submit Designer A''s post for review';

  update public.posts set status = 'Ready for Review' where id = p_b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Designer B could not submit their own post'; end if;
  raise notice 'PASS: Designer B can submit their own post for review';

  select count(*) into n from public.posts
  where (id = p_a and designer_id = d_a) or (id = p_b and designer_id = d_b) or (id = p_open and designer_id is null);
  if n <> 3 then raise exception 'FAIL: a designer''s edit changed the primary assignment'; end if;
  raise notice 'PASS: contributions never change the primary assignment';

  -- 3. Disabled designer ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', d_off::text, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts;
  if n > 0 then raise exception 'FAIL: disabled designer can read % posts', n; end if;
  update public.posts set caption = 'x' where id = p_open;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: disabled designer edited a post'; end if;
  raise notice 'PASS: disabled designer sees and edits nothing';

  -- 4. Admin -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  txt := public.request_post_changes(p_review, 'Use the new intake date.');
  select status, changes_requested_at into txt, ts from public.posts where id = p_review;
  if txt <> 'In Design' or ts is null then raise exception 'FAIL: request changes did not send the post back (status %)', txt; end if;
  raise notice 'PASS: admin can request changes (post back to In Design with a note)';

  update public.posts set status = 'Approved' where id = p_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not approve'; end if;
  raise notice 'PASS: admin can approve';

  update public.posts set designer_id = d_b where id = p_open;
  select designer into txt from public.posts where id = p_open;
  if txt <> 'RLS Designer B' then raise exception 'FAIL: admin assignment did not update the name (got %)', txt; end if;
  update public.posts set designer_id = d_a where id = p_open;
  raise notice 'PASS: admin can assign and reassign';

  begin
    update public.posts set designer_id = d_off where id = p_open;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: a disabled designer was assigned'; end if;
  raise notice 'PASS: disabled designers cannot be assigned';

  update public.posts set status = 'In Design' where id = p_approved;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not reopen an approved post'; end if;
  raise notice 'PASS: admin can reopen an Approved post';

  -- 5. Designers after the admin's actions -----------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', d_b::text, 'role', 'authenticated')::text, true);
  update public.posts set notes = 'Edited after reopen' where id = p_approved;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: designer could not edit a post the admin reopened'; end if;
  raise notice 'PASS: designers can edit a post once an admin reopens it';

  update public.posts set status = 'Ready for Review' where id = p_review;
  select changes_requested_at into ts from public.posts where id = p_review;
  if ts is not null then raise exception 'FAIL: resubmitting did not clear the change request'; end if;
  raise notice 'PASS: any designer can resubmit; the change request is cleared';

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  delete from public.posts where id = p_published;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not delete a post'; end if;
  raise notice 'PASS: admin can delete posts';

  -- 6. Notification events (as the database role) -----------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  if s.paused then
    raise notice 'SKIP: reminders are paused, so no notification events are queued';
  else
    if s.notify_assignment then
      select count(*) into n from public.email_notification_events
      where post_id = p_open and event_type = 'assignment';
      if n <> 2 then raise exception 'FAIL: assign + reassign queued % assignment events (expected 2)', n; end if;
      select count(*) into n from public.email_notification_events
      where post_id = p_open and event_type = 'assignment' and details ->> 'designer_id' = d_a::text;
      if n <> 1 then raise exception 'FAIL: reassignment event does not name the new designer'; end if;
      raise notice 'PASS: assignment and reassignment each queue one notification for the new designer';

      select count(*) into n from public.email_notification_events where post_id in (p_a, p_b) and event_type = 'assignment'
        and (details ->> 'previous_designer_id') is not null;
      if n <> 0 then raise exception 'FAIL: designer contributions queued assignment notifications'; end if;
      update public.posts set designer_id = d_a, notes = 'Same designer' where id = p_open;
      select count(*) into n from public.email_notification_events where post_id = p_open and event_type = 'assignment';
      if n <> 2 then raise exception 'FAIL: unchanged assignment queued another event (% total)', n; end if;
      raise notice 'PASS: edits that do not change the designer queue no assignment notification';
    else
      raise notice 'SKIP: assignment notifications are off';
    end if;

    if s.notify_ready_for_review then
      select count(*) into n from public.email_notification_events
      where post_id in (p_a, p_b, p_review) and event_type = 'ready_for_review';
      if n <> 3 then raise exception 'FAIL: % Ready for Review events (expected 3)', n; end if;
      raise notice 'PASS: Ready for Review submissions by either designer queue office notifications';
    else
      raise notice 'SKIP: Ready for Review notifications are off';
    end if;

    if s.notify_approved then
      select count(*) into n from public.email_notification_events
      where post_id = p_a and event_type = 'approved' and details ->> 'designer_id' = d_a::text;
      if n <> 1 then raise exception 'FAIL: approval queued % events for the primary designer (expected 1)', n; end if;
      raise notice 'PASS: approval queues a notification carrying the primary designer';
    else
      raise notice 'SKIP: approval notifications are off';
    end if;

    if s.notify_changes_requested then
      select count(*) into n from public.email_notification_events
      where post_id = p_review and event_type = 'changes_requested' and details ->> 'designer_id' = d_a::text;
      if n <> 1 then raise exception 'FAIL: request changes queued % events (expected 1)', n; end if;
      raise notice 'PASS: request changes queues a notification carrying the primary designer';
    else
      raise notice 'SKIP: changes-requested notifications are off';
    end if;
  end if;
end;
$$;

rollback;
