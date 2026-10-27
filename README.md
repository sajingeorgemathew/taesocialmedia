
## Feature 1 Refinements — Before GitHub Push

### 1. Post Editor Modal Scrolling

Improve the existing editor modal without changing its visual design.

Requirements:
- The editor modal must have its own vertical scrolling area.
- The scrollbar must appear along the modal's right edge.
- The background dashboard must not scroll while the modal is open.
- Modal header and footer action buttons remain visible.
- The form content scrolls independently.
- Support mouse wheel, trackpad, touch and keyboard scrolling.
- Restore normal page scrolling when the modal closes.
- Work correctly on desktop and mobile.
- Preserve unsaved-changes warnings and existing modal functionality.

### 2. Separate Social Media Caption and Creative Wording

The editor must have three clearly labelled sections:

A. Social Media Caption
- Text appearing below the published post.
- Supports multiline content, hashtags and calls to action.

B. Creative Wording / On-Design Text
- Exact text to appear within the visual creative.
- Supports multiline text.
- For carousels, supports slide-by-slide wording.
- For stories, supports headline, supporting text and CTA.
- Drafts can be saved with this field empty.

C. Design Brief / Visual Instructions
- Existing design brief field.
- Visual layout, photography, colours, branding and instructions.
- Keep this separate from the actual creative wording.

### 3. Content Formats

Supported formats:
- Static Photo
- Carousel
- Story
- Reel

Do not provide a separate Video format at this stage.

If existing saved posts use Video, migrate them safely to Reel without deleting post data.

For Reel:
- Display an additional optional Reel Script / Scene Instructions field.
- Allow scenes, voiceover and on-screen text instructions.

For Carousel:
- Allow slide-by-slide content inside Creative Wording.
- A structured slide builder is not required yet.

### 4. Data Compatibility

- Preserve all existing posts and localStorage data.
- Existing posts should remain editable.
- New fields should use safe empty defaults.
- Do not reset saved statuses or seeded content.
- Keep storage architecture ready for future Supabase integration.

### 5. Acceptance Criteria

- Modal scrolls independently from dashboard.
- Modal header and footer remain visible.
- Background scrolling is disabled while modal is open.
- Caption, Creative Wording and Design Brief are separate.
- Reel-specific script field appears for Reel posts.
- Static Photo, Carousel, Story and Reel formats work.
- Existing posts and their data remain intact.
- All new fields persist after refresh.
- npm run lint passes.
- npm run build passes.


# Feature 2 — Supabase Backend Integration

## Objective

Connect the existing TAE Social Media Manager to Supabase so that authorized staff can access and manage the same social media content from different devices.

Preserve the current user interface and existing functionality.

## 1. Supabase Client

Use @supabase/supabase-js.

Environment variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Never expose Supabase secret keys in frontend code.

## 2. Authentication

Implement Supabase Auth using email and password.

Requirements:
- Login screen
- Persistent user session
- Logout
- Loading and error states
- Protected application routes
- Only authorized TAE members can access content
- No public self-registration

Support an initial admin account and additional team members.

## 3. Database

Create SQL migrations for the required tables.

Posts must preserve every existing field:
- ID
- Title
- Publishing date
- Program/campaign
- Platforms
- Content format
- Workflow status
- Social media caption
- Creative wording/on-design text
- Design brief
- Reel script
- Assigned designer
- Internal notes
- Artwork reference
- Published URL
- Created/updated timestamps

Use PostgreSQL DATE for scheduled publishing dates.

Create a simple team membership structure for
authorized users.

## 4. Database Security

Enable Row Level Security.

Requirements:
- No public access to posts
- Only authorized team members can read/write
- Membership-based permissions
- No client-side secret keys
- Document how to create the initial admin user
- Verify unauthorized access is denied

## 5. Supabase Storage

Create a private storage bucket:

social-media-assets

Support:
- Uploading image artwork
- Multiple images for carousels
- Previewing uploaded artwork
- Removing assets
- Storing file paths in the database

Use authenticated access and signed URLs where needed.

Limit uploads to reasonable image types and sizes.

Do not implement video hosting yet.

## 6. Repository Integration

The application already has a repository abstraction.

Preserve the existing PostRepository interface and
implement SupabasePostRepository.

All views must continue working:
- Calendar
- All Posts
- Next Up
- Filters
- Post Editor
- Dashboard statistics
- Workflow status updates

## 7. Local Data Migration

Existing posts are stored in browser localStorage.

Provide a safe, explicit, one-time import for an admin.

Requirements:
- Preview number of posts before import
- Preserve existing data
- Avoid duplicates on repeated imports
- Do not overwrite Supabase posts unexpectedly
- Do not erase localStorage after import
- Do not automatically seed posts for every user

## 8. Collaboration

All authorized team members should see shared posts.

Requirements:
- Changes persist after browser refresh
- Changes appear when another user reloads
- Clear saving/loading/error feedback
- Prevent accidental loss of unsaved edits

