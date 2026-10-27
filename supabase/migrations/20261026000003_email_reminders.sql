-- =============================================================================
-- TAE Social Media Manager — Feature 3, migration 1 of 2
-- Email reminders: settings, recipients, digest schedules, workflow
-- notification queue, delivery log, and the claim functions used by the
-- Edge Functions to prevent duplicate sends.
--
-- Run in the Supabase SQL Editor AFTER the Feature 2 migrations (it relies on
-- public.is_team_admin() and public.posts). Safe to re-run.
--
-- No API keys are stored in any table. The Resend key lives only in the
-- Edge Function secrets.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings — a single row (id = 1).
-- -----------------------------------------------------------------------------
create table if not exists public.email_settings (
  id                         smallint primary key default 1 check (id = 1),
  -- Master switch: when true nothing scheduled is sent (digests, workflow
  -- notifications, deadline reminders). Test emails still work.
  paused                     boolean not null default false,
  digest_enabled             boolean not null default true,
  -- ISO weekdays: 1 = Monday … 7 = Sunday.
  digest_weekdays            smallint[] not null default '{1,2,3,4,5}'
                               check (digest_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  -- Fixed for TAE; stored so the Edge Functions and UI read one source of truth.
  timezone                   text not null default 'America/Toronto' check (timezone = 'America/Toronto'),
  -- Deployed app URL, linked from emails. Empty = no link in emails.
  app_url                    text not null default ''
                               check (app_url = '' or app_url ~ '^https://[^\s/$.?#][^\s]*$'),
  notify_assignment          boolean not null default false,
  notify_ready_for_review    boolean not null default false,
  notify_approved            boolean not null default false,
  notify_deadline            boolean not null default false,
  -- Deadline reminders cover unfinished posts due within this many days.
  deadline_days_ahead        smallint not null default 2 check (deadline_days_ahead between 0 and 14),
  -- Local (America/Toronto) time of the daily deadline reminder.
  deadline_reminder_time     time not null default '08:00',
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users (id) on delete set null
);

comment on table public.email_settings is 'Email reminder settings (single row). Never store API keys here.';

insert into public.email_settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Recipients
-- -----------------------------------------------------------------------------
create table if not exists public.email_recipients (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null unique
                           check (email = lower(btrim(email))
                                  and char_length(email) <= 254
                                  and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name                   text not null default '' check (char_length(name) <= 120),
  active                 boolean not null default true,
  -- Scheduled progress digests.
  receives_digest        boolean not null default true,
  -- Ready for Review / Approved notifications and deadline reminders.
  receives_notifications boolean not null default true,
  -- Assignment notifications for designers WITHOUT a linked recipient
  -- (see designer_name). Off by default: an explicit opt-in.
  receives_assignments   boolean not null default false,
  -- Admin-confirmed link to the designer name typed on posts. When a post's
  -- designer matches (case-insensitive), the assignment email goes to this
  -- recipient. Never guessed from names or addresses.
  designer_name          text not null default ''
                           check (designer_name = btrim(designer_name) and char_length(designer_name) <= 120),
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at             timestamptz not null default now()
);

comment on table public.email_recipients is 'People who receive TAE reminder emails. Inactive recipients are never emailed.';

-- One recipient per designer name.
create unique index if not exists email_recipients_designer_name_key
  on public.email_recipients (lower(designer_name)) where designer_name <> '';

insert into public.email_recipients (email, name)
values ('office@torontoacademy.ca', 'TAE Office')
on conflict (email) do nothing;

-- -----------------------------------------------------------------------------
-- Digest schedules — one row per daily sending time (America/Toronto).
-- Weekdays are shared and live in email_settings.digest_weekdays.
-- -----------------------------------------------------------------------------
create table if not exists public.email_schedules (
  id          uuid primary key default gen_random_uuid(),
  send_time   time not null unique check (extract(second from send_time) = 0),
  label       text not null default '' check (char_length(label) <= 60),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  -- A schedule only fires for slots after its last change, so adding or moving
  -- a time to one that already passed today does not send immediately.
  updated_at  timestamptz not null default now()
);

comment on table public.email_schedules is 'Daily progress digest times in America/Toronto. Read by the email-dispatch Edge Function on every Cron tick.';

-- Seed the initial 9 AM / 1 PM / 5 PM schedule only on first install.
insert into public.email_schedules (send_time, label)
select t.send_time, t.label
from (values ('09:00'::time, 'Morning'), ('13:00'::time, 'Midday'), ('17:00'::time, 'End of day')) as t (send_time, label)
where not exists (select 1 from public.email_schedules);

-- -----------------------------------------------------------------------------
-- Workflow notification queue — filled by a trigger on posts, drained by the
-- email-dispatch function, which groups events into one email per run so an
-- ordinary edit never sends mail.
-- -----------------------------------------------------------------------------
create table if not exists public.email_notification_events (
  id           bigint generated always as identity primary key,
  post_id      uuid not null references public.posts (id) on delete cascade,
  event_type   text not null check (event_type in ('assignment', 'ready_for_review', 'approved')),
  -- Snapshot at the time of the change (title, designer, status, date…).
  details      jsonb not null default '{}'::jsonb,
  actor        uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Set when a dispatcher run claims the event.
  batch_id     uuid,
  claimed_at   timestamptz,
  -- Set in the same transaction that queues the resulting emails.
  processed_at timestamptz,
  outcome      text check (outcome in ('sent', 'skipped'))
);

create index if not exists email_notification_events_pending_idx
  on public.email_notification_events (created_at) where processed_at is null;

-- -----------------------------------------------------------------------------
-- Delivery log and outbox — one row per (email, recipient), so every
-- recipient's delivery is independent.
--
--   1. enqueue: the row is inserted as 'queued'. `dedupe_key` is unique, so
--      a second run for the same slot and recipient inserts nothing.
--   2. claim:   a sender atomically moves due rows to 'sending' (FOR UPDATE
--      SKIP LOCKED), so two runs never send the same row.
--   3. send:    Resend gets an Idempotency-Key derived from dedupe_key, so a
--      retry after an uncertain failure cannot double-send (24 h window).
--   4. record:  'sent' / 'failed' (retryable or not) / 'skipped'.
-- Rows not sent before the run's time limit simply stay queued for the next
-- run; rows past `expires_at` are never sent.
-- -----------------------------------------------------------------------------
create table if not exists public.email_delivery_logs (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('digest', 'test', 'notification', 'deadline')),
  dedupe_key        text not null unique check (char_length(dedupe_key) <= 512),
  recipient_id      uuid references public.email_recipients (id) on delete set null,
  recipient_email   text not null,
  subject           text not null default '',
  status            text not null default 'queued'
                      check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  -- Send attempts made so far.
  attempts          integer not null default 0,
  retryable         boolean not null default false,
  next_attempt_at   timestamptz,
  -- Not sent after this (stale digests are worse than none). Capped below
  -- Resend's 24 h idempotency window.
  expires_at        timestamptz not null default now() + interval '6 hours',
  resend_message_id text,
  error             text,
  -- The local schedule slot (digests) or reminder time this email belongs to.
  scheduled_for     timestamptz,
  triggered_by      uuid references auth.users (id) on delete set null,
  -- Rendered content, kept only until the email is sent so retries resend the
  -- identical message; cleared on success.
  body_html         text,
  body_text         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz
);

create index if not exists email_delivery_logs_created_idx on public.email_delivery_logs (created_at desc);
create index if not exists email_delivery_logs_outbox_idx
  on public.email_delivery_logs (created_at) where status in ('queued', 'sending', 'failed');

comment on table public.email_delivery_logs is 'Every email attempt. Written only by Edge Functions (service role); admins can read it.';

-- -----------------------------------------------------------------------------
-- Timestamps / audit fields
-- -----------------------------------------------------------------------------
create or replace function public.email_touch_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'email_settings' then
    new.id := 1;
    new.updated_by := auth.uid();
  elsif tg_table_name = 'email_recipients' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  elsif tg_table_name = 'email_schedules' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists email_settings_touch on public.email_settings;
create trigger email_settings_touch
  before update on public.email_settings
  for each row execute function public.email_touch_updated();

drop trigger if exists email_recipients_touch on public.email_recipients;
create trigger email_recipients_touch
  before update on public.email_recipients
  for each row execute function public.email_touch_updated();

drop trigger if exists email_schedules_touch on public.email_schedules;
create trigger email_schedules_touch
  before update on public.email_schedules
  for each row execute function public.email_touch_updated();

-- -----------------------------------------------------------------------------
-- Enqueue workflow notifications on meaningful post changes only:
--   * designer assigned/changed  → assignment
--   * status → Ready for Review   → ready_for_review
--   * status → Approved           → approved
-- Disabled notification types are not queued. Failures here never block a
-- post save.
-- -----------------------------------------------------------------------------
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
      'previous_designer', case when tg_op = 'UPDATE' then old.designer else '' end,
      'previous_status', case when tg_op = 'UPDATE' then old.status else null end
    );

    if s.notify_assignment
       and btrim(new.designer) <> ''
       and (tg_op = 'INSERT' or btrim(old.designer) is distinct from btrim(new.designer))
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
  exception when others then
    raise warning 'Email notification was not queued: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.posts_enqueue_email_events() from public, anon, authenticated;

