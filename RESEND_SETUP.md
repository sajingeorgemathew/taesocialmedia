# Resend Email Reminders — Setup (Feature 3)

Step-by-step setup for the **existing** TAE Social Media Manager Supabase
project. Do the steps **in order**; each ends with a check. Nothing in this
guide touches other TAE applications, other Supabase projects, existing
tables' data, authentication settings, or the existing Resend key.

| | |
| --- | --- |
| Verified domain | `mail.portal-torontoacademy.ca` |
| Sender | `TAE Social Media Manager <notifications@mail.portal-torontoacademy.ca>` |
| Time zone | `America/Toronto` (daylight saving handled automatically) |
| Default recipient | `office@torontoacademy.ca` (added by the migration) |
| Initial schedule | Monday–Friday, 9:00 a.m., 1:00 p.m., 5:00 p.m. |

**You will need:** the Supabase dashboard (admin access to this project), the
project ref (`https://<project-ref>.supabase.co`), Node.js (for `npx supabase`),
and an app login with the `admin` role.

---

## How it works (read once)

```
Supabase Cron (every 5 min) ──POST + x-cron-secret──► email-dispatch
                                                        │ 1. queue due emails: one outbox row per recipient
                                                        │ 2. claim + send each row independently
Email Reminders page (admin) ──user JWT──► email-send-test (admin check, listed recipients only)
                                                        ▼
                                  email_delivery_logs ──► Resend API (Idempotency-Key)
```

* **Schedules live in the database.** One Cron job checks every 5 minutes what
  is due. Changing times, weekdays, recipients or preferences in the app never
  needs a redeploy or a Cron change.
* **One delivery row per recipient.** Each email is first queued as its own
  row in `email_delivery_logs`, then claimed and sent on its own. A failure,
  error or time-out for one recipient never stops the others; anything unsent
  stays queued for the next run.
* **No duplicates.** Every row has a unique `dedupe_key` (e.g.
  `digest:2026-10-27T09:00:office@torontoacademy.ca`), so the same slot can be
  queued only once however many runs overlap. Rows are claimed with
  `FOR UPDATE SKIP LOCKED`, so two runs never send the same row. Resend also
  receives an `Idempotency-Key` derived from the `dedupe_key`, so a retry after
  an uncertain network error is deduplicated by Resend (24 h window — retries
  stop after 20 h).
* **Retries.** Network errors, Resend 5xx and 429 are retried automatically
  (after ~2 and ~10 minutes, 3 attempts in total). Invalid addresses or a
  rejected key/sender are not retried. A digest more than 3 hours late is
  dropped rather than sent stale. Retries run from the Cron job.
* **Pause All Reminders** cancels every scheduled email that has not gone out
  yet and stops new ones. Resuming never releases a backlog. Test emails still
  work.
* **Workflow notifications** are queued by a database trigger only on these
  changes — never on ordinary edits, and only for types switched on:
  designer assigned/changed, status → *Ready for Review*, status → *Approved*.
  Changes are grouped (after 2 quiet minutes) into one email per recipient.
* **Who gets what** (per recipient, editable in the app):

  | Email | Sent to |
  | --- | --- |
  | Progress digest | Active recipients with **Digest** ticked |
  | Ready for Review / Approved / deadline reminders | Active recipients with **Workflow** ticked |
  | Assignment | The **linked designer** — the recipient whose *Designer name on posts* matches the post's designer (an admin sets this link). If no designer is linked: only recipients with **Assignments** ticked. Addresses are never guessed from names. |

---

## Step 1 — Confirm the existing Edge Function secret names

Read-only. Nothing is created or changed.

1. Dashboard → **Edge Functions → Secrets** (older dashboards: **Project
   Settings → Edge Functions**). Only names and digests are shown.
2. Find the secret that holds the Resend API key and note its **exact name**.
3. Note whether any of these names **already exist** (they must not be
   overwritten later): `RESEND_API_KEY_SECRET_NAME`, `EMAIL_CRON_SECRET`,
   `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_MIN_INTERVAL_MS`.

How the functions find the key:

* They read the secret whose name is in **`RESEND_API_KEY_SECRET_NAME`**.
* If that is not set, they read **`RESEND_API_KEY`**.

So:

* Resend secret is named exactly `RESEND_API_KEY` → nothing to add.
* It has another name, e.g. `TAE_RESEND_KEY` → in step 3 you will add **one
  new** secret `RESEND_API_KEY_SECRET_NAME` = `TAE_RESEND_KEY` (the *name*,
  not the key). The key itself is never copied, replaced or deleted.

**Check:** you know the Resend secret's exact name.

---

## Step 2 — Review and apply the `email_reminders` migration

