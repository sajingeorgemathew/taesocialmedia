import { PROGRAM_SHORT, type PostStatus, type SocialPost } from '../types'
import { formatLongDate } from '../utils/date'
import { designerLabel, isOverdue, sortByDate } from '../utils/posts'
import { StatusSelect } from './StatusBadge'

interface PostListProps {
  posts: SocialPost[]
  today: string
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  /** Statuses the signed-in person may choose for a post. */
  statusOptions: (post: SocialPost) => readonly PostStatus[]
  /** Omitted for people who cannot create or delete posts. */
  onDuplicate?: (post: SocialPost) => void
  onDelete?: (post: SocialPost) => void
}

/** Every post, including published history, in chronological order. */
export function PostList({ posts, today, onOpen, onStatusChange, statusOptions, onDuplicate, onDelete }: PostListProps) {
  if (posts.length === 0) {
    return <p className="empty-state">No posts match the current filters.</p>
  }

  return (
    <ul className="post-list" aria-label="All posts">
      {sortByDate(posts).map((post) => {
        const overdue = isOverdue(post, today)
        return (
          <li key={post.id} className={`post-row${post.status === 'Published' ? ' is-published' : ''}`}>
            <div className="post-row-date">
              <span>{formatLongDate(post.publishDate)}</span>
              {overdue && <span className="pill pill-danger">Overdue</span>}
            </div>
            <button type="button" className="post-row-main" onClick={() => onOpen(post)}>
              <span className="post-row-title">{post.title}</span>
              <span className="post-row-meta">
                {PROGRAM_SHORT[post.program]} · {post.format} · {post.platforms.join(', ') || 'No platforms'}
                {' · '}
                {designerLabel(post)}
              </span>
            </button>
            <div className="post-row-status">
              <StatusSelect
                status={post.status}
                options={statusOptions(post)}
                onChange={(status) => onStatusChange(post, status)}
              />
            </div>
            <div className="post-row-actions">
              <button type="button" className="button button-ghost button-small" onClick={() => onOpen(post)}>
                {onDelete ? 'Edit' : 'Open'}
              </button>
              {onDuplicate && (
                <button type="button" className="button button-ghost button-small" onClick={() => onDuplicate(post)}>
                  Duplicate
                </button>
              )}
              {onDelete && (
                <button type="button" className="button button-ghost button-small button-danger-text" onClick={() => onDelete(post)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
