# Supabase Setup — TAE Social Media Manager (Feature 2)

This guide sets up the shared Supabase backend: database tables, Row Level
Security, the private artwork bucket, email/password sign-in and the first
admin account. Everything can be done in the Supabase dashboard; the Supabase
CLI is **not** required.

Estimated time: 15 minutes.

---

## 0. What gets created

| Object | Purpose |
| --- | --- |
| `public.team_members` | Authorized TAE staff (`admin` or `member`). Only users listed here can see or change anything. |
| `public.posts` | Every post field from Feature 1 (title, date, program, platforms, format, status, caption, creative wording, design brief, reel script, designer, notes, artwork reference, published URL, timestamps) plus a `version` counter for conflict detection and `legacy_id` for safe imports. |
| `public.post_assets` | One row per uploaded artwork image (storage path, file name, type, size, carousel order). |
| Storage bucket `social-media-assets` | **Private** bucket for artwork images (JPG/PNG/WebP/GIF, max 10 MB each). |
| `is_team_member()`, `is_team_admin()` | Helper functions used by every RLS policy. |

There is no public access of any kind: anonymous visitors and signed-in users
who are not in `team_members` get nothing.

---

## 1. Project and environment variables

1. Open your project at <https://supabase.com/dashboard>.
2. Go to **Project Settings → API Keys** and copy the **Publishable key**
   (starts with `sb_publishable_…`). If your project only shows legacy keys,
   use the **anon / public** key instead.
