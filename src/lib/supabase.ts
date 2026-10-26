import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

/** Name of the private Storage bucket holding uploaded artwork. */
export const ARTWORK_BUCKET = 'social-media-assets'

/** Guards against pasting a server-only key into the browser build. */
function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  // Legacy JWT keys: the service_role key carries role "service_role".
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return decoded.role === 'service_role'
  } catch {
    return false
  }
}

export type SupabaseConfigProblem = 'missing' | 'secret-key' | null

export const supabaseConfigProblem: SupabaseConfigProblem = !url || !publishableKey
  ? 'missing'
  : looksLikeSecretKey(publishableKey)
    ? 'secret-key'
    : null

/**
 * The shared browser client. Only created when configuration is valid, so a
 * secret key is never used even if it was mistakenly put in .env.local.
 */
export const supabase: SupabaseClient | null =
  supabaseConfigProblem === null
    ? createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null

/** The client for code that only runs once configuration has been checked. */
export function getSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}
