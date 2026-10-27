// Demo data for the local mock backend (npm run dev:mock). Dates are relative
// to today so the calendar, dashboard and deadlines always look realistic.
// Nothing here is real: no production data, accounts or email addresses.

export interface MockUser {
  id: string
  email: string
  display_name: string
  role: 'admin' | 'designer'
  active: boolean
  /** Password accepted by the mock sign-in. */
  password: string
}

export const DEMO_PASSWORD = 'demo-password'

export const USERS: MockUser[] = [
  { id: 'u-admin', email: 'office@demo.test', display_name: 'TAE Office', role: 'admin', active: true, password: DEMO_PASSWORD },
  { id: 'u-anna', email: 'anna@demo.test', display_name: 'Anna Designer', role: 'designer', active: true, password: DEMO_PASSWORD },
  { id: 'u-ben', email: 'ben@demo.test', display_name: 'Ben Designer', role: 'designer', active: true, password: DEMO_PASSWORD },
  { id: 'u-old', email: 'former@demo.test', display_name: 'Former Designer', role: 'designer', active: false, password: DEMO_PASSWORD },
]

/** Signs in as these accounts with ?as=<key>. */
export const QUICK_ROLES: Record<string, string> = {
  admin: 'u-admin',
  designer: 'u-anna',
  designer2: 'u-ben',
  disabled: 'u-old',
}

