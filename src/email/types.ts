/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAYS: { value: IsoWeekday; short: string; long: string }[] = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 7, short: 'Sun', long: 'Sunday' },
]

export const EMAIL_TIME_ZONE = 'America/Toronto'
export const EMAIL_SENDER = 'TAE Social Media Manager <notifications@mail.portal-torontoacademy.ca>'

export interface EmailSettings {
  paused: boolean
  digestEnabled: boolean
  digestWeekdays: IsoWeekday[]
  appUrl: string
  notifyAssignment: boolean
  notifyReadyForReview: boolean
  notifyApproved: boolean
  notifyDeadline: boolean
  notifyChangesRequested: boolean
  deadlineDaysAhead: number
  /** HH:MM, America/Toronto. */
  deadlineReminderTime: string
  updatedAt: string
}

export interface EmailRecipient {
  id: string
  email: string
  name: string
  active: boolean
  /** Scheduled progress digests. */
  receivesDigest: boolean
  /** Ready for Review / Approved notifications and deadline reminders. */
  receivesNotifications: boolean
  /** A copy of every assignment notification (designers are emailed at their account address). */
  receivesAssignments: boolean
  /** Legacy (Feature 3) link to a typed designer name; only used to link old posts to accounts. */
  designerName: string
  createdAt: string
}

export interface EmailSchedule {
  id: string
  /** HH:MM, America/Toronto. */
  sendTime: string
  label: string
  active: boolean
}

export type DeliveryKind = 'digest' | 'test' | 'notification' | 'deadline'
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'

export interface DeliveryLog {
  id: string
  kind: DeliveryKind
  recipientEmail: string
  subject: string
  status: DeliveryStatus
  attempts: number
  retryable: boolean
  nextAttemptAt: string | null
  resendMessageId: string | null
  error: string | null
  scheduledFor: string | null
  createdAt: string
  sentAt: string | null
}

export interface TestSendResult {
  email: string
  outcome: 'sent' | 'duplicate' | 'queued' | 'failed' | 'skipped'
  messageId?: string
  error?: string
  willRetry?: boolean
}