1. Make sure this migration has **not** been applied before. In **SQL Editor**:

   ```sql
   select to_regclass('public.email_settings') as already_installed;
   ```

   Expect `NULL`. If it shows `email_settings`, **stop** — an earlier draft was
   applied; ask for an upgrade script instead of re-running.
2. Open
   [`supabase/migrations/20261026000003_email_reminders.sql`](supabase/migrations/20261026000003_email_reminders.sql)
   and review it. It only **adds** objects:

   | Object | Purpose |
   | --- | --- |
   | `email_settings` (one row) | Pause, digest on/off, weekdays, app link, notification preferences, deadline window/time. |
   | `email_recipients` | Addresses with *Digest / Workflow / Assignments* flags, active flag, optional linked designer name. Seeds `office@torontoacademy.ca`. |
   | `email_schedules` | Digest times; seeds 09:00, 13:00, 17:00. |
   | `email_notification_events` | Queue of workflow changes. |
   | `email_delivery_logs` | Outbox + history: one row per recipient per email. |
   | Trigger `posts_email_events` on `posts` | Queues workflow events. Wrapped so it can **never** block saving a post. |
   | Trigger `email_settings_pause` | Cancels unsent scheduled emails when paused. |
   | Functions `enqueue_email_deliveries`, `claim_email_deliveries`, `claim_email_notification_events` | Outbox operations, executable **only** by the service role. |

   It does not modify `posts`' columns or data, `team_members`, `post_assets`,
   storage, or auth.
3. **SQL Editor → New query**, paste the **whole file**, **Run**. Expect
   *Success. No rows returned.*
4. Paste and run
   [`supabase/tests/verify_email_rls.sql`](supabase/tests/verify_email_rls.sql).
   It rolls back, so nothing changes. Expect only `PASS` lines (16 of them, or
   13 plus a `SKIP` if no user has the `member` role). Any `FAIL` stops with
   an error — report it before continuing.
5. Run `notify pgrst, 'reload schema';`

**Check:**

```sql
select email, active, receives_digest, receives_notifications, receives_assignments from public.email_recipients;
select send_time, active from public.email_schedules order by send_time;
select paused, digest_enabled, digest_weekdays, timezone from public.email_settings;
```

→ office address (digest ✓, workflow ✓, assignments ✗); 09:00 / 13:00 / 17:00;
`false, true, {1,2,3,4,5}, America/Toronto`.

What the security rules (RLS) enforce:

| | Anonymous | Signed-in non-member | Team member | Admin | Edge Functions (service role) |
| --- | --- | --- | --- | --- | --- |
| Settings, recipients, schedules | ✗ | ✗ | ✗ | read + edit | full |
| Delivery history | ✗ | ✗ | ✗ | read (no email bodies) | full |
| Notification queue, outbox functions | ✗ | ✗ | ✗ | ✗ | full |

---

## Step 3 — Deploy the two Edge Functions

Both functions are deployed with gateway JWT verification **off** because each
performs its own, stricter check in code:

| Function | Who may call it | Check performed inside the function |
| --- | --- | --- |
| `email-send-test` | Signed-in **admins** (from the app) | Caller's access token is validated with Supabase Auth; `team_members.role` must be `admin`; sends only to **active addresses already on the recipient list** (by id — an arbitrary address cannot be supplied); max 30 test emails per admin per 10 minutes. |
| `email-dispatch` | **Supabase Cron only** | `x-cron-secret` header must equal the `EMAIL_CRON_SECRET` secret (constant-time compare). Until that secret exists, every call is refused. |

1. If step 1 showed the Resend secret is **not** named `RESEND_API_KEY`, add
   the Edge Function secret (Dashboard → Edge Functions → Secrets → **Add new
   secret**):

   | Name | Value |
   | --- | --- |
   | `RESEND_API_KEY_SECRET_NAME` | the existing secret's **name** |

2. Optional secrets (only if you want them; skip any that already exist):

   | Name | Default when unset | Purpose |
   | --- | --- | --- |
   | `EMAIL_REPLY_TO` | none | e.g. `office@torontoacademy.ca` |
   | `EMAIL_FROM` | `TAE Social Media Manager <notifications@mail.portal-torontoacademy.ca>` | Must stay on the verified domain. |
   | `RESEND_MIN_INTERVAL_MS` | `600` | Gap between Resend calls (rate limit). |

   Do **not** set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`; Supabase
   provides them.
3. From the project folder:

   ```bash
   npx supabase login
   npx supabase functions deploy email-send-test --project-ref <project-ref> --no-verify-jwt
   npx supabase functions deploy email-dispatch  --project-ref <project-ref> --no-verify-jwt
   ```

   The shared code in `supabase/functions/_shared/` is bundled automatically.
   If the CLI offers to create `supabase/config.toml`, accept; it only affects
   local tooling.
4. Dashboard → **Edge Functions**: both listed; open each → *Enforce JWT
   verification* is **off**.

**Check (security):** both must answer **401** and send nothing:

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/email-send-test" -H "Content-Type: application/json" -d "{}"
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/email-dispatch"
```

