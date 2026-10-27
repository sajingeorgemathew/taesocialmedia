// email-dispatch — called every 5 minutes by Supabase Cron (see
// supabase/migrations/20261026000004_email_cron.sql). Not callable by the
// browser: the caller must present EMAIL_CRON_SECRET in the x-cron-secret
// header. Deploy with --no-verify-jwt; this check replaces the JWT check.
//
// Each run:
//   1. QUEUES what is due — one outbox row per recipient — for progress
//      digests, grouped workflow notifications and the deadline reminder.
//      Queuing is a single transaction per email type, keyed by a unique
//      dedupe_key, so overlapping runs cannot queue a slot twice.
//   2. SENDS queued, retry-due and stuck rows until done or out of time.
//      Each recipient's row is sent and recorded independently; anything
//      unsent stays queued for the next run.
import 'jsr:@supabase/functions-js@2/edge-runtime.d.ts'
import { ConfigError, cronSecret, getResendApiKey } from '../_shared/config.ts'
import {
  createAdminClient,
  loadActiveRecipients,
  loadPosts,
  loadSettings,
  type AdminClient,
  type NotificationEventRow,
  type PostRow,
  type RecipientRow,
  type ScheduleRow,
  type SettingsRow,
} from '../_shared/db.ts'
import { Mailer, type DeliveryResult, type OutgoingEmail } from '../_shared/delivery.ts'
import {
  buildDeadlineEmail,
  buildDigest,
  buildNotificationEmail,
  deadlinePosts,
  stillRelevant,
  type NotificationItem,
} from '../_shared/emails.ts'
import { errorJson, json, sha256Hex, timingSafeEqual } from '../_shared/http.ts'
import { safeAppUrl } from '../_shared/layout.ts'
import { routeNotifications } from '../_shared/routing.ts'
import { digestDedupeKey, dueDeadlineSlot, dueDigestSlots } from '../_shared/slots.ts'
import { formatClock, localDateKey } from '../_shared/time.ts'

/** Workflow events wait this long so quick changes and undos collapse. */
const NOTIFICATION_QUIET_SECONDS = 120
/** Stop claiming new sends after this long (Edge Functions allow 150 s). */
const TIME_BUDGET_MS = 100_000
const HOUR = 3_600_000

interface Context {
  admin: AdminClient
  mailer: Mailer
  settings: SettingsRow
  recipients: RecipientRow[]
  getPosts: () => Promise<PostRow[]>
  now: Date
  queued: number
  notes: string[]
}

async function queueDigests(ctx: Context, schedules: ScheduleRow[]) {
  const slots = dueDigestSlots(ctx.settings, schedules, ctx.now)
  if (slots.length === 0) return
  const targets = ctx.recipients.filter((r) => r.receives_digest)
  if (targets.length === 0) {
    ctx.notes.push('A digest was due but no active recipient receives digests.')
    return
  }
  const appUrl = safeAppUrl(ctx.settings.app_url)
  const posts = await ctx.getPosts()
  for (const slot of slots) {
    const content = buildDigest({ posts, today: slot.dateKey, slotLabel: formatClock(slot.time), appUrl, now: ctx.now })
    const emails: OutgoingEmail[] = targets.map((r) => ({
      kind: 'digest',
      dedupeKey: digestDedupeKey(slot, r.email),
      recipient: { id: r.id, email: r.email },
      scheduledFor: slot.instant.toISOString(),
      // A digest more than 3 hours late is stale; skip it rather than send.
      expiresAt: new Date(slot.instant.getTime() + 3 * HOUR),
      ...content,
    }))
    ctx.queued += (await ctx.mailer.enqueue(emails)).size
  }
}

async function queueNotifications(ctx: Context) {
  const batchId = crypto.randomUUID()
  const { data, error } = await ctx.admin.rpc('claim_email_notification_events', {
    p_batch_id: batchId,
    p_quiet_seconds: NOTIFICATION_QUIET_SECONDS,
  })
  if (error) throw new Error(`Could not claim notification events: ${error.message}`)
  const events = (data ?? []) as NotificationEventRow[]
  if (events.length === 0) return

  const enabled: Record<NotificationEventRow['event_type'], boolean> = {
    assignment: ctx.settings.notify_assignment,
    ready_for_review: ctx.settings.notify_ready_for_review,
    approved: ctx.settings.notify_approved,
  }
  const postsById = new Map((await ctx.getPosts()).map((p) => [p.id, p]))

  // Keep the latest event per post and type, and only those still true.
  const latest = new Map<string, NotificationItem>()
  for (const event of events) {
    const post = postsById.get(event.post_id)
    if (!post || !enabled[event.event_type]) continue
    const item = { event, post }
    if (stillRelevant(item)) latest.set(`${event.post_id}:${event.event_type}`, item)
  }
  const items = [...latest.values()].sort((a, b) => a.post.publish_date.localeCompare(b.post.publish_date))

  // A stable key for this exact set of events, so re-claiming the same events
  // after a crash produces the same dedupe keys.
  const eventKey = await sha256Hex(
    events
      .map((e) => e.id)
      .sort((a, b) => a - b)
      .join(','),
  )
  const today = localDateKey(ctx.now)
  const appUrl = safeAppUrl(ctx.settings.app_url)
  const emails: OutgoingEmail[] = routeNotifications(items, ctx.recipients).map(({ recipient, items: mine }) => ({
    kind: 'notification',
    dedupeKey: `notification:${eventKey}:${recipient.email}`,
    recipient: { id: recipient.id, email: recipient.email },
    expiresAt: new Date(ctx.now.getTime() + 12 * HOUR),
    ...buildNotificationEmail(mine, today, appUrl),
  }))

  // Queues every recipient's email and marks the events processed atomically.
  ctx.queued += (await ctx.mailer.enqueue(emails, { id: batchId, outcome: emails.length > 0 ? 'sent' : 'skipped' })).size
}

