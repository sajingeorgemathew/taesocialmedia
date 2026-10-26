
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