3. Go to **Project Settings → Data API** (or the project's **Connect** dialog)
   and copy the **Project URL** (`https://<project-ref>.supabase.co`).
4. In the project folder, copy `.env.example` to `.env.local` and fill in:

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

> **Never** put the `sb_secret_…` key or the legacy `service_role` key in
> `.env.local` or any `VITE_` variable — Vite publishes every `VITE_` value in
> the browser bundle. The app refuses to start if it detects a secret key.
> `.env.local` is git-ignored; do not commit it.

Restart `npm run dev` after changing `.env.local`.

---

## 2. Authentication settings

In **Authentication → Sign In / Providers** (older dashboards: **Authentication → Providers** and **Authentication → Settings**):

1. **Email** provider: **enabled**.
2. **Allow new users to sign up**: **OFF**. *(Required — the app has no
   registration screen, and this stops anyone from creating an account through
   the API. Even if someone did, they would see nothing without a
   `team_members` row.)*
3. **Confirm email**: may stay on. Accounts are created by an admin with
   *Auto Confirm User* checked, so no email is ever sent.
4. Optional but recommended — **Authentication → Policies / Passwords**: set a
   minimum password length of at least 10 characters.

No email templates, SMTP or Resend configuration is needed for this feature.

---

## 3. Run the SQL migrations

The migrations are in [`supabase/migrations/`](supabase/migrations). Run them
**in order** in **SQL Editor → New query**: open each file, copy its entire
contents into the editor, and click **Run**.

1. `20261026000001_team_and_posts.sql` — tables, triggers, helper functions, RLS policies and grants.
2. `20261026000002_artwork_storage.sql` — the private `social-media-assets` bucket and its storage policies.

Each should finish with *"Success. No rows returned."* Both files are safe to
re-run (they use `if not exists` / `drop policy if exists`).

Check the result:

- **Table Editor**: `posts`, `post_assets` and `team_members` exist, each
  labelled **RLS enabled**.
- **Storage**: bucket `social-media-assets` exists and is **not** marked Public.
- **Storage → Policies** (bucket `social-media-assets`): three policies —
  *Team members can view artwork*, *Team members can upload artwork*,
  *Team members can delete artwork*.

### What the policies allow

| Table / object | Select | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| `posts` | team members | team members (rows with `legacy_id`, i.e. imports, **admins only**) | team members | team members |
| `post_assets` | team members | team members | team members (reorder) | team members |
| `team_members` | own row, or team members | admins | admins | admins (last admin cannot be removed) |
| `storage.objects` in `social-media-assets` | team members | team members, only into `posts/<existing post id>/` | *nobody* (no overwrites) | team members |
| anything, as anonymous (`anon`) | ✗ | ✗ | ✗ | ✗ |

> **Feature 4:** posts, artwork and storage writes are now split between
> admins and designers (designers: own posts only, no create/delete/approve).
> See [DESIGNER_SETUP.md](DESIGNER_SETUP.md) and README → Feature 4.

Server-side triggers also keep `version`, `updated_at`, `updated_by`,
`created_at` and `created_by` trustworthy — the browser cannot fake them.

---

## 4. Create the first admin

1. **Authentication → Users → Add user → Create new user**.
2. Enter the admin's email and a strong password. **Tick "Auto Confirm User".**
   Click **Create user**.
3. In **SQL Editor**, run (replace the email and name):

   ```sql
   insert into public.team_members (user_id, email, display_name, role)
   select id, email, 'Admin Name', 'admin'
   from auth.users
   where email = 'admin@example.com';
   ```

   It should report **1 row** inserted. If it reports 0, the email does not
   match the user you created.

The admin can now sign in to the app.

### Add more team members

Repeat step 1–2 for each person, then:

```sql
insert into public.team_members (user_id, email, display_name, role)
select id, email, 'Designer Name', 'designer'   -- or 'admin'
from auth.users
where email = 'person@example.com';
```

Other useful commands:

```sql
-- See the team
select email, display_name, role, created_at from public.team_members order by created_at;

-- Promote / demote
update public.team_members set role = 'admin'  where email = 'person@example.com';
update public.team_members set role = 'designer' where email = 'person@example.com';

-- Disable / re-enable access without deleting (Feature 4)
update public.team_members set active = false where email = 'person@example.com';

-- Remove access (their posts stay; they can no longer sign in to the content)
delete from public.team_members where email = 'person@example.com';
```

To remove the account entirely, also delete the user in **Authentication → Users**.

### Resetting a password (without sending email)

Supabase's "Send password recovery" sends an email, which is out of scope for
this feature. Instead, an admin can set a new temporary password in the SQL
Editor and share it securely:

```sql
update auth.users
set encrypted_password = extensions.crypt('New-Temporary-Password-123', extensions.gen_salt('bf'))
where email = 'person@example.com';
```

---

## 5. Verify that unauthorized access is denied

1. Make sure step 4 is done (the script needs at least one admin).
2. In **SQL Editor**, paste and run [`supabase/tests/verify_rls.sql`](supabase/tests/verify_rls.sql).
3. Open the **Results/Notices** output. You should see only `PASS` lines, e.g.:

   ```
   PASS: anonymous visitor is denied access to posts
   PASS: anonymous visitor is denied access to team members
   PASS: anonymous visitor sees no artwork files
   PASS: non-member sees no posts
   PASS: non-member sees no artwork records
   PASS: non-member sees no artwork files
   PASS: non-member cannot create posts
   PASS: non-member cannot add themselves to the team
   PASS: admin can read posts (0 currently stored)
   ```

   Any problem stops the script with an error starting with `FAIL`. The script
   runs in a transaction that is rolled back, so it never changes data.

Optional check from a terminal, as an anonymous visitor (expects an error such
as `permission denied` / HTTP 401, never post data):

```bash
curl "https://<project-ref>.supabase.co/rest/v1/posts?select=*" \
  -H "apikey: <your publishable key>"
```

---

## 6. Run and test the app

```bash
npm install
npm run dev
```

### Sign-in and access

- [ ] Opening the app shows the **Sign in** screen (no sign-up option).
- [ ] A wrong password shows *"Incorrect email or password."*
- [ ] The admin signs in and sees the dashboard. Refreshing the page keeps them signed in.
- [ ] A user created in Authentication but **not** added to `team_members` sees *"Access not granted"* and no content.
- [ ] **Avatar menu → Sign out** returns to the sign-in screen.

### Shared posts

- [ ] Create a post → it appears in Calendar, All Posts and Next Up; the header shows *Saving…* then *All changes saved*.
- [ ] Refresh the browser → the post is still there.
- [ ] Sign in as another member in a different browser → the same post is visible.
- [ ] Change a workflow status from All Posts / Work Queue / Next Up → persists after refresh; dashboard statistics update.
- [ ] Filters (program, status, platform), duplicate and delete all work.
- [ ] Caption, Creative Wording, Design Brief and (for Reels) Reel Script are saved and reloaded exactly.

### Concurrent edits

1. Open the same post in the editor in two browsers (A and B).
2. Change the caption in A and save.
3. Change something in B and click **Save changes** → B is **not** saved; a
   notice explains another member changed the post, offering *Discard mine &
   load their version* or *Overwrite with my version*. Nothing is overwritten
   without that explicit choice.
4. Returning to a tab after 30 s refreshes the shared list automatically; the
   avatar menu also has **Refresh posts**.

### Artwork

- [ ] New post: **Choose images** in *Uploaded artwork*, pick several files → previews appear; they upload when you click **Create post**.
- [ ] Existing post: **Upload images** uploads immediately; *Uploading 1 of 3…* is shown.
- [ ] For a Carousel, tiles are labelled *Slide 1, Slide 2…*; the ‹ › arrows reorder them and the order persists after refresh.
- [ ] Clicking a thumbnail opens the full image (a signed link that expires after 1 hour).
- [ ] **Remove** asks for confirmation and deletes the file from storage.
- [ ] A PDF, SVG or a file over 10 MB is rejected with a clear message.
- [ ] The *Artwork URL or reference* text field (Canva/Drive link) still works as before.
- [ ] In **Storage → social-media-assets**, files appear under `posts/<post id>/`. Opening the bucket's public URL for a file returns an error (bucket is private).

### One-time import of browser posts (admin only)

Posts created with Feature 1 live in the browser's localStorage. To move them:

1. Sign in **as an admin in the same browser** that was used with Feature 1.
2. **Avatar menu → Import posts from this browser…**
3. Review the preview: how many posts are saved in this browser, how many are
   new, how many were already imported, and how many match an existing post's
   title and date (skipped unless you tick the box).
4. Click **Import N posts**.

Guarantees:

- Nothing in Supabase is updated or overwritten — only new rows are inserted.
- Running the import again skips posts already imported (matched by their
  original ID), so it never creates duplicates of the same browser post.
- localStorage is **not** erased.
- Nothing is imported automatically, and no sample posts are seeded for new
  users. Members (non-admins) do not see the import option, and the database
  rejects imports from non-admins.
- Uploaded artwork did not exist in Feature 1; the text *artwork reference* of
  each post is imported as-is.

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| *"Supabase setup required"* screen | `.env.local` is missing or incomplete; restart `npm run dev` after editing it. |
| *"…contains a secret (service role) key"* | You used the secret key. Replace it with the publishable key, then **rotate** the secret key in Project Settings → API Keys. |
| *"Could not check your access"* with *"Could not find the table"* | Migration 1 has not been run. Run it, then run `notify pgrst, 'reload schema';` in the SQL Editor. |
| *"Access not granted"* | The user has no `team_members` row (step 4), or the email in the insert did not match. |
| *"Incorrect email or password"* for a new user | The user was created without *Auto Confirm User*. Open the user in Authentication → Users and confirm them, or recreate them. |
| Uploads fail with a permission error | Migration 2 has not been run, or the bucket name differs from `social-media-assets`. |
| *"You do not have permission to do this"* during import | Only `admin` members can import. |
