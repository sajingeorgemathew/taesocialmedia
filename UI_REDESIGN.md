# Feature 5 — UI/UX Redesign: Audit, Plan and Preservation Checklist

Presentation-layer redesign of the TAE Social Media Manager. Business logic is
frozen: hooks (`usePosts`, `useTeam`, `useAuth`), repositories, `utils/`
(permissions, posts, date), `email/` repositories and every Supabase call are
unchanged. Components keep their props, handlers and data flow; only markup,
class names, icons and CSS change, plus a small presentational `ui/` kit.

## 1. Audit (baseline on `main` @ ace6494)

### Screens

The app has no URL routes. Screens are chosen by state:

| Screen | Where | Who |
| --- | --- | --- |
| Setup required | `main.tsx` → `SetupRequiredScreen` | anyone, when env vars are missing or a secret key is used |
| Loading / Sign in / Access not granted / Could not check access | `AuthGate` → `AuthScreens.tsx` | before sign-in |
| Content: My Assignments | `App` view `mine` | designers only (default view) |
| Content: Calendar (+ day agenda) | view `calendar` | everyone (admin default) |
| Content: All Posts | view `list` | everyone |
| Content: Next Up / Work Queue | view `queue` | everyone |
| Email Reminders | page `email` | admins only |
| Post editor (create / edit / read-only) | `PostEditor` modal | everyone; fields gated by role/status |
| Import posts from this browser | `ImportLocalPostsDialog` | admins only |
| Confirm dialogs | delete post, discard edits, remove artwork, remove recipient, remove time, pause reminders | — |

### Styling architecture (before)

Two global stylesheets (`index.css` tokens + base, `App.css` ~2,400 lines),
system font, no icons, no component library. The redesign replaces them with
`src/styles/*.css` (tokens, base, components, one file per area).

### Permission-sensitive controls (must stay gated exactly as before)

| Control | Shown / enabled for |
| --- | --- |
| New post (header, calendar day "+", day agenda "Add post") | admins |
| Duplicate / Delete (list rows, editor footer) | admins; Delete hidden when the open post was deleted by someone else |
| Email Reminders navigation and page | admins (`activePage` forced to `content` for designers) |
| Import posts from this browser | admins |
| My Assignments view | designers |
| Primary designer dropdown | admins; designers see read-only text |
| Title, date, program, platforms, format, published URL | editable by admins only (`locked`) |
| Caption, wording, brief, reel script, artwork URL, notes, artwork upload/reorder/remove | admins, designers on unfinished posts (`readOnly`) |
| Status choices (stepper, selects, advance buttons) | `statusOptions(member, post)` — designers: Planned / In Design / Ready for Review |
| Approve / Request changes panel | admins, on Ready for Review (Approve + Request changes) or Approved (Request changes) — disabled while the editor has unsaved edits or a conflict |
| Save button | hidden when read-only; disabled while saving or during a conflict |
| Unlinked designer banner | admins |

### Data-dependent behaviour to preserve

- Concurrency: editor conflict notices (`changed` → load theirs / overwrite;
  `deleted` → cannot save), toasts for conflicts in quick actions.
- Refresh on focus after 30 s; "today" rolls over at midnight.
- Unsaved-changes guard (discard confirm + `beforeunload`).
- After save: switch to content page, select the post's date and month.
- Staged artwork for new posts uploads after creation; partial failures toast.
- Artwork: immediate upload/remove/reorder, signed previews, 20 × 10 MB limit.
- Filters (program, status, platform) apply to calendar, list and queue; not to
  My Assignments. "Showing X of Y" and Clear filters.
- Sync indicator: Saving… / Refreshing… / Not synced / All changes saved.
- Email page: pause/resume with confirm, next digest time, recipients
  add/edit/enable/disable/remove + three flags, weekdays, times
  add/edit/toggle/remove (max 12), notification toggles, deadline window/time,
  app URL validation, test email with per-recipient results, delivery history
  with status filter and refresh (reloads after a test send).

