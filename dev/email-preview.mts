// Renders every email template with sample data to dev/email-preview/*.html
// so the branding can be reviewed in a browser. Nothing is sent.
// Run with: npm run email:preview
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDeadlineEmail, buildDigest, buildNotificationEmail, type NotificationItem } from '../supabase/functions/_shared/emails.ts'
import { logoUrl, safeAppUrl } from '../supabase/functions/_shared/layout.ts'
import type { NotificationEventRow, PostRow } from '../supabase/functions/_shared/model.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(root, 'email-preview')
const appUrl = safeAppUrl('https://taesocialmedia.vercel.app')
const today = new Date().toISOString().slice(0, 10)
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

const post = (o: Partial<PostRow>): PostRow => ({
  id: crypto.randomUUID(),
  title: 'Sample post',
  program: 'General TAE Marketing',
  publish_date: day(3),
  status: 'Planned',
  designer: 'Anna Designer',
  designer_id: 'd1',
  review_note: '',
  changes_requested_at: null,
  platforms: ['Instagram', 'Facebook'],
  updated_at: new Date().toISOString(),
  ...o,
})

const posts: PostRow[] = [
  post({ title: 'PSW Information Session Reminder', program: 'Personal Support Worker (PSW)', publish_date: day(-3), status: 'In Design', designer: 'Ben Designer' }),
  post({ title: 'Pharmacy Assistant Intake Announcement', program: 'Pharmacy Assistant Certificate', publish_date: today, status: 'Approved' }),
  post({ title: 'Dental Admin — Career Paths Story', program: 'Dental Admin Assistant Certificate', publish_date: day(4), designer: '', designer_id: null }),
  post({ title: 'Medical Office Assistant — Student Spotlight', program: 'Medical Office Assistant Diploma (MOA)', publish_date: day(5), status: 'Ready for Review' }),
  post({ title: 'November Open House', publish_date: day(9), status: 'Approved', platforms: ['Facebook', 'Instagram', 'LinkedIn'] }),
  post({ title: 'Back-to-School Campus Tour', publish_date: day(-4), status: 'Published' }),
]

const event = (type: NotificationEventRow['event_type'], p: PostRow): NotificationItem => ({
  event: { id: 1, post_id: p.id, event_type: type, details: { designer_id: p.designer_id, changes_requested_at: p.changes_requested_at }, actor: null, created_at: '' },
  post: p,
})
const changes = post({ title: 'Windmill Financing Explainer Reel', program: 'Windmill Financing', status: 'In Design', changes_requested_at: new Date().toISOString(), review_note: 'Please use the updated Windmill logo and shorten the opening hook to under 3 seconds.' })

const emails = {
  'digest': buildDigest({ posts, today, slotLabel: '9:00 a.m.', appUrl, now: new Date() }),
  'test-digest': buildDigest({ posts, today, slotLabel: '5:00 p.m.', appUrl, test: true, now: new Date() }),
  'assignment': buildNotificationEmail([event('assignment', post({ title: 'Holiday Office Hours' }))], today, appUrl),
  'ready-for-review': buildNotificationEmail([event('ready_for_review', posts[3])], today, appUrl),
  'approved': buildNotificationEmail([event('approved', posts[1])], today, appUrl),
  'changes-requested': buildNotificationEmail([event('changes_requested', changes)], today, appUrl),
  'grouped-notifications': buildNotificationEmail([event('ready_for_review', posts[3]), event('changes_requested', changes), event('approved', posts[4])], today, appUrl),
  'deadline': buildDeadlineEmail(posts.filter((p) => p.status !== 'Published' && p.publish_date <= day(2)), today, 2, appUrl),
  'no-app-url': buildDeadlineEmail(posts.slice(0, 2), today, 2, null),
}

mkdirSync(out, { recursive: true })
// The logo is served by the deployed app; point previews at the local copy.
const remoteLogo = logoUrl(appUrl) ?? ''
const localLogo = path.relative(out, path.join(root, '..', 'public', 'logo_final_T.png')).replaceAll('\\', '/')
const index: string[] = []
for (const [name, email] of Object.entries(emails)) {
  writeFileSync(path.join(out, `${name}.html`), email.html.replaceAll(remoteLogo, localLogo))
  writeFileSync(path.join(out, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`)
  index.push(`<li><a href="${name}.html">${name}</a> — ${email.subject.replace(/</g, '&lt;')}</li>`)
}
writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><ul style="font-family:sans-serif;line-height:2">${index.join('')}</ul>`)
console.log(`Wrote ${Object.keys(emails).length} previews to ${out}`)
