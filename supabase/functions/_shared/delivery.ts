// Outbox delivery. Every email is one row per recipient in
// email_delivery_logs, so each recipient's delivery is independent:
//
//   enqueue → all recipients' rows are inserted as 'queued' in one
//             transaction (unique dedupe_key: a slot is queued once).
//   claim   → due rows are atomically moved to 'sending' (SKIP LOCKED).
//   send    → Resend, with an Idempotency-Key derived from dedupe_key.
//   record  → sent / failed (retryable or not) / skipped.
//
// A failure, exception or time-out for one recipient never affects another:
// unsent rows stay queued (or failed-retryable) and the next run picks them up.
import { emailFrom, emailReplyTo, resendMinIntervalMs } from './config.ts'
import type { AdminClient, DeliveryLogRow } from './db.ts'
import { sha256Hex, sleep } from './http.ts'
import { sendWithResend } from './resend.ts'

export const MAX_ATTEMPTS = 3
/** Rows claimed per round trip; small so a run stops close to its time budget. */
const CLAIM_BATCH = 5

export type DeliveryKind = 'digest' | 'test' | 'notification' | 'deadline'

export interface OutgoingEmail {
  kind: DeliveryKind
  dedupeKey: string
  recipient: { id: string | null; email: string }
  subject: string
  html: string
  text: string
  /** After this the email is not sent at all (stale). */
  expiresAt: Date
  scheduledFor?: string
  triggeredBy?: string
}

export type DeliveryOutcome =
  | { outcome: 'sent'; messageId: string }
  | { outcome: 'failed'; error: string; willRetry: boolean }
  | { outcome: 'skipped'; error: string }

export interface DeliveryResult {
  id: string
  email: string
  result: DeliveryOutcome
}

/** Wait before attempt n+1. */
function backoffMs(attempts: number): number {
  return attempts <= 1 ? 2 * 60_000 : 10 * 60_000
}

export class Mailer {
  private lastCallAt = 0

  constructor(
    private readonly admin: AdminClient,
    private readonly apiKey: string,
  ) {}

  /**
   * Queues emails (one row per recipient) in a single transaction and returns
   * the ids of rows that were newly queued; existing dedupe keys are skipped.
   * With `eventBatch`, the workflow events are marked processed atomically.
   */
  async enqueue(
    emails: OutgoingEmail[],
    eventBatch?: { id: string; outcome: 'sent' | 'skipped' },
  ): Promise<Map<string, string>> {
    if (emails.length === 0 && !eventBatch) return new Map()
    const { data, error } = await this.admin.rpc('enqueue_email_deliveries', {
      p_deliveries: emails.map((e) => ({
        kind: e.kind,
        dedupe_key: e.dedupeKey,
        recipient_id: e.recipient.id,
        recipient_email: e.recipient.email,
        subject: e.subject,
        body_html: e.html,
        body_text: e.text,
        scheduled_for: e.scheduledFor ?? null,
        triggered_by: e.triggeredBy ?? null,
        expires_at: e.expiresAt.toISOString(),
      })),
      p_event_batch_id: eventBatch?.id ?? null,
      p_event_outcome: eventBatch?.outcome ?? null,
    })
    if (error) throw new Error(`Could not queue emails: ${error.message}`)
    const inserted = new Map<string, string>()
    for (const row of (data ?? []) as { delivery_id: string; delivery_key: string }[]) {
      inserted.set(row.delivery_key, row.delivery_id)
    }
    return inserted
  }

