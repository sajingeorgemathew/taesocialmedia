// Server-side configuration for the email Edge Functions.
// Secrets are read from Supabase Edge Function secrets and never logged.

/**
 * The Resend API key is read from the Edge Function secret NAMED by
 * RESEND_API_KEY_SECRET_NAME. When that is not set, the secret called
 * RESEND_API_KEY is used. This lets the project keep its existing secret name
 * without copying or overwriting the key.
 */
export const DEFAULT_RESEND_SECRET_NAME = 'RESEND_API_KEY'

export const DEFAULT_EMAIL_FROM = 'TAE Social Media Manager <notifications@mail.portal-torontoacademy.ca>'

/** A deployment problem the admin must fix; the message is safe to show. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim()
}

export function resendSecretName(): string {
  const name = env('RESEND_API_KEY_SECRET_NAME') || DEFAULT_RESEND_SECRET_NAME
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new ConfigError('RESEND_API_KEY_SECRET_NAME must be the name of an Edge Function secret (letters, digits, underscores).')
  }
  return name
}

export function getResendApiKey(): string {
  const name = resendSecretName()
  const key = env(name)
  if (!key) {
    throw new ConfigError(
      `The Edge Function secret "${name}" is not set. Confirm the name of the existing Resend secret and set RESEND_API_KEY_SECRET_NAME to it (see RESEND_SETUP.md).`,
    )
  }
  return key
}

export function emailFrom(): string {
  return env('EMAIL_FROM') || DEFAULT_EMAIL_FROM
}

export function emailReplyTo(): string | undefined {
  return env('EMAIL_REPLY_TO') || undefined
}

/** Minimum gap between Resend API calls, to stay under the account rate limit. */
export function resendMinIntervalMs(): number {
  const value = Number(env('RESEND_MIN_INTERVAL_MS'))
  return Number.isFinite(value) && value >= 0 ? value : 600
}

export function cronSecret(): string {
  const secret = env('EMAIL_CRON_SECRET')
  if (secret.length < 32) {
    throw new ConfigError('EMAIL_CRON_SECRET is missing or shorter than 32 characters.')
  }
  return secret
}

export function supabaseUrl(): string {
  const url = env('SUPABASE_URL')
  if (!url) throw new ConfigError('SUPABASE_URL is not available to the function.')
  return url
}

/**
 * The server-side Supabase key, injected by the platform (never sent to the
 * browser). Uses the legacy service_role key when present, otherwise the
 * default key from SUPABASE_SECRET_KEYS (projects on the newer API keys).
 */
export function serviceRoleKey(): string {
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  const secretKeys = env('SUPABASE_SECRET_KEYS')
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>
      const key = parsed.default ?? Object.values(parsed)[0]
      if (typeof key === 'string' && key) return key
    } catch {
      // Fall through to the error below without echoing the value.
    }
  }
  throw new ConfigError('No server-side Supabase key is available to the function (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEYS).')
}