Realtime updates are optional for this feature.
If implemented, handle conflicting edits safely.

## 9. Supabase Setup Documentation

Create SUPABASE_SETUP.md containing:
- Project setup
- Required environment variables
- SQL migration instructions
- Storage configuration
- Authentication configuration
- Initial admin setup
- Testing instructions

Prefer reproducible SQL migration files.

Do not require the Supabase CLI for basic setup;
allow migrations to be applied using Supabase SQL Editor.

## 10. Out of Scope

Do not implement:
- Resend email integration
- Email notifications
- Meta API publishing
- Automatic social media posting
- Complex role management
- Payment systems

## Acceptance Criteria

- Login works
- Unauthorized users cannot access content
- Posts save to Supabase
- Edits appear across devices
- Workflow statuses persist
- Artwork uploads successfully
- Carousel supports multiple artwork images
- Existing browser posts can be imported safely
- No existing content is lost
- npm run lint passes
- npm run build passes


# Feature 3 — Resend Email Reminders

## Objective

Build a configurable email reminder and progress reporting system for the TAE Social Media Manager.

Administrators must manage everything through the application without editing code or manually changing Cron schedules.

## Existing Infrastructure

- React + TypeScript + Vite
- Supabase Authentication
- Supabase PostgreSQL
- Supabase Storage
- Existing team_members with admin/member roles
- Existing social media posts and workflow statuses

## Email Provider

Provider: Resend
Verified domain: mail.portal-torontoacademy.ca
Sender: TAE Social Media Manager
Sender email: notifications@mail.portal-torontoacademy.ca

A dedicated Resend API key is already stored in this application's Supabase Edge Function Secrets.

Read the configured secret name. Do not create, delete, or replace existing keys.

Never expose Resend keys in browser code.

## 1. Email Reminder Settings

Create an Email Reminders page accessible only to administrators.

Allow administrators to:

- Add recipients by email address
- Remove and disable recipients
- Enable or pause scheduled reminders
- Choose days of the week
- Add multiple sending times per day
- Remove or disable individual sending times
- Send a test email
- View email delivery history

Default recipient:
office@torontoacademy.ca

Other recipients must be configurable through the UI.

## 2. Multiple Daily Schedules

Initial schedule:
- Monday through Friday
- 9:00 AM
- 1:00 PM
- 5:00 PM

Timezone: America/Toronto

All reminder times are editable.

Use one periodic Supabase Cron checker that reads the active times from the database.

Changing the schedule must not require redeploying code.

Handle daylight saving time correctly.

## 3. Progress Digest

Generate progress reports from live Supabase data.

Include summary counts for:
- Planned
- In Design
- Ready for Review
- Approved
- Published
- Overdue

Include sections for:
- Overdue unfinished posts
- Posts scheduled today
- Posts requiring design work
- Posts awaiting approval
- Upcoming scheduled posts
- Recently published posts

For each relevant post show:
- Title
- Program or campaign
- Publishing date
- Current status
- Assigned designer
- Next required action

Do not include large artwork attachments.

Provide a secure application link only when the deployed application URL is configured.

## 4. Notification Options

Support optional:
- Assignment notifications
- Ready for Review notifications
- Approval notifications
- Publishing deadline reminders

Avoid sending an email after every ordinary post edit.

Keep notification preferences separate from progress digest schedules.

## 5. Database

Create migrations for:
- email_recipients
- email_schedules
- email_settings
- email_delivery_logs

Use existing team membership authorization.

Enable Row Level Security.
Only administrators may edit reminder settings and recipients.

Never store API keys in application database tables.

## 6. Sending Backend

Use:
- Supabase Edge Functions
- Supabase Cron
- Resend API

Use separate authenticated paths for:
- Admin-triggered test emails
- Scheduled progress digest delivery

Do not create a publicly accessible, unrestricted email sending endpoint.

Use server-side credentials and validate authorization.

## 7. Delivery Protection

- Prevent duplicate scheduled emails
- Use atomic database claims or equivalent protection
- Use stable Resend idempotency keys
- Record delivery attempts and results
- Log Resend message IDs
- Handle retryable failures
- Respect provider sending limits
- Avoid emailing inactive recipients

## 8. User Interface

Follow the existing TAE dashboard design.

Add Email Reminders to the application navigation.

Include:
- Recipient management
- Reminder schedules
- Notification preferences
- Send Test Email
- Pause All Reminders
- Email history

Keep all settings usable on mobile.

## 9. Safety and Compatibility

Do not:
- Modify other TAE applications
- Reset existing Supabase tables
- Modify previously applied migrations
- Change Supabase authentication configuration
- Expose secret keys
- Remove existing calendar functionality

## 10. Documentation

Create RESEND_SETUP.md documenting:
- API secret name
- Required SQL migrations
- Edge Function deployment
- Cron configuration
- Test email procedure
- Delivery verification
- Troubleshooting
- Production deployment requirements

## Acceptance Criteria

