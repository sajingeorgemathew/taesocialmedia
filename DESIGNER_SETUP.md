# Designer Assignments & Roles — Setup (Feature 4)

Step-by-step rollout for the **existing** TAE Social Media Manager Supabase
project. Do the steps **in order**. Nothing here touches the Cron job, Vault
secrets, the Resend key, auth settings or other TAE projects.

**You will need:** Supabase dashboard (admin), the project ref, Node.js (for
`npx supabase`), an app login with the `admin` role, and a test designer
account (step 6).

| Order | What | Why the order matters |
| --- | --- | --- |
| 1 | Backup + read-only pre-check | Lets you restore if anything looks wrong |
| 2 | SQL migration | Adds the columns the new code reads |
| 3 | RLS verification scripts | Proves permissions before anyone uses them |
| 4 | Redeploy both Edge Functions — **right after step 2** | The new functions read the new columns; old functions keep working on the new schema meanwhile |
| 5 | Merge and deploy the frontend | The old frontend's free-text designer field no longer saves |
| 6 | Designer accounts + linking legacy names | Assignments need accounts |
| 7 | Manual QA | — |

---

## Step 1 — Backup and pre-check (read-only)

1. Dashboard → **Database → Backups**: confirm a recent backup exists (or
   take one). This is the rollback path.
2. **SQL Editor**:

   ```sql
   select role, count(*) from public.team_members group by role;
   select designer, count(*) from public.posts
   where designer <> '' group by designer order by 2 desc;
   select to_regclass('public.email_settings') as feature3_installed;
   ```

   Note the roles (every `member` will become `designer`) and the typed
   designer names. `feature3_installed` must not be NULL.

## Step 2 — Apply the migration

1. Review
   [`supabase/migrations/20261027000001_designer_roles.sql`](supabase/migrations/20261027000001_designer_roles.sql).
   It only **adds**: the `designer` role and `active` flag, `posts.designer_id`
   and review columns, the `posts_workflow_rules` trigger, new RLS policies
   for posts/artwork/storage, `request_post_changes()`,
   `link_legacy_designers()`, the `changes_requested` notification type and
   the `notify_changes_requested` setting (on). Existing data is kept.
2. **SQL Editor → New query**, paste the **whole file**, **Run**.
3. The last result is the **legacy designer report**: one row per unfinished
   post with a typed designer name and its outcome — `linked`, `ambiguous…`
   or `no matching designer account…`. Nothing is guessed. If you have not
   created designer accounts yet, everything shows "no matching account";
   that is expected (step 6 re-runs it).
4. Run `notify pgrst, 'reload schema';`

The migration is safe to re-run. It sends no email and does not change
`updated_at` on linked posts.

## Step 3 — Verify permissions (rolled back, changes nothing)

Paste and run each in the SQL Editor; expect only `PASS` lines:

| Script | Checks |
| --- | --- |
| [`supabase/tests/verify_rls.sql`](supabase/tests/verify_rls.sql) | Feature 2: anonymous / non-member access (9) |
| [`supabase/tests/verify_email_rls.sql`](supabase/tests/verify_email_rls.sql) | Feature 3: email tables admin-only (16, or a `SKIP` if no designer exists yet) |
| [`supabase/tests/verify_designer_rls.sql`](supabase/tests/verify_designer_rls.sql) | Feature 4: designer vs admin, direct API calls, notification events (34; some `SKIP` if a notification type is off or reminders are paused) |

`verify_designer_rls.sql` creates temporary designer accounts and posts inside
a transaction and rolls everything back: no accounts or posts remain and no
email is sent. Any `FAIL` stops the script — report it before continuing.

## Step 4 — Redeploy the Edge Functions

Both functions share the updated routing and delivery code:

```bash
npx supabase functions deploy email-dispatch  --project-ref <project-ref> --no-verify-jwt
npx supabase functions deploy email-send-test --project-ref <project-ref> --no-verify-jwt
```

No secrets or Cron changes. Check: **Email Reminders → Send test email** still
arrives, and the next scheduled digest arrives as before.

