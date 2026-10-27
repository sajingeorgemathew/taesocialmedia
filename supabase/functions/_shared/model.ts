// Plain data shapes shared by the email Edge Functions (no runtime imports).

export type PostStatus = 'Planned' | 'In Design' | 'Ready for Review' | 'Approved' | 'Published'

export const STATUSES: PostStatus[] = ['Planned', 'In Design', 'Ready for Review', 'Approved', 'Published']

export interface PostRow {
  id: string
  title: string
  program: string
  publish_date: string
  status: PostStatus
  /** Display name of the assigned designer (or a legacy, unlinked name). */
  designer: string
  /** Assigned designer account (team_members.user_id), if any. */
  designer_id: string | null
  /** Latest "Request changes" feedback. */
  review_note: string
  changes_requested_at: string | null
  platforms: string[]
  updated_at: string
}

export type NotificationEventType = 'assignment' | 'ready_for_review' | 'approved' | 'changes_requested'

export interface NotificationEventRow {
  id: number
  post_id: string
  event_type: NotificationEventType
  details: Record<string, unknown>
  actor: string | null
  created_at: string
}

/** A TAE account (public.team_members); designers are emailed at this address. */
export interface TeamMemberRow {
  user_id: string
  email: string
  display_name: string
  role: 'admin' | 'designer'
  active: boolean
}
