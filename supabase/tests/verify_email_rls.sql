-- =============================================================================
-- Email reminders RLS verification — run in the Supabase SQL Editor AFTER
-- migration 20261026000003_email_reminders.sql.
--
-- Impersonates an anonymous visitor, a signed-in non-member, a regular team
-- member (if one exists) and an admin. Prints PASS notices; any failure stops
-- with an error starting with "FAIL". Everything is rolled back.
-- =============================================================================

begin;

do $$
declare
  n integer;
  admin_id uuid;
  member_id uuid;
begin
  select user_id into admin_id from public.team_members where role = 'admin' limit 1;
  select user_id into member_id from public.team_members where role = 'member' limit 1;
  if admin_id is null then
    raise exception 'FAIL: no admin found in public.team_members.';
  end if;

  -- 1. Anonymous visitor ------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    select count(*) into n from public.email_recipients;
    raise exception 'FAIL: anonymous visitor can query recipients (% rows)', n;
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous visitor is denied email recipients';
  end;
  begin
    select count(*) into n from public.email_delivery_logs;
    raise exception 'FAIL: anonymous visitor can query delivery logs';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous visitor is denied delivery logs';
  end;

  -- 2. Signed in, not a team member ------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);

  select count(*) into n from public.email_recipients;
  if n > 0 then raise exception 'FAIL: non-member can read % recipients', n; end if;
  raise notice 'PASS: non-member sees no recipients';

  select count(*) into n from public.email_settings;
  if n > 0 then raise exception 'FAIL: non-member can read email settings'; end if;
  raise notice 'PASS: non-member sees no email settings';

  begin
    insert into public.email_recipients (email) values ('intruder@example.com');
    raise exception 'FAIL: non-member added a recipient';
  exception when insufficient_privilege then
    raise notice 'PASS: non-member cannot add recipients';
  end;

  -- 3. Regular team member (skipped when there is none) ------------------------
  if member_id is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', member_id::text, 'role', 'authenticated')::text, true);

    select count(*) into n from public.email_recipients;
    if n > 0 then raise exception 'FAIL: non-admin member can read recipients'; end if;
    raise notice 'PASS: non-admin member sees no recipients';

    update public.email_settings set paused = true where id = 1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FAIL: non-admin member changed email settings'; end if;
    raise notice 'PASS: non-admin member cannot change email settings';

    begin
      insert into public.email_schedules (send_time) values ('06:05');
      raise exception 'FAIL: non-admin member added a schedule';
    exception when insufficient_privilege then
      raise notice 'PASS: non-admin member cannot add schedules';
    end;
  else
    raise notice 'SKIP: no member-role user exists to test non-admin access';
  end if;

  -- 4. Admin -----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  select count(*) into n from public.email_settings;
  if n <> 1 then raise exception 'FAIL: admin cannot read email settings'; end if;
  raise notice 'PASS: admin can read email settings';

  insert into public.email_schedules (send_time, label) values ('06:05', 'RLS test');
  raise notice 'PASS: admin can add a schedule';

  select count(*) into n from public.email_delivery_logs;
  raise notice 'PASS: admin can read delivery history (% rows)', n;

  begin
    perform body_html from public.email_delivery_logs limit 1;
    raise exception 'FAIL: admin can read stored email bodies through the API role';
  exception when insufficient_privilege then
    raise notice 'PASS: stored email bodies are not readable by app users';
  end;

  begin
    insert into public.email_delivery_logs (kind, dedupe_key, recipient_email) values ('test', 'rls-test', 'x@example.com');
    raise exception 'FAIL: admin wrote to the delivery log directly';
  exception when insufficient_privilege then
    raise notice 'PASS: delivery log is written only by Edge Functions';
  end;

  begin
    perform public.enqueue_email_deliveries('[]'::jsonb);
    raise exception 'FAIL: app users can call enqueue_email_deliveries';
  exception when insufficient_privilege then
    raise notice 'PASS: enqueue_email_deliveries is not callable by app users';
  end;

  begin
    perform public.claim_email_deliveries();
    raise exception 'FAIL: app users can call claim_email_deliveries';
  exception when insufficient_privilege then
    raise notice 'PASS: claim_email_deliveries is not callable by app users';
  end;

  begin
    select count(*) into n from public.email_notification_events;
    raise exception 'FAIL: admin can read the notification queue directly';
  exception when insufficient_privilege then
    raise notice 'PASS: notification queue is service-role only';
  end;
end;
$$;

rollback;
