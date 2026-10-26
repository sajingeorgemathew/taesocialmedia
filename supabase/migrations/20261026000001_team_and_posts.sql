-- =============================================================================
-- TAE Social Media Manager — Feature 2, migration 1 of 2
-- Team membership, posts, uploaded artwork metadata and Row Level Security.
--
-- Safe to run in the Supabase SQL Editor. Run migration 2 (storage) afterwards.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Team membership
-- An authenticated user can see content only when they have a row here.
-- Rows are added by an admin (see SUPABASE_SETUP.md); there is no self sign-up.
-- -----------------------------------------------------------------------------
create table if not exists public.team_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  role         text not null default 'member' check (role in ('admin', 'member')),
  created_at   timestamptz not null default now()
);

comment on table public.team_members is 'Authorized TAE staff. Only users listed here can access posts and artwork.';

-- SECURITY DEFINER helpers so policies can check membership without
-- recursively evaluating the team_members policies.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members where user_id = (select auth.uid())
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
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_team_member() from public, anon;
revoke all on function public.is_team_admin() from public, anon;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.is_team_admin() to authenticated;

alter table public.team_members enable row level security;

drop policy if exists "Members can view their team" on public.team_members;
create policy "Members can view their team"
  on public.team_members for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_team_member()));

drop policy if exists "Admins can add members" on public.team_members;
create policy "Admins can add members"
  on public.team_members for insert
  to authenticated
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can update members" on public.team_members;
create policy "Admins can update members"
  on public.team_members for update
  to authenticated
  using ((select public.is_team_admin()))
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can remove members" on public.team_members;
create policy "Admins can remove members"
  on public.team_members for delete
  to authenticated
  using ((select public.is_team_admin()));

-- Never leave the team without an admin (would lock out the import tool and
-- member management from the app).
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (
       select 1 from public.team_members
       where role = 'admin' and user_id <> old.user_id
     ) then
    raise exception 'The team must keep at least one admin.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists team_members_keep_admin on public.team_members;
create trigger team_members_keep_admin
  before update or delete on public.team_members
  for each row execute function public.prevent_last_admin_removal();

-- -----------------------------------------------------------------------------
-- Posts — mirrors every field of the Feature 1 SocialPost type.
-- -----------------------------------------------------------------------------
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) > 0),
  publish_date     date not null,
  program          text not null check (program in (
                     'Medical Office Assistant Diploma (MOA)',
                     'Personal Support Worker (PSW)',
                     'Dental Admin Assistant Certificate',
                     'Medical Admin Assistant Certificate',
                     'Pharmacy Assistant Certificate',
                     'Windmill Financing',
                     'General TAE Marketing')),
  platforms        text[] not null default '{}'
                     check (platforms <@ array['Facebook', 'Instagram', 'LinkedIn']::text[]),
  format           text not null check (format in ('Static Photo', 'Carousel', 'Story', 'Reel')),
  status           text not null default 'Planned' check (status in (
                     'Planned', 'In Design', 'Ready for Review', 'Approved', 'Published')),
  caption          text not null default '',
  creative_wording text not null default '',
  design_brief     text not null default '',
  reel_script      text not null default '',
  designer         text not null default '',
  notes            text not null default '',
  -- Free-text artwork reference from Feature 1 (Canva / Drive link or file name).
  artwork_url      text not null default '',
  published_url    text not null default '',
  -- Original localStorage id for imported posts; makes repeated imports idempotent.
  legacy_id        text unique,
  -- Incremented on every update; the app uses it to detect concurrent edits.
  version          integer not null default 1,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists posts_publish_date_idx on public.posts (publish_date, created_at);

create or replace function public.posts_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := 1;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.updated_by := new.created_by;
  -- Imported posts keep their original timestamps; everything else is server time.
  if new.legacy_id is null then
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

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
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists posts_set_insert_fields on public.posts;
create trigger posts_set_insert_fields
  before insert on public.posts
  for each row execute function public.posts_before_insert();

drop trigger if exists posts_set_update_fields on public.posts;
create trigger posts_set_update_fields
  before update on public.posts
  for each row execute function public.posts_before_update();

alter table public.posts enable row level security;

drop policy if exists "Members can read posts" on public.posts;
create policy "Members can read posts"
  on public.posts for select
  to authenticated
  using ((select public.is_team_member()));

-- Only admins may insert rows carrying a legacy_id (the localStorage import).
drop policy if exists "Members can create posts" on public.posts;
create policy "Members can create posts"
  on public.posts for insert
  to authenticated
  with check (
    (select public.is_team_member())
    and (legacy_id is null or (select public.is_team_admin()))
  );

drop policy if exists "Members can update posts" on public.posts;
create policy "Members can update posts"
  on public.posts for update
  to authenticated
  using ((select public.is_team_member()))
  with check ((select public.is_team_member()));

drop policy if exists "Members can delete posts" on public.posts;
create policy "Members can delete posts"
  on public.posts for delete
  to authenticated
  using ((select public.is_team_member()));

-- -----------------------------------------------------------------------------
-- Uploaded artwork — one row per image in the private storage bucket.
-- Carousel slides are ordered by `position`.
-- -----------------------------------------------------------------------------
create table if not exists public.post_assets (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  position     integer not null default 0,
  uploaded_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  -- Files must live under posts/<post_id>/ in the bucket.
  constraint post_assets_path_matches_post
    check (storage_path like 'posts/' || post_id::text || '/%')
);

create index if not exists post_assets_post_idx on public.post_assets (post_id, position);

alter table public.post_assets enable row level security;

drop policy if exists "Members can read artwork records" on public.post_assets;
create policy "Members can read artwork records"
  on public.post_assets for select
  to authenticated
  using ((select public.is_team_member()));

drop policy if exists "Members can add artwork records" on public.post_assets;
create policy "Members can add artwork records"
  on public.post_assets for insert
  to authenticated
  with check ((select public.is_team_member()));

drop policy if exists "Members can reorder artwork" on public.post_assets;
create policy "Members can reorder artwork"
  on public.post_assets for update
  to authenticated
  using ((select public.is_team_member()))
  with check ((select public.is_team_member()));

drop policy if exists "Members can remove artwork records" on public.post_assets;
create policy "Members can remove artwork records"
  on public.post_assets for delete
  to authenticated
  using ((select public.is_team_member()));

-- -----------------------------------------------------------------------------
-- Grants: nothing for anonymous visitors; RLS decides for signed-in users.
-- -----------------------------------------------------------------------------
revoke all on table public.team_members, public.posts, public.post_assets from anon;
grant select, insert, update, delete on table public.team_members, public.posts, public.post_assets to authenticated;