drop trigger if exists posts_email_events on public.posts;
create trigger posts_email_events
  after insert or update of status, designer on public.posts
  for each row execute function public.posts_enqueue_email_events();

-- -----------------------------------------------------------------------------
-- Pausing cancels everything scheduled that has not been sent yet, so resuming
-- never releases a backlog. Test emails are not affected.
-- -----------------------------------------------------------------------------
create or replace function public.email_settings_after_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paused and not old.paused then
    update public.email_delivery_logs
    set status = 'skipped',
        error = 'Not sent: reminders were paused.',
        retryable = false,
        next_attempt_at = null,
        body_html = null,
        body_text = null,
        updated_at = now()
    where kind <> 'test'
      and (status = 'queued' or (status = 'failed' and retryable));

    update public.email_notification_events
    set batch_id = coalesce(batch_id, gen_random_uuid()),
        processed_at = now(),
        outcome = 'skipped'
    where processed_at is null;
  end if;
  return null;
end;
$$;

revoke all on function public.email_settings_after_pause() from public, anon, authenticated;

drop trigger if exists email_settings_pause on public.email_settings;
create trigger email_settings_pause
  after update of paused on public.email_settings
  for each row execute function public.email_settings_after_pause();

-- -----------------------------------------------------------------------------
-- Outbox helpers — executed only by the Edge Functions (service role).
-- -----------------------------------------------------------------------------