## 2. Design plan

- **Tokens** (`styles/tokens.css`): navy scale from `#122C4F`, gold
  `#C9A24E` (logo, active-nav marker, focus accent only), warm neutral
  `#F7F5F0` canvas, white surfaces, neutral greys, status colours (Planned
  slate, In Design violet, Ready for Review amber, Approved teal, Published
  green), radii, shadows, spacing, Inter Variable (self-hosted, no external
  font requests).
- **Shell**: collapsible left sidebar (state remembered per browser), grouped
  navigation (Workspace / Administration), user card with role badge and
  account menu; on phones a top bar with a slide-in drawer. Page header with
  title, description, sync status and the primary action.
- **Dashboard** (new view `overview`, default for admins; designers keep My
  Assignments as default): stat cards, Next Up, awaiting review, changes
  requested, overdue, next 14 days, workflow pipeline — all derived with the
  existing `computeStats`, `getNextUp`, `isOverdue`, `sortByDate`.
- **Calendar**: month toolbar, cleaner grid, chips with status colour and
  platform marks, dots on phones, day agenda + Next Up in a side rail.
- **Lists**: table-style rows with icon actions (accessible names kept).
- **Editor**: wide dialog, two columns — sections (Post information, Platforms
  & format, Creative brief, Captions & scripts, Artwork & attachments,
  Publishing, Internal notes) with a section index, and a side panel (workflow
  status, primary designer, review). Sticky footer.
- **Feedback**: toast with icon, inline alerts, empty states, spinners.
- **Components** (`src/components/ui/`): `Icon` set, `EmptyState`,
  `PageHeader`, `PlatformMarks`, `Spinner`. Buttons/inputs stay class-based
  (`button button-primary`, `field`), matching the existing idiom.

### Known limitations / conflicts

- Approve stays a single click (no extra confirmation): adding one would
  change the review flow. Request changes keeps its required-note step.
- Email logo: loaded from `<app URL>/logo_final_T.png`. When the App URL
  setting is empty the email falls back to the text mark. Some clients block
  remote images until the reader allows them; alt text is provided.

## 3. Functionality-preservation checklist

Verified on `feature/modern-saas-ui` with `npm run dev:mock` (local demo data,
no Supabase or Resend calls) in Chrome at desktop (1568 px), tablet (820 px)
and phone (390 px) widths, plus automated tests. **Mock** = verified against
the local mock backend, which mirrors the database rules but is not the real
database; the database rules themselves are unchanged and were verified in
Feature 4 (`supabase/tests/*.sql`).