(`email-dispatch` answers **500 "Email dispatch is not configured."** until
step 5 — that is also a refusal.)

---

## Step 4 — Test email delivery (Cron still OFF)

Only `email-send-test` is used; nothing is scheduled yet.

1. Sign in to the app as an **admin** → **Email Reminders** (tab under the
   header, or avatar menu → *Email reminders*).
2. **Send Test Email** → tick only `office@torontoacademy.ca` → **Send test
   email**. Expect *Sent*.
3. **Recipients** → add the designer's address → **Send Test Email** to it.
   Expect *Sent*.
4. **Email history** → both rows show *Sent*, kind *Test*, and a Resend
   message ID.
5. Confirm both emails arrived (check spam). Subject starts with
   `[Test] TAE social media digest`.
6. Resend dashboard → **Emails** → search the message IDs → *Delivered*.
7. Signed in as a `member` (non-admin): there is no Email Reminders tab.

If a test fails, the history row shows the reason — see
[Troubleshooting](#troubleshooting). A failed test is **not** retried until
Cron is running (step 6); just send a new test after fixing the cause.

**Check:** office and designer both received a test email. **Do not continue
until this works.**

---

## Step 5 — Configure Vault secrets and the Cron secret

1. **SQL Editor** (replace `<project-ref>`):

   ```sql
   -- A random 64-character shared secret, stored encrypted in Vault.
   select vault.create_secret(
     encode(extensions.gen_random_bytes(32), 'hex'),
     'tae_email_cron_secret',
     'Shared secret: Supabase Cron -> email-dispatch Edge Function'
   );

   select vault.create_secret(
     'https://<project-ref>.supabase.co',
     'tae_email_project_url',
     'Base URL used by the tae-email-dispatch Cron job'
   );
   ```

   *If `extensions.gen_random_bytes` is not found, use `gen_random_bytes(32)`.
   If a name already exists, do not create another — reuse it.*
2. Show the cron secret once, to copy it:

   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'tae_email_cron_secret';
   ```

3. Dashboard → Edge Functions → Secrets → **Add new secret**:

   | Name | Value |
   | --- | --- |
   | `EMAIL_CRON_SECRET` | the 64-character value from 2. |

   Don't paste it anywhere else; don't commit it.

**Check:** `select name from vault.secrets where name like 'tae_email_%';`
returns both names, and `EMAIL_CRON_SECRET` is listed under Edge Function
secrets. The unauthenticated `curl` to `email-dispatch` from step 3 now
returns **401**.

---

## Step 6 — Enable Cron (only after step 4 succeeded)

1. Dashboard → **Integrations → Cron** → enable (installs `pg_cron`).
   Dashboard → **Database → Extensions** → enable **`pg_net`** if it is off.
2. *(Recommended for the first switch-on)* If a 9:00 / 1:00 / 5:00 slot is
   less than 30 minutes away or just passed, the first run will send that
   digest — that is expected behaviour.
3. **SQL Editor**: paste and run the whole file
   [`supabase/migrations/20261026000004_email_cron.sql`](supabase/migrations/20261026000004_email_cron.sql).
   It refuses to run if either Vault secret is missing, then creates (or
   replaces) a single job:

   | Job | Schedule | Action |
   | --- | --- | --- |
   | `tae-email-dispatch` | `*/5 * * * *` | `POST /functions/v1/email-dispatch` with `x-cron-secret` read from Vault |

   The job text contains no secrets.

**Check** (wait 5–10 minutes):

```sql
select jobname, schedule, active from cron.job where jobname = 'tae-email-dispatch';

select status, return_message, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'tae-email-dispatch')
order by start_time desc limit 5;

