// What the signed-in person may do with a post. These rules only shape the
// UI; the database enforces the same rules (RLS and the posts_workflow_rules
// trigger), so a hidden button is never the only protection.
import type { TeamMember } from '../auth/authContext'
import { STATUSES, type PostStatus, type SocialPost } from '../types'

/** Statuses a designer can set, and the only ones in which they can edit. */
export const DESIGNER_STATUSES: readonly PostStatus[] = ['Planned', 'In Design', 'Ready for Review']

export function isAdmin(member: TeamMember): boolean {
  return member.role === 'admin'
}

/**
 * Admins edit everything. Designers collaborate on every unfinished post —
 * the assigned designer is the primary responsibility, not exclusive access.
 * Approved and Published posts are read-only until an admin reopens them.
 */
export function canEditPost(member: TeamMember, post: SocialPost): boolean {
  return isAdmin(member) || DESIGNER_STATUSES.includes(post.status)
}

/** Statuses this person may move the post to (always includes the current one). */
export function statusOptions(member: TeamMember, post: SocialPost): readonly PostStatus[] {
  if (isAdmin(member)) return STATUSES
  return canEditPost(member, post) ? DESIGNER_STATUSES : [post.status]
}

/** Admins approve or request changes on posts that are waiting for review (or already approved). */
export function canReview(member: TeamMember, post: SocialPost): boolean {
  return isAdmin(member) && (post.status === 'Ready for Review' || post.status === 'Approved')
}
