-- =============================================================================
-- TAE Social Media Manager — Feature 3, migration 2 of 2
-- Supabase Cron job that calls the email-dispatch Edge Function every 5 minutes.
--
-- Run ONLY after:
--   1. migration 20261026000003_email_reminders.sql,
--   2. deploying the email-dispatch Edge Function,
--   3. setting the EMAIL_CRON_SECRET Edge Function secret, and
--   4. storing the two Vault secrets below (see RESEND_SETUP.md, step 5).
--
-- The job contains no secrets: the project URL and the shared cron secret are
-- read from Supabase Vault each time it runs. Schedules themselves live in
-- public.email_schedules, so editing reminder times never requires touching
-- this job. Safe to re-run (it replaces the job).
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'tae_email_project_url') then
    raise exception 'Vault secret "tae_email_project_url" is missing. See RESEND_SETUP.md step 5.';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'tae_email_cron_secret') then
    raise exception 'Vault secret "tae_email_cron_secret" is missing. See RESEND_SETUP.md step 5.';
  end if;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'tae-email-dispatch';

select cron.schedule(
  'tae-email-dispatch',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'tae_email_project_url'), '/')
           || '/functions/v1/email-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tae_email_cron_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron', 'at', now()),
    timeout_milliseconds := 120000
  );
  $job$
);
