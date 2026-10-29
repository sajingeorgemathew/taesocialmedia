# Feature 6 — Modern SaaS Email Branding (Presentation-Only)

Redesign of the HTML of every operational email so it matches the modern app.
Notification behaviour is frozen: who receives what, when, and through which
code path is unchanged. Only the HTML markup produced by the template helpers
changes. Subjects and plain-text bodies stay byte-for-byte identical.

## 1. Allowed files

| File | Allowed change |
| --- | --- |
| `supabase/functions/_shared/layout.ts` | Shared email shell: header, CTA, footer, cards, badges. Presentation only. |
| `supabase/functions/_shared/emails.ts` | Only the HTML fragment helpers (`postCard`, `reviewNoteRow`, summary tiles, event label row) and the presentational options passed to `renderLayout`. No change to subjects, text bodies, filters, counts, `stillRelevant`, `nextAction`, `deadlinePosts`. |
| `dev/email-preview.mts` | Local preview generator (writes HTML files, sends nothing). |
| `supabase/tests/email_templates.test.ts` | Template assertions for the new markup. |
| `supabase/tests/email_samples.ts`, `supabase/tests/email_snapshot.test.ts`, `supabase/tests/snapshots/*` | New: deterministic samples and the subject/text snapshot. |
| `package.json` | `test:email` script only: add the snapshot test file. |
| `EMAIL_BRANDING.md` | This document. |

## 2. Frozen files (must show no diff)

`email-dispatch/index.ts`, `email-send-test/index.ts`, `_shared/routing.ts`,
`_shared/delivery.ts`, `_shared/resend.ts`, `_shared/db.ts`, `_shared/config.ts`,
`_shared/slots.ts`, `_shared/time.ts`, `_shared/http.ts`, `_shared/model.ts`,
`supabase/migrations/*`, `supabase/tests/email_routing.test.ts`, `src/**`,
`public/**` (including `favicon.png` and `logo_final_T.png`), `index.html`.

## 3. Email inventory (baseline)

All emails are rendered by three builders in `_shared/emails.ts` and wrapped by
`renderLayout` in `_shared/layout.ts`:

| Email | Builder | Sent by |
| --- | --- | --- |
| Daily progress digest | `buildDigest` | `email-dispatch` (digest slots) |
| Test email | `buildDigest({ test: true })` | `email-send-test` |
| Designer assigned | `buildNotificationEmail` (`assignment`) | `email-dispatch` (grouped notifications) |
| Ready for review | `buildNotificationEmail` (`ready_for_review`) | `email-dispatch` |
| Approved | `buildNotificationEmail` (`approved`) | `email-dispatch` |
| Changes requested (+ revision note) | `buildNotificationEmail` (`changes_requested`) | `email-dispatch` |
| Grouped workflow updates | `buildNotificationEmail` (several events) | `email-dispatch` |
| Publishing deadline reminder | `buildDeadlineEmail` | `email-dispatch` (deadline slots) |

Baseline on `main` @ 7090d6b: `npm run test:email` — 22 tests, 22 pass.
The subject/text snapshot (`supabase/tests/snapshots/email_text.json`) was
generated from this baseline before any template change.

## 4. Branding assets

| Asset | Format | Use in email |
| --- | --- | --- |
| `public/favicon.png` | PNG 218×218 RGBA, 6.9 KB | Header brand icon, shown at 36×36 beside "TAE Social Media Manager" |
| `public/logo_final_T.png` | PNG 218×218 RGBA, 6.9 KB | Byte-identical to `favicon.png` (same MD5), so it is not repeated |

Both are PNG (no `.ico`/SVG conversion needed) and are served publicly at
`<app_url>/favicon.png` and `<app_url>/logo_final_T.png`
(verified: `https://social.torontoacademy.ca/favicon.png` → 200 `image/png`).
The icon URL is derived from the configured `app_url` setting (Email Reminders
page), the same value used for the header link and the main button; nothing is
hard-coded per template. Without an `app_url` the header shows a text mark and
no links or images.
