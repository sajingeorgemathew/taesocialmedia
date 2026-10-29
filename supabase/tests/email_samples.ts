// Deterministic sample emails covering every email type. Used by the snapshot
// test (subjects and plain text must not change when the HTML is restyled).
import { buildDeadlineEmail, buildDigest, buildNotificationEmail, type NotificationItem, type RenderedEmail } from '../functions/_shared/emails.ts'
import { safeAppUrl } from '../functions/_shared/layout.ts'
import type { NotificationEventRow, PostRow } from '../functions/_shared/model.ts'

export const SAMPLE_APP_URL = safeAppUrl('https://social.torontoacademy.ca')
export const SAMPLE_TODAY = '2026-10-27'
const NOW = new Date('2026-10-27T13:00:00Z')

function post(o: Partial<PostRow>): PostRow {
  return {
    id: 'p',
    title: 'Sample post',
    program: 'General TAE Marketing',
    publish_date: '2026-10-30',
    status: 'Planned',
    designer: 'Anna Designer',
    designer_id: 'd1',
    review_note: '',
    changes_requested_at: null,
    platforms: ['Instagram', 'Facebook'],
    updated_at: '2026-10-27T12:00:00Z',
    ...o,
  }
}

export const SAMPLE_POSTS: PostRow[] = [
  post({ id: 'a', title: 'PSW Information Session Reminder', program: 'Personal Support Worker (PSW)', publish_date: '2026-10-24', status: 'In Design', designer: 'Ben Designer' }),
  post({ id: 'b', title: 'Pharmacy Assistant Intake Announcement', program: 'Pharmacy Assistant Certificate', publish_date: SAMPLE_TODAY, status: 'Approved' }),
  post({ id: 'c', title: 'Dental Admin — Career Paths <Story>', program: 'Dental Admin Assistant Certificate', publish_date: '2026-10-31', designer: '', designer_id: null }),
  post({ id: 'd', title: 'Medical Office Assistant — Student Spotlight', program: 'Medical Office Assistant Diploma (MOA)', publish_date: '2026-11-01', status: 'Ready for Review' }),
  post({ id: 'e', title: 'November Open House', publish_date: '2026-11-05', status: 'Approved', platforms: ['Facebook', 'Instagram', 'LinkedIn'] }),
  post({ id: 'f', title: 'Back-to-School Campus Tour', publish_date: '2026-10-23', status: 'Published' }),
]

export const SAMPLE_CHANGES = post({
  id: 'g',
  title: 'Windmill Financing Explainer Reel',
  program: 'Windmill Financing',
  status: 'In Design',
  changes_requested_at: '2026-10-27T10:00:00Z',
  review_note: 'Please use the updated Windmill logo & shorten the opening hook to under 3 seconds.\nKeep the outro.',
})

function event(type: NotificationEventRow['event_type'], p: PostRow): NotificationItem {
  return {
    event: { id: 1, post_id: p.id, event_type: type, details: { designer_id: p.designer_id, changes_requested_at: p.changes_requested_at }, actor: null, created_at: '2026-10-27T12:00:00Z' },
    post: p,
  }
}

export function sampleEmails(appUrl: string | null = SAMPLE_APP_URL): Record<string, RenderedEmail> {
  const posts = SAMPLE_POSTS
  return {
    digest: buildDigest({ posts, today: SAMPLE_TODAY, slotLabel: '9:00 a.m.', appUrl, now: NOW }),
    'test-digest': buildDigest({ posts, today: SAMPLE_TODAY, slotLabel: '5:00 p.m.', appUrl, test: true, now: NOW }),
    'empty-digest': buildDigest({ posts: [], today: SAMPLE_TODAY, slotLabel: '9:00 a.m.', appUrl, now: NOW }),
    assignment: buildNotificationEmail([event('assignment', post({ id: 'h', title: 'Holiday Office Hours' }))], SAMPLE_TODAY, appUrl),
    'ready-for-review': buildNotificationEmail([event('ready_for_review', posts[3])], SAMPLE_TODAY, appUrl),
    approved: buildNotificationEmail([event('approved', posts[1])], SAMPLE_TODAY, appUrl),
    'changes-requested': buildNotificationEmail([event('changes_requested', SAMPLE_CHANGES)], SAMPLE_TODAY, appUrl),
    'grouped-notifications': buildNotificationEmail(
      [event('ready_for_review', posts[3]), event('changes_requested', SAMPLE_CHANGES), event('approved', posts[4]), event('assignment', posts[2])],
      SAMPLE_TODAY,
      appUrl,
    ),
    deadline: buildDeadlineEmail(posts.filter((p) => p.status !== 'Published' && p.publish_date <= '2026-10-29'), SAMPLE_TODAY, 2, appUrl),
  }
}
