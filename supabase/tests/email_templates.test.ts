// Content tests for the email templates (Feature 5 branding). The redesign
// changes presentation only: every dynamic field must still be rendered.
// Run with: npm run test:email
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDeadlineEmail, buildDigest, buildNotificationEmail, type NotificationItem } from '../functions/_shared/emails.ts'
import { brandIconUrl, safeAppUrl } from '../functions/_shared/layout.ts'
import type { NotificationEventRow, PostRow } from '../functions/_shared/model.ts'

const APP_URL = safeAppUrl('https://taesocialmedia.vercel.app')
const TODAY = '2026-10-27'

function post(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: 'p1',
    title: 'Intake announcement',
    program: 'Personal Support Worker (PSW)',
    publish_date: '2026-10-29',
    status: 'In Design',
    designer: 'Anna Designer',
    designer_id: 'd1',
    review_note: '',
    changes_requested_at: null,
    platforms: ['Instagram', 'Facebook'],
    updated_at: '2026-10-27T12:00:00Z',
    ...overrides,
  }
}

function item(type: NotificationEventRow['event_type'], p: PostRow, details: Record<string, unknown> = {}): NotificationItem {
  return { event: { id: 1, post_id: p.id, event_type: type, details, actor: null, created_at: '2026-10-27T12:00:00Z' }, post: p }
}

test('brand icon is served from the configured application URL', () => {
  assert.equal(brandIconUrl(APP_URL), 'https://taesocialmedia.vercel.app/favicon.png')
  assert.equal(brandIconUrl('https://social.torontoacademy.ca'), 'https://social.torontoacademy.ca/favicon.png')
  assert.equal(brandIconUrl('https://social.example.ca/app/'), 'https://social.example.ca/favicon.png')
  assert.equal(brandIconUrl(null), null)
})

test('header link and main button both open the configured application URL', () => {
  for (const email of [
    buildDigest({ posts: [post()], today: TODAY, slotLabel: '9:00 a.m.', appUrl: APP_URL, now: new Date() }),
    buildNotificationEmail([item('approved', post({ status: 'Approved' }))], TODAY, APP_URL),
    buildDeadlineEmail([post()], TODAY, 2, APP_URL),
  ]) {
    const links = [...email.html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)]
    assert.equal(links.length, 2)
    for (const [, href, label] of links) {
      assert.equal(href, 'https://taesocialmedia.vercel.app/')
      assert.ok(label.startsWith('Open Social Media Manager'))
    }
    // One image only: the brand icon, with explicit size and alt text.
    const images = [...email.html.matchAll(/<img [^>]*>/g)].map((m) => m[0])
    assert.equal(images.length, 1)
    assert.match(images[0], /src="https:\/\/taesocialmedia\.vercel\.app\/favicon\.png"/)
    assert.match(images[0], /width="36" height="36" alt="TAE logo"/)
    assert.ok(email.html.includes('Toronto Academy of Education'))
    assert.ok(!/<script|<link /i.test(email.html))
  }
})

