-- =============================================================================
-- RLS verification — run in the Supabase SQL Editor AFTER both migrations and
-- after the first admin has been added to public.team_members.
--
-- It impersonates (1) an anonymous visitor and (2) a signed-in user who is NOT
-- a team member, then (3) the first admin. Every check prints PASS as a notice;
-- any failure aborts with an error starting with "FAIL". Nothing is saved: the
-- whole script runs inside a transaction that is rolled back.
-- =============================================================================

begin;

do $$
declare
  n integer;
  admin_id uuid;
begin
  select user_id into admin_id from public.team_members where role = 'admin' limit 1;
  if admin_id is null then
    raise exception 'FAIL: no admin found in public.team_members — complete the initial admin setup first.';
  end if;

  -- 1. Anonymous visitor ------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  begin
    select count(*) into n from public.posts;
    if n > 0 then raise exception 'FAIL: anonymous visitor can read % posts', n; end if;
    raise notice 'PASS: anonymous visitor sees no posts';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous visitor is denied access to posts';
  end;

  begin
    select count(*) into n from public.team_members;
    if n > 0 then raise exception 'FAIL: anonymous visitor can read team members'; end if;
    raise notice 'PASS: anonymous visitor sees no team members';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous visitor is denied access to team members';
  end;

  begin
    select count(*) into n from storage.objects where bucket_id = 'social-media-assets';
    if n > 0 then raise exception 'FAIL: anonymous visitor can list artwork files'; end if;
    raise notice 'PASS: anonymous visitor sees no artwork files';
  exception when insufficient_privilege then
    raise notice 'PASS: anonymous visitor is denied access to artwork files';
  end;

  -- 2. Signed in, but not a team member -----------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);

  select count(*) into n from public.posts;
  if n > 0 then raise exception 'FAIL: non-member can read % posts', n; end if;
  raise notice 'PASS: non-member sees no posts';

  select count(*) into n from public.post_assets;
  if n > 0 then raise exception 'FAIL: non-member can read artwork records'; end if;
  raise notice 'PASS: non-member sees no artwork records';

  select count(*) into n from storage.objects where bucket_id = 'social-media-assets';
  if n > 0 then raise exception 'FAIL: non-member can list artwork files'; end if;
  raise notice 'PASS: non-member sees no artwork files';

  begin
    insert into public.posts (title, publish_date, program, format)
    values ('RLS test', current_date, 'General TAE Marketing', 'Static Photo');
    raise exception 'FAIL: non-member was able to create a post';
  exception when insufficient_privilege then
    raise notice 'PASS: non-member cannot create posts';
  end;

  begin
    insert into public.team_members (user_id, email, role)
    values ((current_setting('request.jwt.claims')::json ->> 'sub')::uuid, 'intruder@example.com', 'admin');
    raise exception 'FAIL: non-member was able to add themselves to the team';
  exception when insufficient_privilege then
    raise notice 'PASS: non-member cannot add themselves to the team';
  end;

  -- 3. The first admin ------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  select count(*) into n from public.team_members where user_id = admin_id;
  if n <> 1 then raise exception 'FAIL: admin cannot see their own membership'; end if;
  select count(*) into n from public.posts;
  raise notice 'PASS: admin can read posts (% currently stored)', n;
end;
$$;

rollback;