async function queueDeadlineReminder(ctx: Context) {
  if (!ctx.settings.notify_deadline) return
  const slot = dueDeadlineSlot(ctx.settings.deadline_reminder_time, ctx.now)
  if (!slot) return
  const due = deadlinePosts(await ctx.getPosts(), slot.dateKey, ctx.settings.deadline_days_ahead)
  if (due.length === 0) return
  const content = buildDeadlineEmail(due, slot.dateKey, ctx.settings.deadline_days_ahead, safeAppUrl(ctx.settings.app_url))
  const emails: OutgoingEmail[] = ctx.recipients
    .filter((r) => r.receives_notifications)
    .map((r) => ({
      kind: 'deadline',
      dedupeKey: `deadline:${slot.dateKey}:${r.email}`,
      recipient: { id: r.id, email: r.email },
      scheduledFor: slot.instant.toISOString(),
      expiresAt: new Date(slot.instant.getTime() + 6 * HOUR),
      ...content,
    }))
  ctx.queued += (await ctx.mailer.enqueue(emails)).size
}

async function housekeeping(admin: AdminClient) {
  const now = new Date().toISOString()
  const dayAgo = new Date(Date.now() - 24 * HOUR).toISOString()
  const monthAgo = new Date(Date.now() - 30 * 24 * HOUR).toISOString()
  // Deliveries that can no longer be sent: past expiry, or out of attempts.
  await admin
    .from('email_delivery_logs')
    .update({ status: 'failed', retryable: false, next_attempt_at: null, error: 'Not sent: expired before it could be delivered.', body_html: null, body_text: null, updated_at: now })
    .in('status', ['queued', 'sending'])
    .lt('expires_at', now)
  await admin
    .from('email_delivery_logs')
    .update({ retryable: false, next_attempt_at: null, body_html: null, body_text: null, updated_at: now })
    .eq('status', 'failed')
    .eq('retryable', true)
    .lt('expires_at', now)
  await admin.from('email_notification_events').delete().not('processed_at', 'is', null).lt('processed_at', monthAgo)
  await admin.from('email_delivery_logs').update({ body_html: null, body_text: null }).in('status', ['sent', 'skipped']).not('body_html', 'is', null).lt('created_at', dayAgo)
}

function tally(results: DeliveryResult[]) {
  const count = (o: string) => results.filter((r) => r.result.outcome === o).length
  return { sent: count('sent'), failed: count('failed'), skipped: count('skipped') }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorJson('Method not allowed', 405)

  let expected: string
  try {
    expected = cronSecret()
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    return errorJson('Email dispatch is not configured.', 500)
  }
  if (!timingSafeEqual(req.headers.get('x-cron-secret') ?? '', expected)) {
    return errorJson('Unauthorized', 401)
  }

  const started = Date.now()
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS
  const now = new Date()

  try {
    const admin = createAdminClient()
    const settings = await loadSettings(admin)

    if (settings.paused) {
      // The pause trigger already cancelled pending work; nothing is sent.
      await housekeeping(admin)
      return json({ ok: true, paused: true })
    }

    const apiKey = getResendApiKey()
    const [recipients, schedulesResult] = await Promise.all([
      loadActiveRecipients(admin),
      admin.from('email_schedules').select('id, send_time, label, active, updated_at'),
    ])
    if (schedulesResult.error) throw new Error(`Could not read schedules: ${schedulesResult.error.message}`)

    let postsPromise: Promise<PostRow[]> | null = null
    const ctx: Context = {
      admin,
      mailer: new Mailer(admin, apiKey),
      settings,
      recipients,
      getPosts: () => (postsPromise ??= loadPosts(admin)),
      now,
      queued: 0,
      notes: [],
    }

    // Each phase is isolated: a failure in one never blocks the others.
    const phases: [string, () => Promise<void>][] = [
      ['digests', () => queueDigests(ctx, (schedulesResult.data ?? []) as ScheduleRow[])],
      ['notifications', () => queueNotifications(ctx)],
      ['deadline reminder', () => queueDeadlineReminder(ctx)],
    ]
    let phaseFailed = false
    for (const [name, run] of phases) {
      try {
        await run()
      } catch (err) {
        phaseFailed = true
        const message = err instanceof Error ? err.message : String(err)
        console.error(`email-dispatch: queuing ${name} failed: ${message}`)
        ctx.notes.push(`Queuing ${name} failed; see function logs.`)
      }
    }

    const results = await ctx.mailer.processQueue({ outOfTime })
    await housekeeping(admin)

    return json(
      { ok: !phaseFailed, queued: ctx.queued, ...tally(results), outOfTime: outOfTime(), notes: ctx.notes, ms: Date.now() - started },
      phaseFailed ? 500 : 200,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`email-dispatch failed: ${message}`)
    return json({ ok: false, error: err instanceof ConfigError ? message : 'Dispatch failed; see function logs.' }, 500)
  }
})
