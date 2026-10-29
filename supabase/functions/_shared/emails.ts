// Email content: the progress digest, workflow notifications and deadline
// reminders, each rendered as HTML plus a plain-text alternative. No artwork
// or attachments are included.
import { STATUSES, type NotificationEventRow, type PostRow, type PostStatus } from './model.ts'
import { COLORS, STATUS_COLORS, badge, detailRow, emptyRow, escapeHtml, noteRow, renderLayout, sectionHeading } from './layout.ts'
import { addDays, formatDateKey } from './time.ts'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const SECTION_LIMIT = 20
const FOOTER =
  'You receive this because you are on the TAE Social Media Manager reminder list. An administrator can change recipients, times and notification preferences on the Email Reminders page.'

export function isOverdue(post: PostRow, today: string): boolean {
  return post.status !== 'Published' && post.publish_date < today
}

export function nextAction(post: PostRow): string {
  switch (post.status) {
    case 'Planned':
      return post.designer.trim() ? `Start the design (${post.designer.trim()})` : 'Assign a designer and start the design'
    case 'In Design':
      return post.changes_requested_at
        ? 'Make the requested changes and resubmit for review'
        : 'Finish the artwork and submit it for review'
    case 'Ready for Review':
      return 'Review the post and approve it'
    case 'Approved':
      return post.platforms.length > 0 ? `Publish on ${post.platforms.join(', ')}` : 'Publish the post'
    case 'Published':
      return 'Done — no action needed'
  }
}

function postCard(post: PostRow, today: string): string {
  const overdue = isOverdue(post, today)
  const designer = post.designer.trim()
  const designerHtml = designer ? escapeHtml(designer) : `<span style="color:${COLORS.muted};font-style:italic;">Unassigned</span>`
  return `<tr><td class="px" style="padding:6px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.border};border-left:4px solid ${STATUS_COLORS[post.status].fg};border-radius:10px;border-collapse:separate;">
<tr><td style="padding:16px 18px 12px;">
  <div style="line-height:22px;">${badge(post.status, STATUS_COLORS[post.status])}${overdue ? ` ${badge('Overdue', STATUS_COLORS.Overdue)}` : ''}</div>
  <div style="font-size:16px;font-weight:600;line-height:22px;color:${COLORS.navy};padding:8px 0 8px;">${escapeHtml(post.title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${detailRow('Program', escapeHtml(post.program))}
${detailRow('Publish date', `<span style="${overdue ? `color:${COLORS.danger};font-weight:600;` : ''}">${escapeHtml(formatDateKey(post.publish_date))}</span>`)}
${detailRow('Designer', designerHtml)}
  </table>
</td></tr>
<tr><td bgcolor="${COLORS.panel}" style="padding:10px 18px;background:${COLORS.panel};border-top:1px solid ${COLORS.divider};border-radius:0 0 10px 6px;font-size:13px;line-height:19px;color:${COLORS.text};"><strong style="color:${COLORS.navy};">Next:</strong> ${escapeHtml(nextAction(post))}</td></tr>
</table>
</td></tr>`
}

function postLine(post: PostRow, today: string): string {
  const designer = post.designer.trim() || 'Unassigned'
  return [
    `- ${post.title}${isOverdue(post, today) ? ' [OVERDUE]' : ''}`,
    `  ${post.program} · ${formatDateKey(post.publish_date)} · ${post.status} · Designer: ${designer}`,
    `  Next: ${nextAction(post)}`,
  ].join('\n')
}

interface Section {
  title: string
  description: string
  empty: string
  posts: PostRow[]
  tone?: 'danger'
}

function renderSections(sections: Section[], today: string): { html: string; text: string } {
  let html = ''
  const text: string[] = []
  for (const s of sections) {
    html += sectionHeading(s.title, s.posts.length, s.description, s.tone)
    text.push('', `${s.title.toUpperCase()} (${s.posts.length})`)
    if (s.posts.length === 0) {
      html += emptyRow(s.empty)
      text.push(`  ${s.empty}`)
      continue
    }
    for (const post of s.posts.slice(0, SECTION_LIMIT)) {
      html += postCard(post, today)
      text.push(postLine(post, today))
    }
    if (s.posts.length > SECTION_LIMIT) {
      const more = `…and ${s.posts.length - SECTION_LIMIT} more in the app.`
      html += noteRow(more)
      text.push(`  ${more}`)
    }
  }
  return { html, text: text.join('\n') }
}