-- Inserts one 'queued' row per delivery in a single transaction. Rows whose
-- dedupe_key already exists are ignored (that slot/recipient was already
-- queued). When p_event_batch_id is given, the claimed workflow events are
-- marked processed in the SAME transaction, so a crash can never lose them
-- or queue them twice. Returns only the rows actually inserted.
create or replace function public.enqueue_email_deliveries(
  p_deliveries     jsonb,
  p_event_batch_id uuid default null,
  p_event_outcome  text default null
)
returns table (delivery_id uuid, delivery_key text)
language plpgsql
set search_path = ''
as $$
begin
  if p_event_batch_id is not null then
    update public.email_notification_events
    set processed_at = now(), outcome = p_event_outcome
    where batch_id = p_event_batch_id and processed_at is null;
  end if;

  return query
  insert into public.email_delivery_logs as l (
    kind, dedupe_key, recipient_id, recipient_email, subject, body_html, body_text,
    scheduled_for, triggered_by, expires_at, next_attempt_at
  )
  select d.kind, d.dedupe_key, d.recipient_id, d.recipient_email, coalesce(d.subject, ''),
         d.body_html, d.body_text, d.scheduled_for, d.triggered_by,
         -- Never later than 20 h: Resend keeps idempotency keys for 24 h.
         least(coalesce(d.expires_at, now() + interval '6 hours'), now() + interval '20 hours'),
         now()
  from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb)) as d (
    kind text, dedupe_key text, recipient_id uuid, recipient_email text, subject text,
    body_html text, body_text text, scheduled_for timestamptz, triggered_by uuid, expires_at timestamptz
  )
  on conflict (dedupe_key) do nothing
  returning l.id, l.dedupe_key;
end;
$$;

-- Atomically claims deliveries that are due: newly queued rows, failed rows
-- whose retry time has come, and rows stuck in 'sending' because a run was
-- interrupted. SKIP LOCKED means concurrent runs never claim the same row.
-- p_ids restricts the claim (used by the test-email function).
create or replace function public.claim_email_deliveries(
  p_limit        integer default 5,
  p_max_attempts integer default 3,
  p_ids          uuid[] default null
)
returns setof public.email_delivery_logs
language sql
set search_path = ''
as $$
  update public.email_delivery_logs l
  set status = 'sending',
      attempts = l.attempts + 1,
      next_attempt_at = null,
      updated_at = now()
  where l.id in (
    select d.id from public.email_delivery_logs d
    where (p_ids is null or d.id = any (p_ids))
      and d.attempts < p_max_attempts
      and d.expires_at > now()
      and d.body_html is not null
      and (
        d.status = 'queued'
        or (d.status = 'failed' and d.retryable and d.next_attempt_at <= now())
        or (d.status = 'sending' and d.updated_at < now() - interval '10 minutes')
      )
    order by d.created_at
    limit p_limit
    for update skip locked
  )
  returning l.*;
