-- =============================================================================
-- Feature 4 verification — designer role, assignments and review workflow.
-- Run in the Supabase SQL Editor AFTER migration 20261027000001 and after at
-- least one active admin exists in public.team_members.
--
-- It creates two temporary designer accounts (plus one disabled designer) and
-- five temporary posts, then signs in as each of them — through the same
-- 'authenticated' role and RLS the app's API calls use — and tries allowed and
-- forbidden actions. Every check prints PASS as a notice; any failure aborts
-- with an error starting with "FAIL". The whole script is rolled back: no
-- accounts, posts or emails are kept or sent.
-- =============================================================================

begin;

do $$
declare
  admin_id uuid;
  d1 uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  d3 uuid := gen_random_uuid();
  p_d1 uuid;
  p_d2 uuid;
  p_open uuid;
  p_approved uuid;
  p_review uuid;
  s public.email_settings%rowtype;
  n integer;
  denied boolean;
  txt text;
  ts timestamptz;
begin
  select user_id into admin_id from public.team_members where role = 'admin' and active limit 1;
  if admin_id is null then
    raise exception 'FAIL: no active admin found in public.team_members.';
  end if;
  select * into s from public.email_settings where id = 1;

  -- Setup (as the SQL Editor's database role) --------------------------------
  insert into auth.users (id, email, aud, role) values
    (d1, 'rls-designer-1@example.invalid', 'authenticated', 'authenticated'),
    (d2, 'rls-designer-2@example.invalid', 'authenticated', 'authenticated'),
    (d3, 'rls-designer-3@example.invalid', 'authenticated', 'authenticated');
  insert into public.team_members (user_id, email, display_name, role, active) values
    (d1, 'rls-designer-1@example.invalid', 'RLS Designer One', 'designer', true),
    (d2, 'rls-designer-2@example.invalid', 'RLS Designer Two', 'designer', true),
    (d3, 'rls-designer-3@example.invalid', 'RLS Designer Three', 'designer', false);

  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS d1 post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'In Design', d1)
  returning id into p_d1;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS d2 post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'In Design', d2)
  returning id into p_d2;
  insert into public.posts (title, publish_date, program, format, status)
  values ('RLS open post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'Planned')
  returning id into p_open;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS approved post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'Approved', d1)
  returning id into p_approved;
  insert into public.posts (title, publish_date, program, format, status, designer_id)
  values ('RLS review post', current_date + 10, 'General TAE Marketing', 'Static Photo', 'Ready for Review', d1)
  returning id into p_review;

  select designer into txt from public.posts where id = p_d1;
  if txt <> 'RLS Designer One' then raise exception 'FAIL: designer name not synced from the account (got %)', txt; end if;
  raise notice 'PASS: assigned designer name is taken from the account';

  -- 1. Designer One ------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', d1::text, 'role', 'authenticated')::text, true);

  select count(*) into n from public.posts where id in (p_d1, p_d2, p_open, p_approved, p_review);
  if n <> 5 then raise exception 'FAIL: designer sees % of 5 test posts', n; end if;
  raise notice 'PASS: designer can view the whole calendar';

  update public.posts set caption = 'Designer caption', notes = 'Designer notes' where id = p_d1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: designer could not edit content of their own post'; end if;
  raise notice 'PASS: designer can edit content of their own post';

  update public.posts set caption = 'Hijack' where id = p_d2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: designer edited another designer''s post'; end if;
  raise notice 'PASS: designer cannot edit another designer''s post';

  begin
    update public.posts set status = 'Approved' where id = p_d1;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer approved a post'; end if;
  raise notice 'PASS: designer cannot approve';

  begin
    update public.posts set status = 'Published' where id = p_d1;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer published a post'; end if;
  raise notice 'PASS: designer cannot publish';

  begin
    update public.posts set title = 'Renamed', publish_date = current_date + 1 where id = p_d1;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer changed title/date'; end if;
  raise notice 'PASS: designer cannot change scheduling fields';

  begin
    update public.posts set designer_id = d2 where id = p_d1;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer reassigned their post'; end if;
  raise notice 'PASS: designer cannot reassign';

  begin
    update public.posts set designer_id = null where id = p_d1;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer unassigned their post'; end if;
  raise notice 'PASS: designer cannot unassign';

  begin
    update public.posts set notes = 'After approval' where id = p_approved;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer edited an approved post'; end if;
  raise notice 'PASS: designer cannot edit an approved post';

  begin
    insert into public.posts (title, publish_date, program, format) values ('Designer post', current_date, 'General TAE Marketing', 'Static Photo');
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer created a post'; end if;
  raise notice 'PASS: designer cannot create posts';

  delete from public.posts where id in (p_d1, p_d2);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: designer deleted % posts', n; end if;
  raise notice 'PASS: designer cannot delete posts';

  begin
    update public.posts set caption = 'Not claimed' where id = p_open;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer edited an unassigned post without taking it over'; end if;
  raise notice 'PASS: designer must take over an unassigned post before editing it';

  update public.posts set designer_id = d1 where id = p_open;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: designer could not take over an unassigned post'; end if;
  raise notice 'PASS: designer can take over an unassigned post';

  update public.posts set designer_id = d1 where id = p_d2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: designer took over another designer''s post'; end if;
  raise notice 'PASS: designer cannot take over another designer''s post';

  update public.posts set status = 'Ready for Review' where id = p_d1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: designer could not mark their post Ready for Review'; end if;
  raise notice 'PASS: designer can mark their post Ready for Review';

  begin
    perform public.request_post_changes(p_review, 'Designer feedback');
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer requested changes'; end if;
  raise notice 'PASS: designer cannot request changes';

  if public.can_edit_post_artwork(p_d2::text) or not public.can_edit_post_artwork(p_d1::text) then
    raise exception 'FAIL: artwork permission is wrong for designers';
  end if;
  raise notice 'PASS: designer can manage artwork only on their own unapproved posts';

  begin
    insert into public.post_assets (post_id, storage_path, file_name, mime_type, size_bytes)
    values (p_d2, 'posts/' || p_d2 || '/x.png', 'x.png', 'image/png', 10);
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer added artwork to another designer''s post'; end if;
  raise notice 'PASS: designer cannot add artwork to another designer''s post';

  begin
    insert into storage.objects (bucket_id, name) values ('social-media-assets', 'posts/' || p_d2 || '/x.png');
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer uploaded a file into another designer''s post'; end if;
  raise notice 'PASS: designer cannot upload files to another designer''s post';

  update public.team_members set role = 'admin' where user_id = d1;
  select role into txt from public.team_members where user_id = d1;
  if txt <> 'designer' then raise exception 'FAIL: designer promoted themselves'; end if;
  raise notice 'PASS: designer cannot change their own role';

  select count(*) into n from public.email_settings;
  if n > 0 then raise exception 'FAIL: designer can read email settings'; end if;
  raise notice 'PASS: designer cannot read email administration';

  begin
    insert into public.email_recipients (email) values ('rls-intruder@example.invalid');
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: designer added an email recipient'; end if;
  raise notice 'PASS: designer cannot change email recipients';

  -- 2. Disabled designer ----------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', d3::text, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts;
  if n > 0 then raise exception 'FAIL: disabled designer can read % posts', n; end if;
  raise notice 'PASS: disabled designer sees nothing';

  -- 3. Admin ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  txt := public.request_post_changes(p_review, 'Use the new intake date.');
  select status, changes_requested_at into txt, ts from public.posts where id = p_review;
  if txt <> 'In Design' or ts is null then raise exception 'FAIL: request changes did not send the post back (status %)', txt; end if;
  raise notice 'PASS: admin can request changes (post back to In Design with a note)';

  update public.posts set designer_id = d2 where id = p_open;
  select designer into txt from public.posts where id = p_open;
  if txt <> 'RLS Designer Two' then raise exception 'FAIL: admin reassignment did not update the name (got %)', txt; end if;
  raise notice 'PASS: admin can reassign';

  begin
    update public.posts set designer_id = d3 where id = p_open;
    denied := false;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: a disabled designer was assigned'; end if;
  raise notice 'PASS: disabled designers cannot be assigned';

  update public.posts set status = 'Approved' where id = p_d1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not approve'; end if;
  raise notice 'PASS: admin can approve';

  delete from public.posts where id = p_d2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin could not delete a post'; end if;
  raise notice 'PASS: admin can delete posts';

  -- 4. Designer resubmits ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', d1::text, 'role', 'authenticated')::text, true);
  update public.posts set status = 'Ready for Review' where id = p_review;
  select changes_requested_at into ts from public.posts where id = p_review;
  if ts is not null then raise exception 'FAIL: resubmitting did not clear the change request'; end if;
  raise notice 'PASS: resubmitting for review clears the change request';

  -- 5. Notification events (as the database role) -------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  if s.paused then
    raise notice 'SKIP: reminders are paused, so no notification events are queued';
  else
    if s.notify_assignment then
      select count(*) into n from public.email_notification_events
      where post_id = p_open and event_type = 'assignment' and details ->> 'designer_id' = d2::text;
      if n <> 1 then raise exception 'FAIL: reassignment queued % assignment events (expected 1)', n; end if;
      raise notice 'PASS: reassignment queues one assignment notification for the new designer';

      update public.posts set designer_id = d2, notes = 'Same designer' where id = p_open;
      select count(*) into n from public.email_notification_events where post_id = p_open and event_type = 'assignment';
      if n <> 2 then raise exception 'FAIL: unchanged assignment queued another event (% total)', n; end if;
      raise notice 'PASS: saving without changing the designer queues no assignment notification';
    else
      raise notice 'SKIP: assignment notifications are off';
    end if;

    if s.notify_changes_requested then
      select count(*) into n from public.email_notification_events where post_id = p_review and event_type = 'changes_requested';
      if n <> 1 then raise exception 'FAIL: request changes queued % events (expected 1)', n; end if;
      raise notice 'PASS: request changes queues a notification for the designer';
    else
      raise notice 'SKIP: changes-requested notifications are off';
    end if;

    if s.notify_ready_for_review then
      select count(*) into n from public.email_notification_events where post_id = p_d1 and event_type = 'ready_for_review';
      if n <> 1 then raise exception 'FAIL: Ready for Review queued % events (expected 1)', n; end if;
      raise notice 'PASS: Ready for Review queues a notification for the office';
    else
      raise notice 'SKIP: Ready for Review notifications are off';
    end if;
  end if;
end;
$$;

rollback;