function linkText(appUrl: string | null): string {
  return appUrl ? `\nOpen TAE Social Media Manager (sign-in required): ${appUrl}\n` : ''
}

// ---------------------------------------------------------------------------
// Progress digest
// ---------------------------------------------------------------------------

export interface DigestOptions {
  posts: PostRow[]
  /** Toronto date the digest is for (YYYY-MM-DD). */
  today: string
  /** Human label of the send slot, e.g. "9:00 a.m.". */
  slotLabel: string
  appUrl: string | null
  /** Shown as a banner and prefixed to the subject for test sends. */
  test?: boolean
  /** "now" for "recently published". */
  now: Date
}

export function buildDigest(o: DigestOptions): RenderedEmail {
  const { posts, today } = o
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<PostStatus, number>
  let overdueCount = 0
  for (const p of posts) {
    counts[p.status] += 1
    if (isOverdue(p, today)) overdueCount += 1
  }

  const upcomingEnd = addDays(today, 14)
  const recentStart = addDays(today, -7)
  const recentCutoff = o.now.getTime() - 7 * 86_400_000
  const byDateDesc = (a: PostRow, b: PostRow) => b.publish_date.localeCompare(a.publish_date)

  const sections: Section[] = [
    {
      title: 'Overdue unfinished posts',
      description: 'Publishing date has passed but the post is not published.',
      empty: 'Nothing is overdue.',
      posts: posts.filter((p) => isOverdue(p, today)),
      tone: 'danger',
    },
    {
      title: 'Scheduled today',
      description: formatDateKey(today),
      empty: 'No posts are scheduled for today.',
      posts: posts.filter((p) => p.publish_date === today),
    },
    {
      title: 'Requiring design work',
      description: 'Planned or in design, scheduled after today.',
      empty: 'No upcoming posts are waiting on design.',
      posts: posts.filter((p) => (p.status === 'Planned' || p.status === 'In Design') && p.publish_date > today),
    },
    {
      title: 'Awaiting approval',
      description: 'Ready for review, scheduled after today.',
      empty: 'Nothing is waiting for approval.',
      posts: posts.filter((p) => p.status === 'Ready for Review' && p.publish_date > today),
    },
    {
      title: 'Upcoming scheduled posts',
      description: 'Approved and ready to publish in the next 14 days.',
      empty: 'No approved posts are scheduled in the next 14 days.',
      posts: posts.filter((p) => p.status === 'Approved' && p.publish_date > today && p.publish_date <= upcomingEnd),
    },
    {
      title: 'Recently published',
      description: 'Published in the last 7 days.',
      empty: 'Nothing was published in the last 7 days.',
      posts: posts
        .filter(
          (p) =>
            p.status === 'Published' &&
            p.publish_date !== today &&
            ((p.publish_date >= recentStart && p.publish_date < today) || Date.parse(p.updated_at) >= recentCutoff),
        )
        .sort(byDateDesc),
    },
  ]

  const summary: { label: string; value: number; colors: { fg: string; bg: string } }[] = [
    ...STATUSES.map((s) => ({ label: s, value: counts[s], colors: STATUS_COLORS[s] })),
    { label: 'Overdue', value: overdueCount, colors: STATUS_COLORS.Overdue },
  ]

  // Two rows of three tiles: readable on phones without media queries.
  const tile = (t: (typeof summary)[number]) => {
    const alert = t.label === 'Overdue' && t.value > 0
    return `<td class="tile" width="33%" valign="top" style="padding:4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${alert ? '#f3c7c1' : COLORS.border};border-radius:10px;border-collapse:separate;background:${alert ? COLORS.dangerBg : '#ffffff'};"><tr><td style="padding:12px 14px;">
  <div style="font-size:12px;font-weight:600;line-height:16px;color:${COLORS.muted};"><span style="display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:4px;background:${t.colors.fg};vertical-align:1px;"></span><span>${escapeHtml(t.label)}</span></div>
  <div class="tile-n" style="font-size:26px;font-weight:700;line-height:32px;padding-top:4px;color:${alert ? COLORS.danger : COLORS.navy};">${t.value}</div>
</td></tr></table></td>`
  }
  const summaryHtml = `<tr><td class="px" style="padding:24px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>${summary.slice(0, 3).map(tile).join('')}</tr>
<tr>${summary.slice(3).map(tile).join('')}</tr>
</table></td></tr>`

  const body = renderSections(sections, today)
  const dateLabel = formatDateKey(today, false)
  const outstanding = posts.length - counts.Published
  const subject = `${o.test ? '[Test] ' : ''}TAE social media digest — ${dateLabel}, ${o.slotLabel}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`
  const subheading = `${formatDateKey(today)} · ${o.slotLabel} (Toronto) · ${outstanding} unfinished post${outstanding === 1 ? '' : 's'}`

  const html = renderLayout({
    preheader: `${overdueCount} overdue · ${counts['Ready for Review']} awaiting approval · ${counts['In Design']} in design`,
    eyebrow: o.test ? 'Test email' : 'Progress digest',
    heading: 'Social media progress digest',
    subheading,
    banner: o.test ? 'This is a test email sent from the Email Reminders page. It shows the live digest as it would be sent now.' : undefined,
    rows: summaryHtml + body.html,
    appUrl: o.appUrl,
    footer: FOOTER,
  })

  const text = [
    o.test ? '[TEST EMAIL] This shows the live digest as it would be sent now.\n' : '',
    'TAE SOCIAL MEDIA PROGRESS DIGEST',
    subheading,
    '',
    summary.map((t) => `${t.label}: ${t.value}`).join(' | '),
    body.text,
    linkText(o.appUrl),
    FOOTER,
  ].join('\n')

  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Workflow notifications (grouped)
// ---------------------------------------------------------------------------

export interface NotificationItem {
  event: NotificationEventRow
  post: PostRow
}

const EVENT_LABEL: Record<NotificationEventRow['event_type'], string> = {
  assignment: 'Designer assigned',
  ready_for_review: 'Ready for review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

const sameInstant = (a: unknown, b: string | null) =>
  typeof a === 'string' && b !== null && Date.parse(a) === Date.parse(b)

/** Drops events that are no longer true (e.g. moved back, reassigned, published, resubmitted). */
export function stillRelevant(item: NotificationItem): boolean {
  const { event, post } = item
  switch (event.event_type) {
    case 'ready_for_review':
      return post.status === 'Ready for Review'
    case 'approved':
      return post.status === 'Approved'
    case 'changes_requested':
      return post.status === 'In Design' && sameInstant(event.details.changes_requested_at, post.changes_requested_at)
    case 'assignment': {
      if (post.status === 'Published') return false
      if ('designer_id' in event.details) {
        return typeof event.details.designer_id === 'string' && post.designer_id === event.details.designer_id
      }
      // Events queued before designer accounts existed carry only the typed name.
      const designer = typeof event.details.designer === 'string' ? event.details.designer.trim() : ''
      return designer !== '' && post.designer.trim() === designer
    }
  }
}

function reviewNoteRow(note: string): string {
  const lines = note.split(/\r?\n/).map(escapeHtml).join('<br>')
  return `<tr><td class="px" style="padding:6px 32px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="#fdf6ea" style="padding:14px 18px;border-radius:10px;background:#fdf6ea;border:1px solid #f1dcb6;border-left:4px solid #b05a06;">
  <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;line-height:16px;color:#b05a06;">Requested changes</div>
  <div style="padding-top:6px;font-size:14px;line-height:21px;color:${COLORS.text};">${lines}</div>
</td></tr></table></td></tr>`
}

const EVENT_COLOR: Record<NotificationEventRow['event_type'], string> = {
  assignment: STATUS_COLORS['In Design'].fg,
  ready_for_review: STATUS_COLORS['Ready for Review'].fg,
  approved: STATUS_COLORS.Approved.fg,
  changes_requested: COLORS.danger,
}

function eventLabelRow(type: NotificationEventRow['event_type'], label: string, first: boolean): string {
  return `<tr><td class="px" style="padding:${first ? 28 : 32}px 32px 6px;"><h2 style="margin:0;font-family:inherit;font-size:13px;font-weight:700;line-height:18px;color:${COLORS.navy};"><span style="display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:4px;background:${EVENT_COLOR[type]};vertical-align:1px;"></span>${escapeHtml(label)}</h2></td></tr>`
}

export function buildNotificationEmail(items: NotificationItem[], today: string, appUrl: string | null): RenderedEmail {
  let rows = ''
  const text: string[] = ['TAE SOCIAL MEDIA — WORKFLOW UPDATES', '']
  for (const { event, post } of items) {
    const label =
      event.event_type === 'assignment' ? `${EVENT_LABEL.assignment}: ${post.designer.trim()}` : EVENT_LABEL[event.event_type]
    rows += eventLabelRow(event.event_type, label, rows === '')
    rows += postCard(post, today)
    text.push(label.toUpperCase(), postLine(post, today))
    if (event.event_type === 'changes_requested' && post.review_note.trim()) {
      rows += reviewNoteRow(post.review_note.trim())
      text.push(`  Requested changes: ${post.review_note.trim()}`)
    }
    text.push('')
  }
  const counts = {
    assignment: items.filter((i) => i.event.event_type === 'assignment').length,
    ready: items.filter((i) => i.event.event_type === 'ready_for_review').length,
    approved: items.filter((i) => i.event.event_type === 'approved').length,
    changes: items.filter((i) => i.event.event_type === 'changes_requested').length,
  }
  const parts = [
    counts.ready ? `${counts.ready} ready for review` : '',
    counts.changes ? `${counts.changes} need${counts.changes === 1 ? 's' : ''} changes` : '',
    counts.approved ? `${counts.approved} approved` : '',
    counts.assignment ? `${counts.assignment} assigned` : '',
  ].filter(Boolean)
  const subject =
    items.length === 1
      ? `TAE social media: “${items[0].post.title}” — ${EVENT_LABEL[items[0].event.event_type].toLowerCase()}`
      : `TAE social media: ${parts.join(', ')}`

  return {
    subject,
    html: renderLayout({
      preheader: parts.join(' · '),
      eyebrow: 'Workflow notification',
      heading: 'Workflow updates',
      subheading: `${items.length} post${items.length === 1 ? '' : 's'} changed and may need your attention.`,
      rows,
      appUrl,
      footer: FOOTER,
    }),
    text: [...text, linkText(appUrl), FOOTER].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Publishing deadline reminder
// ---------------------------------------------------------------------------

export function deadlinePosts(posts: PostRow[], today: string, daysAhead: number): PostRow[] {
  const end = addDays(today, daysAhead)
  return posts.filter((p) => p.status !== 'Published' && p.publish_date <= end)
}

export function buildDeadlineEmail(posts: PostRow[], today: string, daysAhead: number, appUrl: string | null): RenderedEmail {
  const overdue = posts.filter((p) => isOverdue(p, today))
  const upcoming = posts.filter((p) => !isOverdue(p, today))
  const window = daysAhead === 0 ? 'today' : `in the next ${daysAhead} day${daysAhead === 1 ? '' : 's'}`
  const body = renderSections(
    [
      { title: 'Overdue', description: 'Past their publishing date.', empty: 'Nothing is overdue.', posts: overdue, tone: 'danger' },
      { title: 'Due soon', description: `Publishing ${window} and not yet published.`, empty: 'Nothing is due soon.', posts: upcoming },
    ],
    today,
  )
  const subject = `TAE social media deadlines — ${upcoming.length} due ${window}${overdue.length ? `, ${overdue.length} overdue` : ''}`
  return {
    subject,
    html: renderLayout({
      preheader: subject,
      eyebrow: 'Deadline reminder',
      heading: 'Publishing deadline reminder',
      subheading: `${formatDateKey(today)} · unfinished posts due ${window}`,
      rows: body.html,
      appUrl,
      footer: FOOTER,
    }),
    text: ['TAE SOCIAL MEDIA — PUBLISHING DEADLINES', formatDateKey(today), body.text, linkText(appUrl), FOOTER].join('\n'),
  }
}