- Office and designer addresses receive test emails
- Multiple reminder times work
- Times can be changed through the UI
- Current post statuses appear in digests
- Published posts are excluded from outstanding work
- No duplicate scheduled emails
- Pause prevents future scheduled sends
- History displays sending outcomes
- Admin authorization is enforced
- Existing application still works
- npm run lint passes
- npm run build passes


# Feature 4 — Designer Assignments & Role Permissions

## Objective

Give the office (admins) and designers separate, database-enforced permissions,
replace the free-text designer field with real designer accounts, and add a
clear review workflow (Approve / Request changes) — without changing the
working Feature 3 email queue, Cron schedule, Resend integration, delivery
logs, retries or digest behaviour.

Setup, migration order and the manual QA checklist: **DESIGNER_SETUP.md**.

## 1. Roles (public.team_members)

| | Admin | Designer |
| --- | --- | --- |
| See the calendar, all posts and artwork | ✓ | ✓ |
| Create, duplicate, delete posts | ✓ | ✗ |
| Edit title, date, program, platforms, format, published link | ✓ | ✗ |
| Edit caption, creative wording, design brief, reel script, notes, artwork link | ✓ | **any** unfinished post |
| Upload / reorder / remove artwork | ✓ | **any** unfinished post |
| Move status Planned ↔ In Design ↔ Ready for Review (submit / resubmit) | ✓ | **any** unfinished post |
| Approve, publish, request changes | ✓ | ✗ |
| Assign / reassign / unassign (incl. self-assign) | ✓ | ✗ |
| Edit Approved or Published posts | ✓ (and can reopen them) | ✗ — read-only until an admin reopens |
| Team accounts, email administration, import | ✓ | ✗ |

Designers collaborate: the assigned designer is the **primary
responsibility**, not exclusive edit access. "Unfinished" means Planned, In
Design or Ready for Review.

- Existing `member` accounts become `designer`.
- `team_members.active = false` disables an account everywhere (sign-in shows
  "Access not granted"; RLS denies everything). The last active admin cannot be
  disabled or removed.
- Enforced in the database: RLS on `posts`, `post_assets`, `storage.objects`,
  plus the `posts_workflow_rules` trigger for column- and status-level rules.
  The UI mirrors the rules (`src/utils/permissions.ts`) but is never the only
  protection.

## 2. Structured assignments

- `posts.designer_id` references `team_members.user_id`.
- `posts.designer` (text) is kept: it is the assigned designer's display name,
  maintained by the trigger, so digests, deadline emails and published history
  keep working. Unassigning clears it, except on Published posts.
- Admins choose from a dropdown of active designer accounts.
- Migration: an existing typed name is linked only when it matches exactly one
  active designer account (display name, account email, or the admin-confirmed
  Feature 3 "Designer name on posts" link). Ambiguous and unmatched names are
  reported, never guessed, and flagged in the app ("not linked") for an admin
  to assign. Published posts are left untouched. Re-run with
  `select * from public.link_legacy_designers();`.
- The office assigns the **primary designer**; other designers contribute
  without changing it. Designers cannot assign anyone, including themselves.
- Designers get a **My Assignments** filter (Changes requested, To do, Waiting
  for review, Approved). Every unfinished post stays editable from the
  calendar and lists.

## 3. Review workflow

1. Designer: **Submit for review** (status → Ready for Review). Office/Workflow
   recipients are emailed (unchanged behaviour).
2. Admin, in the post editor: **Approve** (→ Approved) or **Request changes**
   with a required note (→ In Design, note shown to the designer). Implemented
   by `request_post_changes()`; the change request is cleared automatically on
   resubmission, approval or publishing.

## 4. Email notifications

| Event | Recipients |
| --- | --- |
| Assigned / reassigned | The new primary designer's **account email**, plus a copy to recipients with *Assignments* ticked. Only when the assigned account actually changes. |
| Ready for Review (submitted by any designer) | Recipients with *Workflow* ticked (unchanged) |
| Approved | Recipients with *Workflow* ticked + the primary designer |
| Changes requested (new toggle, on by default) | The primary designer; if the post has no (active) primary designer, recipients with *Assignments* ticked |

Same queue, 2-minute grouping, 5-minute Cron, dedupe keys, Resend idempotency,
retries and delivery log as Feature 3. Designer addresses are delivered only
while the account is active.

## Out of scope

- Creating/inviting accounts from the app (accounts are still created in the
  Supabase dashboard — see DESIGNER_SETUP.md).
- Per-post deep links in emails.

## Acceptance Criteria

- Designers can edit and submit any unfinished post, but cannot approve,
  publish, create, delete, assign, change scheduling fields or edit
  Approved/Published posts — including through direct API calls
  (`supabase/tests/verify_designer_rls.sql`)
- Existing posts, published history, email settings and schedules are kept
- Assignment, approval and change-request emails reach the right addresses
  (`npm run test:email`)
- npm run lint passes
- npm run build passes
