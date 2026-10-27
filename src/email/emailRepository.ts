import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import { toAppError } from '../storage/supabasePostRepository'
import type {
  DeliveryLog,
  EmailRecipient,
  EmailSchedule,
  EmailSettings,
  IsoWeekday,
  TestSendResult,
} from './types'

/** Row shape of public.email_settings (see supabase/migrations). */
interface SettingsRow {
  paused: boolean
  digest_enabled: boolean
  digest_weekdays: IsoWeekday[]
  app_url: string
  notify_assignment: boolean
  notify_ready_for_review: boolean
  notify_approved: boolean
  notify_deadline: boolean
  notify_changes_requested: boolean
  deadline_days_ahead: number
  deadline_reminder_time: string
  updated_at: string
}

interface RecipientRow {
  id: string
  email: string
  name: string
  active: boolean
  receives_digest: boolean
  receives_notifications: boolean
  receives_assignments: boolean
  designer_name: string
  created_at: string
}

interface ScheduleRow {
  id: string
  send_time: string
  label: string
  active: boolean
}

interface LogRow {
  id: string
  kind: DeliveryLog['kind']
  recipient_email: string
  subject: string
  status: DeliveryLog['status']
  attempts: number
  retryable: boolean
  next_attempt_at: string | null
  resend_message_id: string | null
  error: string | null
  scheduled_for: string | null
  created_at: string
  sent_at: string | null
}

const RECIPIENT_COLUMNS =
  'id, email, name, active, receives_digest, receives_notifications, receives_assignments, designer_name, created_at'
const SCHEDULE_COLUMNS = 'id, send_time, label, active'
// Never select the stored email bodies; authenticated users cannot read them anyway.
const LOG_COLUMNS =
  'id, kind, recipient_email, subject, status, attempts, retryable, next_attempt_at, resend_message_id, error, scheduled_for, created_at, sent_at'

const hhmm = (time: string) => time.slice(0, 5)

function settingsFromRow(row: SettingsRow): EmailSettings {
  return {
    paused: row.paused,
    digestEnabled: row.digest_enabled,
    digestWeekdays: [...row.digest_weekdays].sort((a, b) => a - b),
    appUrl: row.app_url,
    notifyAssignment: row.notify_assignment,
    notifyReadyForReview: row.notify_ready_for_review,
    notifyApproved: row.notify_approved,
    notifyDeadline: row.notify_deadline,
    // Undefined until the Feature 4 migration has run.
    notifyChangesRequested: row.notify_changes_requested ?? false,
    deadlineDaysAhead: row.deadline_days_ahead,
    deadlineReminderTime: hhmm(row.deadline_reminder_time),
    updatedAt: row.updated_at,
  }
}

const SETTINGS_COLUMNS: Record<Exclude<keyof EmailSettings, 'updatedAt'>, keyof SettingsRow> = {
  paused: 'paused',
  digestEnabled: 'digest_enabled',
  digestWeekdays: 'digest_weekdays',
  appUrl: 'app_url',
  notifyAssignment: 'notify_assignment',
  notifyReadyForReview: 'notify_ready_for_review',
  notifyApproved: 'notify_approved',
  notifyDeadline: 'notify_deadline',
  notifyChangesRequested: 'notify_changes_requested',
  deadlineDaysAhead: 'deadline_days_ahead',
  deadlineReminderTime: 'deadline_reminder_time',
}

function recipientFromRow(row: RecipientRow): EmailRecipient {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    active: row.active,
    receivesDigest: row.receives_digest,
    receivesNotifications: row.receives_notifications,
    receivesAssignments: row.receives_assignments,
    designerName: row.designer_name,
    createdAt: row.created_at,
  }
}

function scheduleFromRow(row: ScheduleRow): EmailSchedule {
  return { id: row.id, sendTime: hhmm(row.send_time), label: row.label, active: row.active }
}

function logFromRow(row: LogRow): DeliveryLog {
  return {
    id: row.id,
    kind: row.kind,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    status: row.status,
    attempts: row.attempts,
    retryable: row.retryable,
    nextAttemptAt: row.next_attempt_at,
    resendMessageId: row.resend_message_id,
    error: row.error,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }
}

