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

Filled in during Phase E — see "Regression results" below.

| # | Check | Result |
| --- | --- | --- |
| 1 | Office admin can sign in | |
| 2 | Designer can sign in | |
| 3 | Calendar loads existing posts | |
| 4 | Create, edit, duplicate, delete (admin) | |
| 5 | Month navigation, Today, filters, clear filters, ordering | |
| 6 | Designer selection and reassignment (admin) | |
| 7 | Designers edit content and artwork on any unfinished post | |
| 8 | Designers cannot change protected scheduling fields | |
| 9 | Designers cannot approve, publish, delete or reassign | |
| 10 | Artwork upload, removal, ordering | |
| 11 | Ready for Review submission | |
| 12 | Admin approval | |
| 13 | Request changes keeps revision notes | |
| 14 | Approved / Published locked for designers | |
| 15 | Post data and published history unchanged | |
| 16 | Email Reminders settings and Delivery History | |
| 17 | Email templates keep all dynamic content | |
| 18 | Mobile and desktop | |
| 19 | Keyboard and accessibility | |
| 20 | No new console errors | |
