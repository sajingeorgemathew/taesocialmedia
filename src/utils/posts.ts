import {
  STATUSES,
  type PostDraft,
  type PostFilters,
  type PostStatus,
  type SocialPost,
} from '../types'

export function statusSlug(status: PostStatus): string {
  return status.toLowerCase().replace(/\s+/g, '-')
}

export function nextStatus(status: PostStatus): PostStatus | null {
  const index = STATUSES.indexOf(status)
  return index < STATUSES.length - 1 ? STATUSES[index + 1] : null
}

/**
 * The designer shown on a post. A name without an account is a legacy name
 * typed before designer accounts; unfinished ones are flagged for an admin.
 */
export function designerLabel(post: SocialPost, unassigned = 'Unassigned'): string {
  if (!post.designer) return unassigned
  if (post.designerId || post.status === 'Published') return post.designer
  return `${post.designer} (not linked)`
}

export function isDone(post: SocialPost): boolean {
  return post.status === 'Published'
}

export function isOverdue(post: SocialPost, today: string): boolean {
  return !isDone(post) && post.publishDate < today
}

export function sortByDate(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort(
    (a, b) =>
      a.publishDate.localeCompare(b.publishDate) ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

export function filterPosts(posts: SocialPost[], filters: PostFilters): SocialPost[] {
  return posts.filter(
    (post) =>
      (filters.program === 'All' || post.program === filters.program) &&
      (filters.status === 'All' || post.status === filters.status) &&
      (filters.platform === 'All' || post.platforms.includes(filters.platform)),
  )
}

export function hasActiveFilters(filters: PostFilters): boolean {
  return filters.program !== 'All' || filters.status !== 'All' || filters.platform !== 'All'
}

/**
 * Unfinished posts in chronological order. Overdue items have the earliest
 * dates, so they naturally sit at the front of the queue.
 */
export function getWorkQueue(posts: SocialPost[]): SocialPost[] {
  return sortByDate(posts.filter((post) => !isDone(post)))
}

export function getNextUp(posts: SocialPost[]): SocialPost | null {
  return getWorkQueue(posts)[0] ?? null
}

export interface PostStats {
  total: number
  overdue: number
  byStatus: Record<PostStatus, number>
}

export function computeStats(posts: SocialPost[], today: string): PostStats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    PostStatus,
    number
  >
  let overdue = 0
  for (const post of posts) {
    byStatus[post.status] += 1
    if (isOverdue(post, today)) overdue += 1
  }
  return { total: posts.length, overdue, byStatus }
}

export function createEmptyDraft(publishDate: string): PostDraft {
  return {
    title: '',
    publishDate,
    program: 'General TAE Marketing',
    platforms: ['Facebook', 'Instagram'],
    format: 'Static Photo',
    caption: '',
    creativeWording: '',
    designBrief: '',
    reelScript: '',
    designerId: null,
    status: 'Planned',
    notes: '',
    artworkUrl: '',
    publishedUrl: '',
  }
}

/** The editable fields of a saved post. */
export function toDraft(post: SocialPost): PostDraft {
  return {
    title: post.title,
    publishDate: post.publishDate,
    program: post.program,
    platforms: [...post.platforms],
    format: post.format,
    caption: post.caption,
    creativeWording: post.creativeWording,
    designBrief: post.designBrief,
    reelScript: post.reelScript,
    designerId: post.designerId,
    status: post.status,
    notes: post.notes,
    artworkUrl: post.artworkUrl,
    publishedUrl: post.publishedUrl,
  }
}

/** A copy of an existing post that restarts the workflow. */
export function duplicateDraft(post: SocialPost): PostDraft {
  return {
    ...toDraft(post),
    title: `${post.title} (Copy)`,
    status: 'Planned',
    publishedUrl: '',
  }
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