  /**
   * Claims and sends due rows until none are left or `outOfTime()` is true.
   * With `ids`, only those rows are considered (test emails).
   */
  async processQueue(options: { outOfTime: () => boolean; ids?: string[] }): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = []
    while (!options.outOfTime()) {
      const { data, error } = await this.admin.rpc('claim_email_deliveries', {
        p_limit: CLAIM_BATCH,
        p_max_attempts: MAX_ATTEMPTS,
        p_ids: options.ids ?? null,
      })
      if (error) throw new Error(`Could not claim queued emails: ${error.message}`)
      const rows = (data ?? []) as DeliveryLogRow[]
      if (rows.length === 0) break
      for (const row of rows) {
        results.push({ id: row.id, email: row.recipient_email, result: await this.sendClaimed(row) })
      }
    }
    return results
  }

  /** Sends one claimed row. Never throws: problems are recorded on the row. */
  private async sendClaimed(row: DeliveryLogRow): Promise<DeliveryOutcome> {
    try {
      if (!(await this.recipientIsActive(row))) {
        const message = 'Not sent: the recipient was removed or disabled.'
        await this.finish(row.id, { status: 'skipped', error: message, retryable: false, clearBody: true })
        return { outcome: 'skipped', error: message }
      }
      return await this.send(row)
    } catch (err) {
      // Unknown state (e.g. database hiccup): retry later with the same key.
      const message = `Internal error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500)
      const willRetry = row.attempts < MAX_ATTEMPTS
      await this.finish(row.id, {
        status: 'failed',
        error: message,
        retryable: willRetry,
        nextAttemptAt: willRetry ? new Date(Date.now() + backoffMs(row.attempts)).toISOString() : null,
        clearBody: !willRetry,
      })
      return { outcome: 'failed', error: message, willRetry }
    }
  }

  /**
   * A listed recipient must still be active. An address that is not on the
   * recipient list (an assigned designer's account email) must belong to a
   * listed active recipient or to an active team account.
   */
  private async recipientIsActive(row: DeliveryLogRow): Promise<boolean> {
    let query = this.admin.from('email_recipients').select('id').eq('active', true)
    query = row.recipient_id ? query.eq('id', row.recipient_id) : query.eq('email', row.recipient_email)
    const { data, error } = await query.maybeSingle()
    if (error) throw new Error(`Could not check recipient: ${error.message}`)
    if (data !== null || row.recipient_id) return data !== null

    const { data: member, error: memberError } = await this.admin
      .from('team_members')
      .select('user_id')
      .eq('active', true)
      .ilike('email', row.recipient_email.replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle()
    if (memberError) throw new Error(`Could not check team member: ${memberError.message}`)
    return member !== null
  }

  private async send(row: DeliveryLogRow): Promise<DeliveryOutcome> {
    const wait = this.lastCallAt + resendMinIntervalMs() - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastCallAt = Date.now()

    const email = {
      from: emailFrom(),
      replyTo: emailReplyTo(),
      to: row.recipient_email,
      subject: row.subject,
      html: row.body_html ?? '',
      text: row.body_text ?? '',
    }
    const idempotencyKey = `tae-${await sha256Hex(row.dedupe_key)}`
    let result = await sendWithResend(this.apiKey, email, idempotencyKey)

    // One quick in-run retry for a short rate-limit wait.
    if (!result.ok && result.retryable && result.retryAfterMs !== undefined && result.retryAfterMs <= 5_000) {
      await sleep(result.retryAfterMs)
      this.lastCallAt = Date.now()
      result = await sendWithResend(this.apiKey, email, idempotencyKey)
    }

    if (result.ok) {
      await this.finish(row.id, { status: 'sent', messageId: result.id, clearBody: true })
      return { outcome: 'sent', messageId: result.id }
    }

    const willRetry = result.retryable && row.attempts < MAX_ATTEMPTS
    await this.finish(row.id, {
      status: 'failed',
      error: willRetry ? `${result.error} — will retry automatically.` : result.error,
      retryable: willRetry,
      nextAttemptAt: willRetry
        ? new Date(Date.now() + Math.max(backoffMs(row.attempts), result.retryAfterMs ?? 0)).toISOString()
        : null,
      clearBody: !willRetry,
    })
    return { outcome: 'failed', error: result.error, willRetry }
  }

  private async finish(
    logId: string,
    update: {
      status: 'sent' | 'failed' | 'skipped'
      messageId?: string
      error?: string
      retryable?: boolean
      nextAttemptAt?: string | null
      clearBody: boolean
    },
  ): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await this.admin
      .from('email_delivery_logs')
      .update({
        status: update.status,
        resend_message_id: update.messageId ?? null,
        error: update.error ?? null,
        retryable: update.retryable ?? false,
        next_attempt_at: update.nextAttemptAt ?? null,
        updated_at: now,
        ...(update.status === 'sent' ? { sent_at: now } : {}),
        ...(update.clearBody ? { body_html: null, body_text: null } : {}),
      })
      .eq('id', logId)
    // If this write fails the row stays 'sending'; it is re-claimed after
    // 10 minutes and re-sent with the same idempotency key, which Resend
    // deduplicates — so a logging failure cannot cause a duplicate email.
    if (error) console.error(`Could not record delivery ${logId}: ${error.message}`)
  }
}