## Step 5 — Deploy the frontend

Merge the PRs (Feature 3, then Feature 4) and deploy `main` as usual. Only
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are needed.

## Step 6 — Designer accounts and legacy names

1. **Authentication → Users → Add user → Create new user**: the designer's
   email and a strong password, **Auto Confirm User** ticked.
2. **SQL Editor** (replace email and name — the name is what appears on posts
   and in emails):

   ```sql
   insert into public.team_members (user_id, email, display_name, role)
   select id, email, 'Designer Name', 'designer'
   from auth.users where email = 'designer@example.com';
   ```

3. Link legacy typed names now that accounts exist, and review the report:

   ```sql
   select * from public.link_legacy_designers();
   ```

   For anything still `ambiguous` or `no matching designer account`, open the
   post in the app (it shows the name as "not linked") and choose the designer.

Useful commands:

```sql
-- The team
select email, display_name, role, active from public.team_members order by role, display_name;

-- Disable / re-enable an account (keeps their posts and history)
update public.team_members set active = false where email = 'designer@example.com';
update public.team_members set active = true  where email = 'designer@example.com';

-- Promote to admin / back to designer
update public.team_members set role = 'admin'    where email = 'person@example.com';
update public.team_members set role = 'designer' where email = 'person@example.com';
```

Prefer **disabling** over deleting: deleting a team member unassigns their
posts (published posts keep the name).

## Rollback

The migration is additive, but it replaces policies and trigger functions. To
roll back, restore the backup from step 1 (Dashboard → Database → Backups),
redeploy the previous Edge Functions, and deploy the previous frontend.

---

## Manual QA checklist

Use the office admin account, a test designer **A** and a second test designer
**B**. Watch **Email Reminders → Delivery history**; workflow emails arrive in
about 2–7 minutes.

**Migration and compatibility**
- [ ] Existing posts, dates, captions, artwork and published history unchanged.
- [ ] Linked legacy posts show the designer's account name; unmatched ones show "(not linked)" and the admin banner counts them.
- [ ] Digest and deadline reminders arrive at their usual times with designer names.
- [ ] Email Reminders page: recipients, schedules, toggles as before, plus *Changes requested notifications* (on).

**Admin**
- [ ] Can create, edit, duplicate and delete posts; "+ Add Post" visible.
- [ ] Designer dropdown lists only active designers; can assign, reassign and unassign.
- [ ] Assigning A emails **A's account address** (plus a copy to *Assignments* recipients). Saving again without changing the designer sends nothing.
- [ ] Reassigning A → B emails **B**.
- [ ] On a Ready for Review post: **Approve** → Approved; Workflow recipients **and** the designer are emailed.
- [ ] **Request changes** requires a note → post back to In Design with the note; the designer is emailed with the note.

**Designer A**
- [ ] Opens on **My Assignments**; sees the whole calendar; no "+ Add Post", Duplicate, Delete, Email Reminders or Import.
- [ ] Own post: can edit caption, wording, brief, reel script, notes, artwork link; upload/reorder/remove artwork.
- [ ] Own post: title, date, program, platforms, format and published link are read-only.
- [ ] Status controls offer only Planned / In Design / Ready for Review.
- [ ] **Submit for review** → office/Workflow recipients emailed; A is not.
- [ ] "Changes requested" section shows the note; **Resubmit for review** clears it.
- [ ] Approved own post is view-only.
- [ ] B's post is view-only ("View only — assigned to B"), no artwork controls.
- [ ] Unassigned post: **Take over** assigns it to A (office copy only; A not emailed).

**Direct API (optional, browser devtools as A)**
- [ ] `supabase.from('posts').update({status:'Approved'}).eq('id', <A's post>)` → error.
- [ ] `supabase.from('posts').update({caption:'x'}).eq('id', <B's post>)` → no rows changed.
- [ ] `supabase.from('posts').delete().eq('id', <A's post>)` → no rows deleted.

**Disabled account**
- [ ] Set A `active = false` → A sees "Access not granted"; A no longer receives designer emails. Re-enable afterwards.
