# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

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
cla