function dateKey(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isoAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

type Status = 'Planned' | 'In Design' | 'Ready for Review' | 'Approved' | 'Published'

interface SeedPost {
  title: string
  day: number
  program: string
  platforms: string[]
  format: string
  status: Status
  designer?: 'u-anna' | 'u-ben'
  legacyName?: string
  caption?: string
  wording?: string
  brief?: string
  script?: string
  notes?: string
  artworkUrl?: string
  publishedUrl?: string
  reviewNote?: string
  changesRequested?: boolean
  images?: number
}

const SEED: SeedPost[] = [
  {
    title: 'PSW Information Session Reminder',
    day: -3,
    program: 'Personal Support Worker (PSW)',
    platforms: ['Facebook', 'Instagram'],
    format: 'Static Photo',
    status: 'In Design',
    designer: 'u-ben',
    caption: 'Join our free PSW information session this Thursday at 6 PM. Register at the link in bio. #PSW #TorontoAcademy',
    wording: 'Free PSW Info Session\nThursday · 6 PM\nRegister today',
    brief: 'Warm classroom photo, navy overlay, gold CTA button.',
  },
  {
    title: 'Medical Office Assistant — Student Spotlight',
    day: -1,
    program: 'Medical Office Assistant Diploma (MOA)',
    platforms: ['Instagram', 'LinkedIn'],
    format: 'Carousel',
    status: 'Ready for Review',
    designer: 'u-anna',
    caption: 'Meet Priya, who completed her MOA diploma and now works at a family clinic in Scarborough.',
    wording: 'Slide 1: Meet Priya\nSlide 2: From student to MOA\nSlide 3: Your career starts here',
    brief: 'Use the approved student photo set. Keep slides clean with one quote each.',
    images: 3,
  },
  {
    title: 'Pharmacy Assistant Intake Announcement',
    day: 0,
    program: 'Pharmacy Assistant Certificate',
    platforms: ['Facebook', 'Instagram', 'LinkedIn'],
    format: 'Static Photo',
    status: 'Approved',
    designer: 'u-anna',
    caption: 'Our next Pharmacy Assistant intake starts soon. Seats are limited — apply today.',
    wording: 'Pharmacy Assistant Certificate\nNew intake starting soon\nApply today',
    images: 1,
  },
  {
    title: 'Windmill Financing Explainer Reel',
    day: 2,
    program: 'Windmill Financing',
    platforms: ['Instagram', 'Facebook'],
    format: 'Reel',
    status: 'In Design',
    designer: 'u-anna',
    changesRequested: true,
    reviewNote: 'Please use the updated Windmill logo and shorten the opening hook to under 3 seconds.',
    caption: 'Financing your education is easier than you think. Learn how Windmill can help.',
    script: 'Scene 1 (0–3s): Hook — “Worried about tuition?”\nScene 2 (3–8s): Student at desk / Voiceover: Windmill Microlending…\nScene 3: CTA — Book a call',
    images: 1,
  },
  {
    title: 'Dental Admin — Career Paths Story',
    day: 4,
    program: 'Dental Admin Assistant Certificate',
    platforms: ['Instagram'],
    format: 'Story',
    status: 'Planned',
    brief: 'Three frames: front desk, scheduling, patient care. Tap-to-learn-more sticker.',
  },
  {
    title: 'November Open House Announcement',
    day: 6,
    program: 'General TAE Marketing',
    platforms: ['Facebook', 'Instagram', 'LinkedIn'],
    format: 'Static Photo',
    status: 'Planned',
    designer: 'u-ben',
    caption: 'You are invited to our November Open House. Tour the campus and meet instructors.',
  },
  {
    title: 'PSW Graduates Celebration',
    day: 8,
    program: 'Personal Support Worker (PSW)',
    platforms: ['Facebook', 'LinkedIn'],
    format: 'Carousel',
    status: 'Ready for Review',
    designer: 'u-ben',
    reviewNote: 'Swap slide 2 photo for the group shot.',
    images: 2,
  },
  {
    title: 'Medical Admin Tips — Week 1',
    day: 10,
    program: 'Medical Admin Assistant Certificate',
    platforms: ['LinkedIn'],
    format: 'Static Photo',
    status: 'Planned',
    legacyName: 'Sam',
  },
  {
    title: 'Why Choose TAE? Reel',
    day: 13,
    program: 'General TAE Marketing',
    platforms: ['Instagram', 'Facebook'],
    format: 'Reel',
    status: 'Planned',
  },
  {
    title: 'MOA Intake Countdown',
    day: 15,
    program: 'Medical Office Assistant Diploma (MOA)',
    platforms: ['Instagram', 'Facebook'],
    format: 'Story',
    status: 'In Design',
    designer: 'u-anna',
  },
  {
    title: 'Holiday Office Hours',
    day: 21,
    program: 'General TAE Marketing',
    platforms: ['Facebook', 'Instagram', 'LinkedIn'],
    format: 'Static Photo',
    status: 'Planned',
  },
  {
    title: 'Back-to-School Campus Tour',
    day: -12,
    program: 'General TAE Marketing',
    platforms: ['Facebook', 'Instagram'],
    format: 'Reel',
    status: 'Published',
    designer: 'u-ben',
    publishedUrl: 'https://www.instagram.com/p/example-tour',
    images: 1,
  },
  {
    title: 'PSW Clinical Placement Highlights',
    day: -8,
    program: 'Personal Support Worker (PSW)',
    platforms: ['LinkedIn'],
    format: 'Carousel',
    status: 'Published',
    legacyName: 'Chris',
    publishedUrl: 'https://www.linkedin.com/posts/example-placement',
  },
  {
    title: 'Pharmacy Assistant FAQ',
    day: -5,
    program: 'Pharmacy Assistant Certificate',
    platforms: ['Facebook'],
    format: 'Static Photo',
    status: 'Published',
    designer: 'u-anna',
    publishedUrl: 'https://www.facebook.com/example-faq',
  },
]

const PALETTE = ['#122C4F', '#2C5A8C', '#C9A24E', '#3D7A6E', '#6D4FD8']

/** A placeholder artwork image (SVG data URL). */
export function placeholderImage(label: string, index: number): string {
  const bg = PALETTE[index % PALETTE.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#0b1a30"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><text x="60" y="690" font-family="Segoe UI, Arial" font-size="56" font-weight="700" fill="#ffffff">${label.replace(/[<&>]/g, '')}</text><rect x="60" y="720" width="120" height="8" fill="#C9A24E"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export interface MockDb {
  team_members: Record<string, unknown>[]
  posts: Record<string, unknown>[]
  post_assets: Record<string, unknown>[]
  email_settings: Record<string, unknown>[]
  email_recipients: Record<string, unknown>[]
  email_schedules: Record<string, unknown>[]
  email_delivery_logs: Record<string, unknown>[]
}

export function buildSeed(): MockDb {
  const name = (id?: string) => USERS.find((u) => u.id === id)?.display_name ?? ''
  const posts: Record<string, unknown>[] = []
  const assets: Record<string, unknown>[] = []
  SEED.forEach((s, i) => {
    const id = `p-${i + 1}`
    const created = isoAgo(24 * (20 - i))
    posts.push({
      id,
      title: s.title,
      publish_date: dateKey(s.day),
      program: s.program,
      platforms: s.platforms,
      format: s.format,
      status: s.status,
      caption: s.caption ?? '',
      creative_wording: s.wording ?? '',
      design_brief: s.brief ?? '',
      reel_script: s.script ?? '',
      designer_id: s.designer ?? null,
      designer: s.designer ? name(s.designer) : (s.legacyName ?? ''),
      notes: s.notes ?? '',
      artwork_url: s.artworkUrl ?? '',
      published_url: s.publishedUrl ?? '',
      review_note: s.reviewNote ?? '',
      changes_requested_at: s.changesRequested ? isoAgo(5) : null,
      version: 1,
      created_at: created,
      updated_at: created,
    })
    for (let n = 0; n < (s.images ?? 0); n++) {
      assets.push({
        id: `a-${i + 1}-${n + 1}`,
        post_id: id,
        storage_path: `seed/${id}/${n + 1}.png`,
        file_name: `${s.format === 'Carousel' ? `slide-${n + 1}` : 'artwork'}.png`,
        mime_type: 'image/png',
        size_bytes: 240_000 + n * 51_000,
        position: n,
        created_at: created,
      })
    }
  })

  return {
    team_members: USERS.map(({ id, email, display_name, role, active }) => ({ user_id: id, email, display_name, role, active })),
    posts,
    post_assets: assets,
    email_settings: [
      {
        id: 1,
        paused: false,
        digest_enabled: true,
        digest_weekdays: [1, 2, 3, 4, 5],
        app_url: 'https://taesocialmedia.vercel.app',
        notify_assignment: true,
        notify_ready_for_review: true,
        notify_approved: true,
        notify_deadline: true,
        notify_changes_requested: true,
        deadline_days_ahead: 2,
        deadline_reminder_time: '08:30:00',
        updated_at: isoAgo(48),
      },
    ],
    email_recipients: [
      ['r-1', 'office@demo.test', 'TAE Office', true, true, true, true],
      ['r-2', 'marketing@demo.test', 'Marketing Lead', true, true, true, false],
      ['r-3', 'archive@demo.test', '', false, true, false, false],
    ].map(([id, email, nm, active, digest, workflow, assignments], i) => ({
      id,
      email,
      name: nm,
      active,
      receives_digest: digest,
      receives_notifications: workflow,
      receives_assignments: assignments,
      designer_name: '',
      created_at: isoAgo(200 - i),
    })),
    email_schedules: [
      { id: 's-1', send_time: '09:00:00', label: 'Morning', active: true },
      { id: 's-2', send_time: '17:00:00', label: 'End of day', active: true },
      { id: 's-3', send_time: '12:30:00', label: 'Lunch check-in', active: false },
    ],
    email_delivery_logs: [
      ['l-1', 'digest', 'office@demo.test', 'TAE social media digest — Today, 9:00 a.m.', 'sent', 1, false, null, 'mock-msg-1', null, 3],
      ['l-2', 'notification', 'anna@demo.test', 'TAE social media: “Windmill Financing Explainer Reel” — changes requested', 'sent', 1, false, null, 'mock-msg-2', null, 5],
      ['l-3', 'notification', 'office@demo.test', 'TAE social media: “Medical Office Assistant — Student Spotlight” — ready for review', 'failed', 2, true, isoAgo(-0.15), null, 'Resend returned 429 (rate limited). Will retry.', 7],
      ['l-4', 'deadline', 'marketing@demo.test', 'TAE social media deadlines — 2 due in the next 2 days, 1 overdue', 'sent', 1, false, null, 'mock-msg-4', null, 26],
      ['l-5', 'test', 'office@demo.test', '[Test] TAE social media digest', 'sent', 1, false, null, 'mock-msg-5', null, 50],
      ['l-6', 'digest', 'archive@demo.test', 'TAE social media digest — Monday, 5:00 p.m.', 'skipped', 0, false, null, null, 'Recipient is disabled.', 74],
    ].map(([id, kind, email, subject, status, attempts, retryable, next, msg, error, hours]) => ({
      id,
      kind,
      recipient_email: email,
      subject,
      status,
      attempts,
      retryable,
      next_attempt_at: next,
      resend_message_id: msg,
      error,
      scheduled_for: null,
      created_at: isoAgo(hours as number),
      sent_at: status === 'sent' ? isoAgo(hours as number) : null,
    })),
  }
}
