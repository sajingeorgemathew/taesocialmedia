// Minimal Resend client: one email per request, with an Idempotency-Key so a
// retried request for the same delivery is never sent twice.

const RESEND_URL = 'https://api.resend.com/emails'

export interface ResendEmail {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export type ResendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; retryable: boolean; retryAfterMs?: number }

function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export async function sendWithResend(apiKey: string, email: ResendEmail, idempotencyKey: string): Promise<ResendResult> {
  let response: Response
  try {
    response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    // Unknown whether Resend received it; the idempotency key makes a retry safe.
    return { ok: false, error: `Network error contacting Resend: ${truncate(String(err))}`, retryable: true }
  }

  let body: { id?: string; message?: string; name?: string } = {}
  try {
    body = await response.json()
  } catch {
    // Non-JSON body; fall through with the status code.
  }

  if (response.ok && body.id) return { ok: true, id: body.id }

  const detail = truncate(body.message || body.name || response.statusText || 'Unknown error')
  const status = response.status
  const retryAfter = Number(response.headers.get('retry-after'))
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined

  if (status === 429) {
    return { ok: false, error: `Resend rate limit (429): ${detail}`, retryable: true, retryAfterMs }
  }
  if (status === 409) {
    // concurrent_idempotent_requests is transient; invalid_idempotent_request is not.
    const retryable = /concurrent/i.test(body.name ?? '') || /in progress|concurrent/i.test(detail)
    return { ok: false, error: `Resend idempotency conflict (409): ${detail}`, retryable }
  }
  if (status >= 500) {
    return { ok: false, error: `Resend server error (${status}): ${detail}`, retryable: true }
  }
  if (status === 401 || status === 403) {
    return { ok: false, error: `Resend rejected the API key or sender domain (${status}): ${detail}`, retryable: false }
  }
  return { ok: false, error: `Resend error (${status}): ${detail}`, retryable: false }
}
