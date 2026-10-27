// Service-role database access for the email Edge Functions. The service role
// bypasses RLS, so this client must never be exposed to callers.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { serviceRoleKey, supabaseUrl } from './config.ts'
import type { PostRow, TeamMemberRow } from './model.ts'

export type AdminClient = SupabaseClient

export function createAdminClient(): AdminClient {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export type { NotificationEventRow, PostRow, PostStatus, TeamMemberRow } from './model.ts'

export interface SettingsRow {
  paused: boolean
  digest_enabled: boolean
  digest_weekdays: number[]
  timezone: string
  app_url: string
  notify_assignment: boolean
  notify_ready_for_review: boolean
  notify_approved: boolean
  notify_deadline: boolean
  notify_changes_requested: boolean
  deadline_days_ahead: number
  deadline_reminder_time: string
}

export interface RecipientRow {
  id: string
  email: string
  name: string
  active: boolean
  receives_digest: boolean
  receives_notifications: boolean
  receives_assignments: boolean
  designer_name: string
}

export interface ScheduleRow {
  id: string
  send_time: string
  label: string
  active: boolean
  updated_at: string
}

export interface DeliveryLogRow {
  id: string
  kind: 'digest' | 'test' | 'notification' | 'deadline'
  dedupe_key: string
  recipient_id: string | null
  recipient_email: string
  subject: string
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
  attempts: number
  body_html: string | null
  body_text: string | null
}

export async function loadSettings(admin: AdminClient): Promise<SettingsRow> {
  const { data, error } = await admin.from('email_settings').select('*').eq('id', 1).maybeSingle<SettingsRow>()
  if (error) throw new Error(`Could not read email settings: ${error.message}`)
  if (!data) throw new Error('email_settings has no row. Run the Feature 3 migration.')
  return data
}

export async function loadPosts(admin: AdminClient): Promise<PostRow[]> {
  const { data, error } = await admin
    .from('posts')
    .select('id, title, program, publish_date, status, designer, designer_id, review_note, changes_requested_at, platforms, updated_at')
    .order('publish_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5000)
  if (error) throw new Error(`Could not read posts: ${error.message}`)
  return (data ?? []) as PostRow[]
}

export const RECIPIENT_COLUMNS =
  'id, email, name, active, receives_digest, receives_notifications, receives_assignments, designer_name'

export async function loadActiveRecipients(admin: AdminClient): Promise<RecipientRow[]> {
  const { data, error } = await admin
    .from('email_recipients')
    .select(RECIPIENT_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read email recipients: ${error.message}`)
  return (data ?? []) as RecipientRow[]
}

/** Active TAE accounts; assigned designers are emailed at their account address. */
export async function loadActiveTeamMembers(admin: AdminClient): Promise<TeamMemberRow[]> {
  const { data, error } = await admin
    .from('team_members')
    .select('user_id, email, display_name, role, active')
    .eq('active', true)
  if (error) throw new Error(`Could not read team members: ${error.message}`)
  return (data ?? []) as TeamMemberRow[]
}
