// Plain data shapes shared by the email Edge Functions (no runtime imports).

export type PostStatus = 'Planned' | 'In Design' | 'Ready for Review' | 'Approved' | 'Published'

export const STATUSES: PostStatus[] = ['Planned', 'In Design', 'Ready for Review', 'Approved', 'Published']

export interface PostRow {
  id: string
  title: string
  program: string
  publish_date: string
  status: PostStatus
  designer: string
  platforms: string[]
  updated_at: string
}

export interface NotificationEventRow {
  id: number
  post_id: string
  event_type: 'assignment' | 'ready_for_review' | 'approved'
  details: Record<string, unknown>
  created_at: string
}