select status_code, left(content, 300) as body, created
from net._http_response order by created desc limit 5;
```

→ job active; runs *succeeded*; HTTP **200** with a body like
`{"ok":true,"queued":0,"sent":0,"failed":0,"skipped":0,...}`.
`401` = `EMAIL_CRON_SECRET` ≠ Vault value. `500` = the body names the
configuration problem.

Emergency stop (normally use **Pause All Reminders** instead):
`select cron.unschedule('tae-email-dispatch');`

---

## Step 7 — Verify scheduled sending

1. **Email Reminders → Progress digest schedule**: make sure today's weekday
   is selected, then **Add time** ~10–15 minutes from now (Toronto time,
   5-minute steps).
2. Within ~5 minutes after that time, every active recipient with *Digest*
   ticked receives **one** digest. History: kind *Digest*, *Sent*.
3. **Change the time without redeploying:** edit that time to ~10 minutes
   later → it sends again at the new time (a new slot). Then remove the test
   time.
4. **No duplicates** — must return no rows:

   ```sql
   select recipient_email, scheduled_for, count(*)
   from public.email_delivery_logs where kind = 'digest'
   group by 1, 2 having count(*) > 1;
   ```

5. **Pause:** click **Pause All Reminders**, add a time ~10 minutes ahead, wait
   past it → nothing is sent. **Resume reminders**, remove the test time.
6. **Notifications** (optional): **Notification preferences** → tick *Ready
   for Review notifications* → move a post to *Ready for Review* → within
   ~2–7 minutes recipients with *Workflow* ticked get one email. Editing a
   caption sends nothing.
7. The real 9:00 / 1:00 / 5:00 digests arrive on the next weekday.

---

## Step 8 — Test recipient management and delivery history

1. **Add** a recipient → appears with Digest ✓, Workflow ✓, Assignments ✗.
   Adding the same address again is refused; an invalid address is refused.
2. **Disable** it → shown struck through; it is excluded from scheduled sends
   and from **Send Test Email**. **Enable** it again.
3. Untick **Digest** for a recipient → the next scheduled digest skips them.
4. **Link a designer:** **Edit** the designer's recipient → *Designer name on
   posts* = the designer name exactly as typed on posts (suggestions are
   offered) → **Save**. The panel no longer lists that designer under
   *Designers on posts without a linked address*. Linking the same designer
   to two addresses is refused.
5. *(With assignment notifications on)* assign that designer to a post → only
   the linked address receives the assignment email. Assign a designer with
   no link → only recipients with **Assignments** ticked are emailed (nobody,
   if none are ticked).
6. **Remove** a recipient → confirmation dialog → removed; their history rows
   remain.
7. **Email history:** status filter (*Sent*, *Failed*, *Queued*, *Sending*,
   *Skipped*) and **Refresh** work; failures show the error text and, if
   retrying, the next attempt time.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Page: *"Email reminders are not set up yet"* | Step 2 not done, or run `notify pgrst, 'reload schema';`. |
| Test: *"Could not reach the email-send-test function"* | Not deployed, or deployed to another project. |
| Test: *The Edge Function secret "RESEND_API_KEY" is not set* | The Resend key has another name → set `RESEND_API_KEY_SECRET_NAME` (step 3.1). Redeploy if it persists. |
| Test: *No server-side Supabase key is available* | Supabase did not inject a server key; check Project Settings → API Keys and the function's default secrets. |
| History: *Resend rejected the API key or sender domain (401/403)* | Key revoked / from another Resend account, or `EMAIL_FROM` not on `mail.portal-torontoacademy.ca`. |
| History: *Resend error (422)* | Invalid recipient or sender format. Not retried. |
| History: *Resend rate limit (429)* | Retried automatically; raise `RESEND_MIN_INTERVAL_MS` if frequent. |
| History: *Queued* that never sends | Cron not running (step 6), or reminders paused. |
| History: *Expired before it could be delivered* | Cron was down long enough that the email became stale. |
| `net._http_response` 401 / 404 | 401: secret mismatch. 404: wrong `tae_email_project_url` (fix with `vault.update_secret`) or function not deployed. |
| Cron SQL: *Vault secret … is missing* / *schema "cron" does not exist* | Do step 5 / enable Cron (step 6.1). |

Function logs: Dashboard → Edge Functions → *function* → **Logs**. The Resend
key and service key are never logged or returned.

---

## Production checklist

- [ ] Resend secret name confirmed; `RESEND_API_KEY_SECRET_NAME` added only if needed.
- [ ] `mail.portal-torontoacademy.ca` **Verified** in Resend (SPF/DKIM; DMARC recommended).
- [ ] Migration `…000003` applied; `verify_email_rls.sql` all PASS.
- [ ] Both functions deployed, JWT verification off; unauthenticated calls return 401.
- [ ] Test emails received by office and designer.
- [ ] Vault `tae_email_cron_secret` + `tae_email_project_url`; Edge secret `EMAIL_CRON_SECRET`.
- [ ] Cron migration `…000004` applied; `net._http_response` shows 200s.
- [ ] Scheduled digest received once per slot; pause verified.
- [ ] Designers linked to their confirmed addresses; *Application link* set to the deployed `https://` URL.
- [ ] Resend plan covers: recipients × digest times × weekdays (+ notifications).