/** Friendlier messages for the email tables' constraints. */
function emailError(error: { message: string; code?: string }, context: 'recipient' | 'schedule' | 'settings'): Error {
  if (error.code === '23505') {
    if (/designer_name/.test(error.message)) return new Error('That designer is already linked to another recipient.')
    return new Error(context === 'recipient' ? 'That email address is already on the list.' : 'That sending time already exists.')
  }
  if (error.code === '23514') {
    if (context === 'recipient') return new Error('Please enter a valid email address.')
    if (context === 'settings') return new Error('Please check the values. The application link must start with https://.')
  }
  if (error.code === '42P01' || /could not find the table/i.test(error.message)) {
    return new Error('Email reminders are not set up yet. Run the Feature 3 migration (see RESEND_SETUP.md).')
  }
  return toAppError(error)
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Trims and collapses spaces; matching against posts is case-insensitive. */
export function normalizeDesignerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

export interface EmailConfig {
  settings: EmailSettings
  recipients: EmailRecipient[]
  schedules: EmailSchedule[]
}

export async function loadEmailConfig(): Promise<EmailConfig> {
  const db = getSupabase()
  const [settings, recipients, schedules] = await Promise.all([
    db.from('email_settings').select('*').eq('id', 1).maybeSingle<SettingsRow>(),
    db.from('email_recipients').select(RECIPIENT_COLUMNS).order('created_at', { ascending: true }),
    db.from('email_schedules').select(SCHEDULE_COLUMNS).order('send_time', { ascending: true }),
  ])
  if (settings.error) throw emailError(settings.error, 'settings')
  if (recipients.error) throw emailError(recipients.error, 'recipient')
  if (schedules.error) throw emailError(schedules.error, 'schedule')
  if (!settings.data) throw new Error('Email settings were not found. Run the Feature 3 migration (see RESEND_SETUP.md).')
  return {
    settings: settingsFromRow(settings.data),
    recipients: ((recipients.data ?? []) as RecipientRow[]).map(recipientFromRow),
    schedules: ((schedules.data ?? []) as ScheduleRow[]).map(scheduleFromRow),
  }
}

export async function updateEmailSettings(patch: Partial<Omit<EmailSettings, 'updatedAt'>>): Promise<EmailSettings> {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    row[SETTINGS_COLUMNS[key as keyof typeof SETTINGS_COLUMNS]] = value
  }
  const { data, error } = await getSupabase()
    .from('email_settings')
    .update(row)
    .eq('id', 1)
    .select('*')
    .maybeSingle<SettingsRow>()
  if (error) throw emailError(error, 'settings')
  if (!data) throw new Error('You do not have permission to change email settings.')
  return settingsFromRow(data)
}

export async function addRecipient(email: string, name: string): Promise<EmailRecipient> {
  const { data, error } = await getSupabase()
    .from('email_recipients')
    .insert({ email: normalizeEmail(email), name: name.trim() })
    .select(RECIPIENT_COLUMNS)
    .single<RecipientRow>()
  if (error) throw emailError(error, 'recipient')
  return recipientFromRow(data)
}

export async function updateRecipient(
  id: string,
  patch: Partial<
    Pick<EmailRecipient, 'name' | 'active' | 'receivesDigest' | 'receivesNotifications' | 'receivesAssignments' | 'designerName'>
  >,
): Promise<EmailRecipient> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.active !== undefined) row.active = patch.active
  if (patch.receivesDigest !== undefined) row.receives_digest = patch.receivesDigest
  if (patch.receivesNotifications !== undefined) row.receives_notifications = patch.receivesNotifications
  if (patch.receivesAssignments !== undefined) row.receives_assignments = patch.receivesAssignments
  if (patch.designerName !== undefined) row.designer_name = normalizeDesignerName(patch.designerName)
  const { data, error } = await getSupabase()
    .from('email_recipients')
    .update(row)
    .eq('id', id)
    .select(RECIPIENT_COLUMNS)
    .maybeSingle<RecipientRow>()
  if (error) throw emailError(error, 'recipient')
  if (!data) throw new Error('This recipient no longer exists. Refresh the page.')
  return recipientFromRow(data)
}

export async function deleteRecipient(id: string): Promise<void> {
  const { error } = await getSupabase().from('email_recipients').delete().eq('id', id)
  if (error) throw emailError(error, 'recipient')
}

export async function addSchedule(sendTime: string, label: string): Promise<EmailSchedule> {
  const { data, error } = await getSupabase()
    .from('email_schedules')
    .insert({ send_time: sendTime, label: label.trim() })
    .select(SCHEDULE_COLUMNS)
    .single<ScheduleRow>()
  if (error) throw emailError(error, 'schedule')
  return scheduleFromRow(data)
}

export async function updateSchedule(
  id: string,
  patch: Partial<Pick<EmailSchedule, 'sendTime' | 'label' | 'active'>>,
): Promise<EmailSchedule> {
  const row: Record<string, unknown> = {}
  if (patch.sendTime !== undefined) row.send_time = patch.sendTime
  if (patch.label !== undefined) row.label = patch.label.trim()
  if (patch.active !== undefined) row.active = patch.active
  const { data, error } = await getSupabase()
    .from('email_schedules')
    .update(row)
    .eq('id', id)
    .select(SCHEDULE_COLUMNS)
    .maybeSingle<ScheduleRow>()
  if (error) throw emailError(error, 'schedule')
  if (!data) throw new Error('This sending time no longer exists. Refresh the page.')
  return scheduleFromRow(data)
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await getSupabase().from('email_schedules').delete().eq('id', id)
  if (error) throw emailError(error, 'schedule')
}

export async function listDeliveryLogs(limit = 100): Promise<DeliveryLog[]> {
  const { data, error } = await getSupabase()
    .from('email_delivery_logs')
    .select(LOG_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw emailError(error, 'settings')
  return ((data ?? []) as LogRow[]).map(logFromRow)
}

/**
 * Asks the email-send-test Edge Function to send the live digest. The
 * function verifies admin membership itself; `requestId` makes a repeated
 * submission of the same click idempotent.
 */
export async function sendTestEmail(recipientIds: string[], requestId: string): Promise<TestSendResult[]> {
  const { data, error } = await getSupabase().functions.invoke<{ results?: TestSendResult[] }>('email-send-test', {
    body: { recipientIds, requestId },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let message = ''
      try {
        const body = (await error.context.json()) as { error?: string }
        message = body.error ?? ''
      } catch {
        // Not JSON; use the generic message below.
      }
      throw new Error(message || 'The test email could not be sent.')
    }
    if (/failed to send a request|fetch/i.test(error.message)) {
      throw new Error('Could not reach the email-send-test function. Has it been deployed? See RESEND_SETUP.md.')
    }
    throw toAppError(error)
  }
  return data?.results ?? []
}
