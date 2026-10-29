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

## 5. Design

One shared shell (`renderLayout`) for every email:

- **Header**: thin navy top rule, then the 36×36 brand icon (`favicon.png`, alt
  "TAE logo") beside "TAE Social Media Manager / Toronto Academy of Education".
  On the right is a small "Open Social Media Manager →" link. Below 600 px it
  stacks under the brand. The logo appears once only.
- **Body**: a small eyebrow label with a gold accent, then an `<h1>` heading and
  the description. Status-tinted summary tiles (digest) and section headings
  with count pills follow. Post cards show a status badge, the title, a
  Program / Publish date / Designer list and a shaded "Next:" footer.
  Revision notes appear in an amber "Requested changes" callout, with line
  breaks kept.
- **Main action**: a navy button, "Open Social Media Manager →", built as a
  table cell with `bgcolor` so it also works in Outlook.
- **Footer**: a gold rule, then "Toronto Academy of Education" and the existing
  recipient-preference sentence.
- **Email safety**: tables with `role="presentation"`, inline styles, system
  font stack (Segoe UI fallback for Outlook), an MSO 640 px wrapper, a
  preheader, `lang="en"` and light colour scheme. One small image with explicit
  size and alt text. No scripts, web fonts or external CSS.

The header link and main button both use the configured `app_url`. Without one,
the email has no links, no image and a text "T" mark.

## 6. Verification (feature/modern-email-branding)

| Check | Result |
| --- | --- |
| `npm run test:email` | 26 / 26 pass (routing 15 unchanged, templates 8, snapshot 3) |
| Subject + plain text of 18 sample emails vs pre-redesign snapshot | identical |
| `npm run lint` / `npm run build` / `npm test` | clean / built / 16 / 16 pass |
| Frozen files (§2) | `git diff main` empty |
| Previews (`npm run email:preview`) | 10 emails in `dev/email-preview/`, checked at 760 px and 375 px |
| `https://social.torontoacademy.ca/favicon.png` | 200, `image/png`, 6,898 bytes |

## 7. Deployment (requires approval)

Both functions import `_shared/`, so both must be redeployed for the new HTML
to take effect. Nothing else changes: no migrations, secrets, cron or settings.

```sh
supabase functions deploy email-dispatch
supabase functions deploy email-send-test
```

Check that the Email Reminders `app_url` setting is
`https://social.torontoacademy.ca`. Then send one **Send test email** from
the Email Reminders page and review it in Gmail (web + phone) and Outlook.

**Rollback:** check out the previous `main` commit (or `git revert` the merge)
and run the same two deploy commands. Email queues, logs and settings are not
affected either way.