$$;

-- Claims workflow events that have been quiet for p_quiet_seconds (so a quick
-- change-and-undo collapses), plus events from a run that crashed before
-- queuing its emails.
create or replace function public.claim_email_notification_events(p_batch_id uuid, p_quiet_seconds integer default 120)
returns setof public.email_notification_events
language sql
set search_path = ''
as $$
  update public.email_notification_events e
  set batch_id = p_batch_id,
      claimed_at = now()
  where e.id in (
    select n.id from public.email_notification_events n
    where n.processed_at is null
      and (
        (n.batch_id is null and n.created_at <= now() - make_interval(secs => p_quiet_seconds))
        or n.claimed_at < now() - interval '10 minutes'
      )
    order by n.created_at
    limit 200
    for update skip locked
  )
  returning e.*;
$$;

revoke all on function public.enqueue_email_deliveries(jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_email_deliveries(integer, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.claim_email_notification_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.enqueue_email_deliveries(jsonb, uuid, text) to service_role;
grant execute on function public.claim_email_deliveries(integer, integer, uuid[]) to service_role;
grant execute on function public.claim_email_notification_events(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security — admins only. Members and anonymous visitors see nothing.
-- The delivery log and event queue are written exclusively by the service role.
-- -----------------------------------------------------------------------------
alter table public.email_settings enable row level security;
alter table public.email_recipients enable row level security;
alter table public.email_schedules enable row level security;
alter table public.email_notification_events enable row level security;
alter table public.email_delivery_logs enable row level security;

drop policy if exists "Admins can read email settings" on public.email_settings;
create policy "Admins can read email settings"
  on public.email_settings for select
  to authenticated
  using ((select public.is_team_admin()));

drop policy if exists "Admins can update email settings" on public.email_settings;
create policy "Admins can update email settings"
  on public.email_settings for update
  to authenticated
  using ((select public.is_team_admin()))
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can read recipients" on public.email_recipients;
create policy "Admins can read recipients"
  on public.email_recipients for select
  to authenticated
  using ((select public.is_team_admin()));

drop policy if exists "Admins can add recipients" on public.email_recipients;
create policy "Admins can add recipients"
  on public.email_recipients for insert
  to authenticated
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can update recipients" on public.email_recipients;
create policy "Admins can update recipients"
  on public.email_recipients for update
  to authenticated
  using ((select public.is_team_admin()))
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can remove recipients" on public.email_recipients;
create policy "Admins can remove recipients"
  on public.email_recipients for delete
  to authenticated
  using ((select public.is_team_admin()));

drop policy if exists "Admins can read schedules" on public.email_schedules;
create policy "Admins can read schedules"
  on public.email_schedules for select
  to authenticated
  using ((select public.is_team_admin()));

drop policy if exists "Admins can add schedules" on public.email_schedules;
create policy "Admins can add schedules"
  on public.email_schedules for insert
  to authenticated
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can update schedules" on public.email_schedules;
create policy "Admins can update schedules"
  on public.email_schedules for update
  to authenticated
  using ((select public.is_team_admin()))
  with check ((select public.is_team_admin()));

drop policy if exists "Admins can remove schedules" on public.email_schedules;
create policy "Admins can remove schedules"
  on public.email_schedules for delete
  to authenticated
  using ((select public.is_team_admin()));

drop policy if exists "Admins can read delivery history" on public.email_delivery_logs;
create policy "Admins can read delivery history"
  on public.email_delivery_logs for select
  to authenticated
  using ((select public.is_team_admin()));

-- No client policies on email_notification_events: service role only.

-- -----------------------------------------------------------------------------
-- Grants: nothing for anonymous visitors; admins act through RLS; the log can
-- only be read (and only the columns the UI needs — never the stored bodies).
-- -----------------------------------------------------------------------------
revoke all on table
  public.email_settings, public.email_recipients, public.email_schedules,
  public.email_notification_events, public.email_delivery_logs
  from anon, authenticated;

grant select, update on table public.email_settings to authenticated;
grant select, insert, update, delete on table public.email_recipients, public.email_schedules to authenticated;
grant select (id, kind, recipient_email, subject, status, attempts, retryable, next_attempt_at,
              expires_at, resend_message_id, error, scheduled_for, created_at, updated_at, sent_at)
  on table public.email_delivery_logs to authenticated;

grant all on table
  public.email_settings, public.email_recipients, public.email_schedules,
  public.email_notification_events, public.email_delivery_logs
  to service_role;