test('digest keeps every section, count and post field', () => {
  const posts = [
    post({ id: 'a', title: 'Overdue <post>', publish_date: '2026-10-20', status: 'Planned', designer: '', designer_id: null }),
    post({ id: 'b', title: 'Due today', publish_date: TODAY, status: 'Approved' }),
    post({ id: 'c', title: 'Waiting review', publish_date: '2026-11-03', status: 'Ready for Review' }),
    post({ id: 'd', title: 'Shipped', publish_date: '2026-10-25', status: 'Published' }),
  ]
  const email = buildDigest({ posts, today: TODAY, slotLabel: '9:00 a.m.', appUrl: APP_URL, now: new Date('2026-10-27T13:00:00Z') })

  assert.match(email.subject, /^TAE social media digest — .+, 9:00 a\.m\. · 1 overdue$/)
  for (const heading of ['Overdue unfinished posts', 'Scheduled today', 'Requiring design work', 'Awaiting approval', 'Upcoming scheduled posts', 'Recently published']) {
    assert.ok(email.html.includes(heading), heading)
    assert.ok(email.text.includes(heading.toUpperCase()), heading)
  }
  // Escaped titles, program, designer and next action.
  assert.ok(email.html.includes('Overdue &lt;post&gt;'))
  assert.ok(!email.html.includes('Overdue <post>'))
  assert.ok(email.html.includes('Personal Support Worker (PSW)'))
  assert.ok(email.html.includes('Anna Designer'))
  assert.ok(email.html.includes('Unassigned'))
  assert.ok(email.html.includes('Assign a designer and start the design'))
  assert.ok(email.html.includes('Review the post and approve it'))
  // Summary tiles and branding.
  for (const label of ['Planned', 'In Design', 'Ready for Review', 'Approved', 'Published', 'Overdue']) assert.ok(email.html.includes(`>${label}<`), label)
  assert.ok(email.html.includes('src="https://taesocialmedia.vercel.app/favicon.png"'))
  assert.ok(email.html.includes('href="https://taesocialmedia.vercel.app/"'))
  assert.ok(email.text.includes('Open TAE Social Media Manager (sign-in required): https://taesocialmedia.vercel.app/'))
})

test('test digest is labelled in the subject, banner and text', () => {
  const email = buildDigest({ posts: [post()], today: TODAY, slotLabel: '5:00 p.m.', appUrl: APP_URL, test: true, now: new Date() })
  assert.ok(email.subject.startsWith('[Test] '))
  assert.ok(email.html.includes('This is a test email sent from the Email Reminders page.'))
  assert.ok(email.text.startsWith('[TEST EMAIL]'))
})

test('workflow notification keeps event labels, designer and review note', () => {
  const changes = post({ id: 'x', title: 'Reel', changes_requested_at: '2026-10-27T10:00:00Z', review_note: 'Use the new logo & shorter hook' })
  const email = buildNotificationEmail(
    [
      item('assignment', post({ id: 'y', title: 'Assigned post' }), { designer_id: 'd1' }),
      item('ready_for_review', post({ id: 'z', title: 'Review me', status: 'Ready for Review' })),
      item('approved', post({ id: 'w', title: 'Approved one', status: 'Approved' })),
      item('changes_requested', changes, { changes_requested_at: changes.changes_requested_at }),
    ],
    TODAY,
    APP_URL,
  )
  assert.equal(email.subject, 'TAE social media: 1 ready for review, 1 needs changes, 1 approved, 1 assigned')
  assert.ok(email.html.includes('Designer assigned: Anna Designer'))
  for (const label of ['Ready for review', 'Approved', 'Changes requested']) assert.ok(email.html.includes(label), label)
  assert.ok(email.html.includes('Use the new logo &amp; shorter hook'))
  assert.ok(email.text.includes('Requested changes: Use the new logo & shorter hook'))
  assert.ok(email.html.includes('Make the requested changes and resubmit for review'))
})

test('single notification subject names the post', () => {
  const email = buildNotificationEmail([item('approved', post({ status: 'Approved' }))], TODAY, APP_URL)
  assert.equal(email.subject, 'TAE social media: “Intake announcement” — approved')
})

test('deadline reminder lists overdue and due-soon posts', () => {
  const posts = [post({ id: 'o', title: 'Late one', publish_date: '2026-10-25' }), post({ id: 's', title: 'Soon one', publish_date: '2026-10-28' })]
  const email = buildDeadlineEmail(posts, TODAY, 2, APP_URL)
  assert.equal(email.subject, 'TAE social media deadlines — 1 due in the next 2 days, 1 overdue')
  assert.ok(email.html.includes('Late one') && email.html.includes('Soon one'))
  assert.ok(email.html.includes('Publishing deadline reminder'))
})

test('without an application URL there is no logo request and no button', () => {
  const email = buildDeadlineEmail([post()], TODAY, 2, null)
  assert.ok(!email.html.includes('<img'))
  assert.ok(!email.html.includes('Open Social Media Manager'))
  assert.ok(!email.html.includes('<a '))
  assert.ok(email.html.includes('TAE Social Media Manager'))
})
