// email-send-test — sends the live progress digest, marked as a test, to
// chosen recipients. Called from the Email Reminders page.
//
// Authorization is checked here, server-side: the caller's Supabase access
// token must belong to a user whose team_members role is 'admin'. Emails can
// only go to active addresses already on the recipient list, never to an
// arbitrary address supplied by the request. Deploy with --no-verify-jwt; the
// token is verified below with Supabase Auth.
import 'jsr:@supabase/functions-js@2/edge-runtime.d.ts'
import { ConfigError, getResendApiKey } from '../_shared/config.ts'
import { RECIPIENT_COLUMNS, createAdminClient, loadPosts, loadSettings, type RecipientRow } from '../_shared/db.ts'
import { Mailer } from '../_shared/delivery.ts'
import { buildDigest } from '../_shared/emails.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'
import { safeAppUrl } from '../_shared/layout.ts'
import { formatInstant, localDateKey } from '../_shared/time.ts'

const MAX_RECIPIENTS = 20
/** Test emails per admin per 10 minutes. */
const RATE_LIMIT = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface TestRequest {
  recipientIds?: unknown
  requestId?: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorJson('Method not allowed', 405, corsHeaders)

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return errorJson('Sign in to send a test email.', 401, corsHeaders)

  try {
    const admin = createAdminClient()

    // 1. Who is calling? (Validates the JWT with Supabase Auth.)
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return errorJson('Your session has expired. Sign in again.', 401, corsHeaders)
    const userId = userData.user.id

    // 2. Are they a TAE admin?
    const { data: member, error: memberError } = await admin
      .from('team_members')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle<{ role: string }>()
    if (memberError) throw new Error(`Could not check team membership: ${memberError.message}`)
    if (member?.role !== 'admin') return errorJson('Only TAE administrators can send test emails.', 403, corsHeaders)

    // 3. Validate the request.
    let body: TestRequest
    try {
      body = await req.json()
    } catch {
      return errorJson('Invalid request body.', 400, corsHeaders)
    }
    const ids = Array.isArray(body.recipientIds) ? [...new Set(body.recipientIds)] : []
    if (ids.length === 0 || ids.length > MAX_RECIPIENTS || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
      return errorJson(`Choose between 1 and ${MAX_RECIPIENTS} recipients.`, 400, corsHeaders)
    }
    if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) {
      return errorJson('Invalid request id.', 400, corsHeaders)
    }
    const requestId = body.requestId

    const { data: recipientData, error: recipientError } = await admin
      .from('email_recipients')
      .select(RECIPIENT_COLUMNS)
      .in('id', ids as string[])
    if (recipientError) throw new Error(`Could not read recipients: ${recipientError.message}`)
    const recipients = (recipientData ?? []) as RecipientRow[]
    const inactive = recipients.filter((r) => !r.active)
    if (recipients.length !== ids.length) {
      return errorJson('One or more recipients no longer exist. Refresh the page.', 400, corsHeaders)
    }
    if (inactive.length > 0) {
      return errorJson(`Disabled recipients cannot be emailed: ${inactive.map((r) => r.email).join(', ')}`, 400, corsHeaders)
    }

    // 4. Rate limit per admin.
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const { count, error: countError } = await admin
      .from('email_delivery_logs')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'test')
      .eq('triggered_by', userId)
      .gte('created_at', since)
    if (countError) throw new Error(`Could not check the test email limit: ${countError.message}`)
    if ((count ?? 0) + recipients.length > RATE_LIMIT) {
      return errorJson('Too many test emails in the last 10 minutes. Please wait and try again.', 429, corsHeaders)
    }

    // 5. Build the live digest and send.
    const now = new Date()
    const settings = await loadSettings(admin)
    const email = buildDigest({
      posts: await loadPosts(admin),
      today: localDateKey(now),
      slotLabel: `test sent ${formatInstant(now)}`,
      appUrl: safeAppUrl(settings.app_url),
      test: true,
      now,
    })
    const mailer = new Mailer(admin, getResendApiKey())

    // One outbox row per recipient. The browser sends one requestId per click,
    // so a double-submit or a network retry of the same click cannot send twice.
    const queued = await mailer.enqueue(
      recipients.map((r) => ({
        kind: 'test',
        dedupeKey: `test:${requestId}:${r.email}`,
        recipient: { id: r.id, email: r.email },
        triggeredBy: userId,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        ...email,
      })),
    )
    const started = Date.now()
    const sent = await mailer.processQueue({ ids: [...queued.values()], outOfTime: () => Date.now() - started > 100_000 })
    const byId = new Map(sent.map((s) => [s.id, s.result]))

    const results = recipients.map((r) => {
      const id = queued.get(`test:${requestId}:${r.email}`)
      if (!id) return { email: r.email, outcome: 'duplicate' as const }
      const result = byId.get(id)
      // Not claimed here (e.g. picked up by a concurrent dispatcher run): it stays queued.
      return result ? { email: r.email, ...result } : { email: r.email, outcome: 'queued' as const }
    })
    return json({ ok: results.every((r) => r.outcome !== 'failed' && r.outcome !== 'skipped'), results }, 200, corsHeaders)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`email-send-test failed: ${message}`)
    return errorJson(err instanceof ConfigError ? message : 'The test email could not be sent. See the function logs.', 500, corsHeaders)
  }
})