| # | Check | Result |
| --- | --- | --- |
| 1 | Office admin can sign in | Pass (mock sign-in form; wrong password shows the error) |
| 2 | Designer can sign in | Pass (mock); disabled account sees "Access not granted" |
| 3 | Calendar loads existing posts | Pass (mock) |
| 4 | Create, edit, duplicate, delete (admin) | Pass (mock): create with validation, duplicate opens the copy, delete via confirm dialog |
| 5 | Month navigation, Today, filters, clear filters, ordering | Pass (mock + unit test for date order) |
| 6 | Designer selection and reassignment (admin) | Pass (mock); dropdown offers only active designers (unit test) |
| 7 | Designers edit content and artwork on any unfinished post | Pass (mock + unit test on another designer's post) |
| 8 | Designers cannot change protected scheduling fields | Pass (unit test: read-only/disabled) |
| 9 | Designers cannot approve, publish, delete or reassign | Pass (unit tests + mock UI: no controls) |
| 10 | Artwork upload, removal, ordering | Pass (mock: upload, reorder, remove with confirm) |
| 11 | Ready for Review submission | Pass (mock: designer resubmits, change request clears) |
| 12 | Admin approval | Pass (unit test); single click as before |
| 13 | Request changes keeps revision notes | Pass (mock + unit test: note required, shown to designer) |
| 14 | Approved / Published locked for designers | Pass (mock + unit tests) |
| 15 | Post data and published history unchanged | No data model, query or repository changes (`git diff main` — see below). **Unverified against production data** (not touched by design). |
| 16 | Email Reminders settings and Delivery History | Pass (mock: toggles, test send, history refresh) |
| 17 | Email templates keep all dynamic content | Pass: subjects and plain-text bodies identical to `main` for the same input; 7 template tests |
| 18 | Mobile and desktop | Pass (sidebar drawer, phone calendar dots, bottom-sheet dialogs) |
| 19 | Keyboard and accessibility | Pass: focus rings, labelled icon buttons, dialogs keep focus handling, switches stay native checkboxes |
| 20 | No new console errors | Pass, with one dev-only React warning that also exists on `main` (see limitations) |

### Automated results

- `npm run lint` — clean
- `npm run build` — passes (existing >500 kB chunk warning remains)
- `npm test` — 16 / 16 (permissions, post editor admin/designer, post list, app navigation)
- `npm run test:email` — 22 / 22 (15 routing + 7 template)

### Git diff outside the presentation layer

`git diff main -- supabase/migrations supabase/functions src/hooks src/storage src/email src/auth/AuthProvider.tsx src/auth/authContext.ts src/team src/lib src/utils/permissions.ts src/utils/posts.ts`
shows only `supabase/functions/_shared/layout.ts` and the inline styles in
`_shared/emails.ts` (email presentation). `src/types.ts` gains the `overview`
view name; `App.tsx` adds the sidebar/collapse state and the dashboard view
around unchanged handlers.

## 4. Remaining issues and limitations

- **Approve has no confirmation dialog** (unchanged single click).
- **Dashboard is the admin landing page** (was Calendar). Designers still land
  on My Assignments. Saving a post still selects its date/month in the calendar.
- **Email logo** requires the frontend deploy (the file must exist at
  `<App URL>/logo_final_T.png`) and the *Application link* in Email Reminders to
  be set to `https://taesocialmedia.vercel.app`. Without it, emails use a text
  mark and no button — same as before. Some clients hide remote images until
  allowed.
- **Pre-existing:** React warns about duplicate keys when Duplicate opens the
  copy, because the editor and toast both use `Date.now()` keys (`main` too).
  Harmless; not changed to keep App logic frozen.
- **Pre-existing:** Escape does not close a dialog if focus left it (e.g.
  after an artwork button disables itself).
- The bundle grew ~40 kB (icons, font CSS); Inter font files load on demand.

## 5. Safe deployment

1. Review the branch; run `npm ci && npm run lint && npm test && npm run test:email && npm run build`.
2. Optional: `npm run dev:mock` (open `/?as=admin` or `/?as=designer`) and
   `npm run email:preview` (open `dev/email-preview/index.html`).
3. Push the branch, open a PR, check the Vercel **preview** with real sign-in
   (read-only browsing is enough; no data changes needed).
4. Merge → Vercel deploys the frontend. Confirm
   `https://taesocialmedia.vercel.app/logo_final_T.png` loads.
5. In Email Reminders → Application link, make sure it is
   `https://taesocialmedia.vercel.app` (admin setting, existing field).
6. Deploy the two Edge Functions **only after step 4** (presentation change;
   no schema, Cron or secret changes):
   `npx supabase functions deploy email-dispatch --project-ref cbkhuzoevsmhnjalivtd --no-verify-jwt --use-api`
   `npx supabase functions deploy email-send-test --project-ref cbkhuzoevsmhnjalivtd --no-verify-jwt --use-api`
7. Send one test email from Email Reminders to the office address and check
   the logo and button render; watch Delivery history.

Rollback: revert the merge in Vercel (instant), and redeploy the functions from
`main`'s previous commit if the email look must be reverted.
